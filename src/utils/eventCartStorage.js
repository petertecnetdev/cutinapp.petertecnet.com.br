import {
  safeGetLocalJson,
  safeGetSessionJson,
  safeRemoveLocalItem,
  safeRemoveSessionItem,
  safeSetLocalJson,
  safeSetSessionJson,
} from "./safeStorage";
import { clearCheckoutRecovery, readCheckoutRecovery, writeCheckoutRecovery } from "./checkoutRecovery";

const CART_PREFIX = "cutinapp_checkout_";
const CART_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const PAYMENT_PREFIX = "cutinapp_payment_";
const normalizeSlug = (slug) => String(slug || "").trim();
const keyFor = (slug) => `${CART_PREFIX}${normalizeSlug(slug)}`;

export const isFulfilledCheckoutResult = (result) => String(result?.order?.status || "").toLowerCase() === "paid"
  && String(result?.order?.metadata?.fulfillment_status || "").toLowerCase() === "completed";

const positiveInteger = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.floor(parsed);
};

const isExpired = (cart) => {
  const savedAt = Number(cart?.savedAt || 0);
  return savedAt > 0 && Date.now() - savedAt > CART_MAX_AGE_MS;
};

const newestCart = (sessionCart, persistentCart) => {
  if (!sessionCart) return persistentCart;
  if (!persistentCart) return sessionCart;

  const sessionSavedAt = Number(sessionCart?.savedAt || 0);
  const persistentSavedAt = Number(persistentCart?.savedAt || 0);
  // localStorage is the cross-tab source of truth. Prefer it on timestamp ties too:
  // two writes can happen in the same millisecond while another tab still holds a
  // different sessionStorage snapshot with the exact same savedAt value.
  return persistentSavedAt >= sessionSavedAt ? persistentCart : sessionCart;
};

export const mergeEventCartTickets = (currentSelection = {}, additions = []) => {
  const ticketMap = new Map();
  (Array.isArray(currentSelection?.tickets) ? currentSelection.tickets : []).forEach((ticket) => {
    const id = positiveInteger(ticket?.id);
    const quantity = positiveInteger(ticket?.quantity);
    if (id && quantity) ticketMap.set(id, { id, quantity });
  });

  let addedQuantity = 0;
  (Array.isArray(additions) ? additions : []).forEach((ticket) => {
    const id = positiveInteger(ticket?.id);
    const requested = positiveInteger(ticket?.quantity);
    if (!id || !requested) return;

    const currentQuantity = positiveInteger(ticketMap.get(id)?.quantity);
    const requestedMax = positiveInteger(ticket?.maxQuantity);
    const maxQuantity = requestedMax || (currentQuantity + requested);
    const nextQuantity = Math.min(maxQuantity, currentQuantity + requested);
    addedQuantity += Math.max(0, nextQuantity - currentQuantity);
    if (nextQuantity > 0) ticketMap.set(id, { id, quantity: nextQuantity });
  });

  const items = (Array.isArray(currentSelection?.items) ? currentSelection.items : [])
    .map((item) => ({ id: positiveInteger(item?.id), quantity: positiveInteger(item?.quantity) }))
    .filter((item) => item.id && item.quantity);
  const tickets = [...ticketMap.values()];
  const itemCount = [...tickets, ...items].reduce((sum, item) => sum + item.quantity, 0);

  return {
    selection: { ...currentSelection, tickets, items },
    addedQuantity,
    itemCount,
  };
};

export const clearEventCart = (slug) => {
  const normalizedSlug = normalizeSlug(slug);
  const key = keyFor(normalizedSlug);
  const paymentKey = `${PAYMENT_PREFIX}${normalizedSlug}`;
  const persistedPayment = safeGetSessionJson(paymentKey);
  const recovery = readCheckoutRecovery(normalizedSlug);
  safeRemoveSessionItem(key);

  // Keep a short-lived shared tombstone instead of deleting localStorage outright.
  // Otherwise another open tab can read its stale sessionStorage cart and mirror it
  // back into localStorage, resurrecting items the participant already removed.
  safeSetLocalJson(key, { cleared: true, savedAt: Date.now() });

  if (isFulfilledCheckoutResult(persistedPayment)) {
    safeRemoveSessionItem(paymentKey);
    clearCheckoutRecovery(normalizedSlug);
  } else if (!recovery?.orderPublicId) {
    clearCheckoutRecovery(normalizedSlug);
  }
  try {
    window.dispatchEvent(new CustomEvent("cutinapp-cart-updated", {
      detail: { slug: normalizedSlug, cart: null },
    }));
  } catch (_) {
    // Storage is best-effort in restricted browsers/webviews.
  }
};

export const readEventCart = (slug) => {
  const key = keyFor(slug);
  const sessionCart = safeGetSessionJson(key);
  const persistentCart = safeGetLocalJson(key);
  const cart = newestCart(sessionCart, persistentCart);

  if (!cart) return null;
  if (isExpired(cart)) {
    safeRemoveSessionItem(key);
    safeRemoveLocalItem(key);
    return null;
  }

  // A shared clear marker must beat stale tab-scoped sessionStorage. Keep the marker
  // in localStorage until it ages out so any still-open tab observes the deletion.
  if (cart?.cleared === true) {
    safeRemoveSessionItem(key);
    return null;
  }

  // localStorage is shared by tabs while sessionStorage is tab-scoped. A cart changed
  // in another tab must win over this tab's stale snapshot; mirror the winner back so
  // subsequent reads and checkout submission use the same quantities.
  if (cart === persistentCart && cart !== sessionCart) safeSetSessionJson(key, cart);
  if (cart === sessionCart && cart !== persistentCart) safeSetLocalJson(key, cart);
  return cart;
};

export const writeEventCart = (slug, selection) => {
  const normalizedSlug = normalizeSlug(slug);
  if (!selection) {
    clearEventCart(normalizedSlug);
    return null;
  }

  const key = keyFor(normalizedSlug);
  const cart = { ...selection, savedAt: Date.now() };
  safeSetSessionJson(key, cart);
  safeSetLocalJson(key, cart);

  const recovery = readCheckoutRecovery(normalizedSlug);
  if (!recovery?.orderPublicId) {
    writeCheckoutRecovery(normalizedSlug, {
      selection: cart,
      orderPublicId: null,
      couponCode: recovery?.couponCode || null,
      paymentMethod: recovery?.paymentMethod || null,
    });
  }

  try {
    window.dispatchEvent(new CustomEvent("cutinapp-cart-updated", {
      detail: { slug: normalizedSlug, cart },
    }));
  } catch (_) {
    // Storage is best-effort in restricted browsers/webviews.
  }

  return cart;
};
