import { safeGetLocalJson, safeRemoveLocalItem, safeSetLocalJson } from "./safeStorage";

const CHECKOUT_RECOVERY_PREFIX = "cutinapp_checkout_recovery_";
export const CHECKOUT_RECOVERY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const storageKey = (slug) => `${CHECKOUT_RECOVERY_PREFIX}${String(slug || "").trim()}`;

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

export const clearCheckoutRecovery = (slug) => {
  if (!slug) return false;
  return safeRemoveLocalItem(storageKey(slug));
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
  if (!selection && !orderPublicId) {
    clearCheckoutRecovery(slug);
    return null;
  }

  return { selection, orderPublicId: orderPublicId || null, couponCode, savedAt };
};

export const writeCheckoutRecovery = (slug, { selection, orderPublicId, couponCode } = {}, now = Date.now()) => {
  if (!slug) return false;
  const normalizedSelection = normalizeSelection(selection);
  const normalizedOrderPublicId = typeof orderPublicId === "string" ? orderPublicId.trim() : "";
  const normalizedCouponCode = normalizeCouponCode(couponCode);
  if (!normalizedSelection && !normalizedOrderPublicId) {
    clearCheckoutRecovery(slug);
    return false;
  }

  return safeSetLocalJson(storageKey(slug), {
    version: 2,
    selection: normalizedSelection,
    orderPublicId: normalizedOrderPublicId || null,
    couponCode: normalizedCouponCode,
    savedAt: Number(now),
  });
};
