import { safeGetLocalJson, safeRemoveLocalItem, safeSetLocalJson } from "./safeStorage";

const CHECKOUT_RECOVERY_PREFIX = "cutinapp_checkout_recovery_";
export const CHECKOUT_RECOVERY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const CHECKOUT_RECOVERY_CHANGE_EVENT = "cutinapp:checkout-recovery-change";

const storageKey = (slug) => `${CHECKOUT_RECOVERY_PREFIX}${String(slug || "").trim()}`;

const notifyCheckoutRecoveryChange = (slug) => {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(CHECKOUT_RECOVERY_CHANGE_EVENT, { detail: { slug: String(slug || "") } }));
  } catch (_) {
    // Storage recovery must keep working even when CustomEvent is unavailable.
  }
};

const normalizeLines = (lines) => (Array.isArray(lines) ? lines : [])
  .map((item) => ({ id: Number(item?.id || 0), quantity: Number(item?.quantity || 0) }))
  .filter((item) => Number.isInteger(item.id) && item.id > 0 && Number.isInteger(item.quantity) && item.quantity > 0);

const normalizeSelection = (selection) => {
  if (!selection || typeof selection !== "object") return null;
  const tickets = normalizeLines(selection.tickets);
  const items = normalizeLines(selection.items);
  return tickets.length || items.length ? { tickets, items } : null;
};

const normalizeCouponCode = (couponCode) => {
  const normalized = typeof couponCode === "string" ? couponCode.trim().toUpperCase() : "";
  return /^[A-Z0-9_-]{1,40}$/.test(normalized) ? normalized : null;
};

const normalizePaymentMethod = (paymentMethod) => {
  const normalized = typeof paymentMethod === "string" ? paymentMethod.trim().toLowerCase() : "";
  return ["pix", "card"].includes(normalized) ? normalized : null;
};

export const clearCheckoutRecovery = (slug) => {
  if (!slug) return false;
  const removed = safeRemoveLocalItem(storageKey(slug));
  if (removed) notifyCheckoutRecoveryChange(slug);
  return removed;
};

export const readCheckoutRecovery = (slug, now = Date.now()) => {
  if (!slug) return null;
  const value = safeGetLocalJson(storageKey(slug));
  if (!value || typeof value !== "object") return null;

  const savedAt = Number(value?.savedAt || 0);
  if (!savedAt || savedAt > now + 5 * 60 * 1000 || now - savedAt > CHECKOUT_RECOVERY_TTL_MS) {
    clearCheckoutRecovery(slug);
    return null;
  }

  const selection = normalizeSelection(value?.selection);
  const orderPublicId = typeof value?.orderPublicId === "string" ? value.orderPublicId.trim() : "";
  const couponCode = normalizeCouponCode(value?.couponCode);
  const paymentMethod = normalizePaymentMethod(value?.paymentMethod);
  if (!selection && !orderPublicId) {
    clearCheckoutRecovery(slug);
    return null;
  }

  return { selection, orderPublicId: orderPublicId || null, couponCode, paymentMethod, savedAt };
};

export const writeCheckoutRecovery = (slug, { selection, orderPublicId, couponCode, paymentMethod } = {}, now = Date.now()) => {
  if (!slug) return false;
  const normalizedSelection = normalizeSelection(selection);
  const normalizedOrderPublicId = typeof orderPublicId === "string" ? orderPublicId.trim() : "";
  const normalizedCouponCode = normalizeCouponCode(couponCode);
  const previous = safeGetLocalJson(storageKey(slug));
  const normalizedPaymentMethod = normalizePaymentMethod(paymentMethod)
    || normalizePaymentMethod(previous?.paymentMethod);
  if (!normalizedSelection && !normalizedOrderPublicId) {
    clearCheckoutRecovery(slug);
    return false;
  }

  const saved = safeSetLocalJson(storageKey(slug), {
    version: 4,
    selection: normalizedSelection,
    orderPublicId: normalizedOrderPublicId || null,
    couponCode: normalizedCouponCode,
    paymentMethod: normalizedPaymentMethod,
    savedAt: Number(now),
  });
  if (saved) notifyCheckoutRecoveryChange(slug);
  return saved;
};
