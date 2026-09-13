import {
  safeGetLocalJson,
  safeGetSessionJson,
  safeRemoveLocalItem,
  safeRemoveSessionItem,
  safeSetLocalJson,
  safeSetSessionJson,
} from "./safeStorage";

const CART_PREFIX = "cutinapp_checkout_";
const CART_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const CHECKOUT_RECOVERY_PREFIX = "cutinapp_checkout_recovery_";
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
  safeRemoveSessionItem(key);
  safeRemoveLocalItem(key);

  // A fulfilled purchase is terminal: keep the success screen in React state, but do not
  // leave it resumable in storage where it can compete with the participant's next purchase.
  if (isFulfilledCheckoutResult(persistedPayment)) {
    safeRemoveSessionItem(paymentKey);
    safeRemoveLocalItem(`${CHECKOUT_RECOVERY_PREFIX}${normalizedSlug}`);
    try {
      window.dispatchEvent(new CustomEvent("cutinapp:checkout-recovery-change", {
        detail: { slug: normalizedSlug },
      }));
    } catch (_) {
      // Storage cleanup must remain best-effort in restricted browsers/webviews.
    }
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

  try {
    window.dispatchEvent(new CustomEvent("cutinapp-cart-updated", {
      detail: { slug: String(slug || ""), cart },
    }));
  } catch (_) {
    // Storage is best-effort in restricted browsers/webviews.
  }

  return cart;
};
