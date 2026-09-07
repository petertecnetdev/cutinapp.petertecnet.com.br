import { safeGetSessionJson, safeRemoveSessionItem, safeSetSessionJson } from "./safeStorage";

const PREFIX = "cutinapp_checkout_payment_recovery_";
export const CHECKOUT_PAYMENT_RECOVERY_TTL_MS = 24 * 60 * 60 * 1000;

const storageKey = (slug) => `${PREFIX}${String(slug || "").trim()}`;

export const clearCheckoutPaymentRecovery = (slug) => {
  if (!String(slug || "").trim()) return false;
  return safeRemoveSessionItem(storageKey(slug));
};

export const writeCheckoutPaymentRecovery = ({ slug, reason, fromMethod, toMethod, amount } = {}, now = Date.now()) => {
  const normalizedSlug = String(slug || "").trim();
  if (!normalizedSlug) return false;

  return safeSetSessionJson(storageKey(normalizedSlug), {
    version: 1,
    reason: String(reason || "unknown"),
    fromMethod: String(fromMethod || "unknown"),
    toMethod: String(toMethod || fromMethod || "unknown"),
    amount: Math.max(0, Number(amount || 0)),
    startedAt: Number(now),
  });
};

export const readCheckoutPaymentRecovery = (slug, now = Date.now()) => {
  const normalizedSlug = String(slug || "").trim();
  if (!normalizedSlug) return null;

  const value = safeGetSessionJson(storageKey(normalizedSlug));
  if (!value || typeof value !== "object") return null;
  const startedAt = Number(value.startedAt || 0);
  if (!startedAt || startedAt > now + 5 * 60 * 1000 || now - startedAt > CHECKOUT_PAYMENT_RECOVERY_TTL_MS) {
    clearCheckoutPaymentRecovery(normalizedSlug);
    return null;
  }

  return {
    reason: String(value.reason || "unknown"),
    fromMethod: String(value.fromMethod || "unknown"),
    toMethod: String(value.toMethod || "unknown"),
    amount: Math.max(0, Number(value.amount || 0)),
    startedAt,
  };
};
