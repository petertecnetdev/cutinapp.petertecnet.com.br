const CHECKOUT_RECOVERY_PREFIX = "cutinapp_checkout_recovery_";
export const CHECKOUT_RECOVERY_TTL_MS = 48 * 60 * 60 * 1000;

const storageKey = (slug) => `${CHECKOUT_RECOVERY_PREFIX}${String(slug || "").trim()}`;

const storage = () => {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch (_) {
    return null;
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

export const clearCheckoutRecovery = (slug) => {
  if (!slug) return;
  try { storage()?.removeItem(storageKey(slug)); } catch (_) { /* Storage is best-effort. */ }
};

export const readCheckoutRecovery = (slug, now = Date.now()) => {
  if (!slug) return null;
  try {
    const raw = storage()?.getItem(storageKey(slug));
    if (!raw) return null;
    const value = JSON.parse(raw);
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
  } catch (_) {
    clearCheckoutRecovery(slug);
    return null;
  }
};

export const writeCheckoutRecovery = (slug, { selection, orderPublicId } = {}, now = Date.now()) => {
  if (!slug) return false;
  const normalizedSelection = normalizeSelection(selection);
  const normalizedOrderPublicId = typeof orderPublicId === "string" ? orderPublicId.trim() : "";
  if (!normalizedSelection && !normalizedOrderPublicId) {
    clearCheckoutRecovery(slug);
    return false;
  }
  try {
    storage()?.setItem(storageKey(slug), JSON.stringify({
      version: 1,
      selection: normalizedSelection,
      orderPublicId: normalizedOrderPublicId || null,
      savedAt: Number(now),
    }));
    return true;
  } catch (_) {
    return false;
  }
};
