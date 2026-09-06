import { safeGetLocalJson, safeRemoveLocalItem, safeSetLocalJson } from "./safeStorage";

const CHECKOUT_RECOVERY_PREFIX = "cutinapp_checkout_recovery_";
export const CHECKOUT_RECOVERY_TTL_MS = 48 * 60 * 60 * 1000;

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
  if (!selection && !orderPublicId) {
    clearCheckoutRecovery(slug);
    return null;
  }

  return { selection, orderPublicId: orderPublicId || null, savedAt };
};

export const writeCheckoutRecovery = (slug, { selection, orderPublicId } = {}, now = Date.now()) => {
  if (!slug) return false;
  const normalizedSelection = normalizeSelection(selection);
  const normalizedOrderPublicId = typeof orderPublicId === "string" ? orderPublicId.trim() : "";
  if (!normalizedSelection && !normalizedOrderPublicId) {
    clearCheckoutRecovery(slug);
    return false;
  }

  return safeSetLocalJson(storageKey(slug), {
    version: 1,
    selection: normalizedSelection,
    orderPublicId: normalizedOrderPublicId || null,
    savedAt: Number(now),
  });
};
