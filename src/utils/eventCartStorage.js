import {
  safeGetLocalJson,
  safeGetSessionJson,
  safeRemoveLocalItem,
  safeRemoveSessionItem,
  safeSetLocalJson,
  safeSetSessionJson,
} from "./safeStorage";
import { clearCheckoutRecovery, readCheckoutRecovery, writeCheckoutRecovery } from "./checkoutRecovery";
import { isCommerceScopeTransitionPending } from "./commerceSessionScope";

const CART_PREFIX = "cutinapp_checkout_";
const CART_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const CART_MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const PAYMENT_PREFIX = "cutinapp_payment_";
const normalizeSlug = (slug) => String(slug || "").trim();
const keyFor = (slug) => {
  const normalizedSlug = normalizeSlug(slug);
  return normalizedSlug ? `${CART_PREFIX}${normalizedSlug}` : null;
};

export const isFulfilledCheckoutResult = (result) => String(result?.order?.status || "").toLowerCase() === "paid"
  && String(result?.order?.metadata?.fulfillment_status || "").toLowerCase() === "completed";

const positiveInteger = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.floor(parsed);
};

const hasPurchasableSelection = (selection) => [
  ...(Array.isArray(selection?.tickets) ? selection.tickets : []),
  ...(Array.isArray(selection?.items) ? selection.items : []),
].some((entry) => positiveInteger(entry?.id) && positiveInteger(entry?.quantity));

const isExpired = (cart) => {
  const savedAt = Number(cart?.savedAt || 0);
  if (!Number.isFinite(savedAt) || savedAt <= 0) return true;

  const age = Date.now() - savedAt;
  return age > CART_MAX_AGE_MS || age < -CART_MAX_FUTURE_SKEW_MS;
};

const newestCart = (sessionCart, persistentCart) => {
  if (!sessionCart) return persistentCart;
  if (!persistentCart) return sessionCart;

  const sessionSavedAt = Number(sessionCart?.savedAt || 0);
  const persistentSavedAt = Number(persistentCart?.savedAt || 0);
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
    const maxQuantity = requestedMax
      ? Math.max(currentQuantity, requestedMax)
      : currentQuantity + requested;
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
  if (!key) return;

  const paymentKey = `${PAYMENT_PREFIX}${normalizedSlug}`;
  const persistedPayment = safeGetSessionJson(paymentKey);
  const recovery = readCheckoutRecovery(normalizedSlug);
  safeRemoveSessionItem(key);
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
  const normalizedSlug = normalizeSlug(slug);
  const key = keyFor(normalizedSlug);
  if (!key) return null;

  // A local commerce scope without a matching tab scope means authentication is
  // currently unresolved (new tab/token refresh/account switch). Never expose the
  // previous identity's persisted cart during that window.
  if (isCommerceScopeTransitionPending()) return null;

  const sessionCart = safeGetSessionJson(key);
  const persistentCart = safeGetLocalJson(key);
  const cart = newestCart(sessionCart, persistentCart);

  if (!cart) return null;
  if (isExpired(cart)) {
    safeRemoveSessionItem(key);
    safeRemoveLocalItem(key);
    return null;
  }

  if (cart?.cleared === true) {
    safeRemoveSessionItem(key);
    return null;
  }

  if (!hasPurchasableSelection(cart)) {
    clearEventCart(normalizedSlug);
    return null;
  }

  if (cart === persistentCart && cart !== sessionCart) safeSetSessionJson(key, cart);
  if (cart === sessionCart && cart !== persistentCart) safeSetLocalJson(key, cart);
  return cart;
};

export const writeEventCart = (slug, selection) => {
  const normalizedSlug = normalizeSlug(slug);
  const key = keyFor(normalizedSlug);
  if (!key) return null;

  // Do not let UI actions that race with auth resolution overwrite commerce state
  // owned by the previously resolved participant.
  if (isCommerceScopeTransitionPending()) return null;

  if (!selection || !hasPurchasableSelection(selection)) {
    clearEventCart(normalizedSlug);
    return null;
  }

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
