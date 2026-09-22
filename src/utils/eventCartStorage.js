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
const keyFor = (slug) => `${CART_PREFIX}${String(slug || "").trim()}`;

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
  return persistentSavedAt > sessionSavedAt ? persistentCart : sessionCart;
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
  const normalizedSlug = String(slug || "").trim();
  const key = keyFor(normalizedSlug);
  const paymentKey = `${PAYMENT_PREFIX}${normalizedSlug}`;
  const persistedPayment = safeGetSessionJson(paymentKey);
  const recovery = readCheckoutRecovery(normalizedSlug);
  safeRemoveSessionItem(key);
  safeRemoveLocalItem(key);

  // A fulfilled purchase is terminal: keep the success screen in React state, but do not
  // leave it resumable in storage where it can compete with the participant's next purchase.
  if (isFulfilledCheckoutResult(persistedPayment)) {
    safeRemoveSessionItem(paymentKey);
    clearCheckoutRecovery(normalizedSlug);
  } else if (!recovery?.orderPublicId) {
    // A cart without an order is only a draft selection. When the user empties it,
    // its recovery snapshot must disappear too or it can recreate removed items later.
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
    clearEventCart(slug);
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
  if (!selection) {
    clearEventCart(slug);
    return null;
  }

  const key = keyFor(slug);
  const cart = { ...selection, savedAt: Date.now() };
  safeSetSessionJson(key, cart);
  safeSetLocalJson(key, cart);

  const recovery = readCheckoutRecovery(slug);
  if (!recovery?.orderPublicId) {
    // Keep the recovery snapshot in lockstep with the canonical cart. This prevents
    // stale checkout data from restoring quantities the participant already removed.
    writeCheckoutRecovery(slug, {
      selection: cart,
      orderPublicId: null,
      couponCode: recovery?.couponCode || null,
      paymentMethod: recovery?.paymentMethod || null,
    });
  }

  try {
    window.dispatchEvent(new CustomEvent("cutinapp-cart-updated", {
      detail: { slug: String(slug || ""), cart },
    }));
  } catch (_) {
    // Storage is best-effort in restricted browsers/webviews.
  }

  return cart;
};
