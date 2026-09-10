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
const keyFor = (slug) => `${CART_PREFIX}${String(slug || "").trim()}`;

const isExpired = (cart) => {
  const savedAt = Number(cart?.savedAt || 0);
  return savedAt > 0 && Date.now() - savedAt > CART_MAX_AGE_MS;
};

export const clearEventCart = (slug) => {
  const key = keyFor(slug);
  safeRemoveSessionItem(key);
  safeRemoveLocalItem(key);
  try {
    window.dispatchEvent(new CustomEvent("cutinapp-cart-updated", {
      detail: { slug: String(slug || ""), cart: null },
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
