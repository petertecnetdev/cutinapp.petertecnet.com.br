import { clearCheckoutRecovery } from "./checkoutRecovery";

const PAYMENT_PREFIX = "cutinapp_payment_";
const CART_PREFIX = "cutinapp_checkout_";

const parse = (storage, key) => {
  try { return JSON.parse(storage?.getItem?.(key) || "null"); } catch (_) { return null; }
};

const remove = (storage, key) => {
  try { storage?.removeItem?.(key); } catch (_) { /* Storage may be blocked. */ }
};

const isCompleted = (payment) => String(payment?.order?.status || payment?.payment?.status || "").toLowerCase() === "paid"
  && String(payment?.order?.metadata?.fulfillment_status || "").toLowerCase() === "completed";

export const clearCompletedPersistentCarts = () => {
  if (typeof window === "undefined") return 0;
  let cleared = 0;
  try {
    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = window.sessionStorage.key(index);
      if (!key?.startsWith(PAYMENT_PREFIX)) continue;
      const slug = key.slice(PAYMENT_PREFIX.length);
      if (!slug || !isCompleted(parse(window.sessionStorage, key))) continue;
      remove(window.sessionStorage, `${CART_PREFIX}${slug}`);
      remove(window.sessionStorage, key);
      clearCheckoutRecovery(slug);
      cleared += 1;
    }
  } catch (_) {
    return cleared;
  }
  return cleared;
};

export const installCartCompletionCleanup = () => {
  if (typeof window === "undefined") return () => {};
  let timer = null;
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(clearCompletedPersistentCarts, 0);
  };
  ["cutinapp:route-change", "popstate", "pageshow", "focus", "storage"].forEach((event) => window.addEventListener(event, schedule));
  schedule();
  return () => {
    window.clearTimeout(timer);
    ["cutinapp:route-change", "popstate", "pageshow", "focus", "storage"].forEach((event) => window.removeEventListener(event, schedule));
  };
};
