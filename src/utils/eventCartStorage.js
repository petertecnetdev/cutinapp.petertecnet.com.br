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

const isExpired = (cart) => {
  const savedAt = Number(cart?.savedAt || 0);
  return savedAt > 0 && Date.now() - savedAt > CART_MAX_AGE_MS;
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
  const cart = sessionCart || persistentCart;

  if (!cart) return null;
  if (isExpired(cart)) {
    clearEventCart(slug);
    return null;
  }

  if (!sessionCart && persistentCart) safeSetSessionJson(key, persistentCart);
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
