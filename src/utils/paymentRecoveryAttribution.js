import { safeGetSessionJson, safeRemoveSessionItem, safeSetSessionJson } from "./safeStorage";

const PREFIX = "cutinapp_payment_recovery_attribution_";
export const PAYMENT_RECOVERY_ATTRIBUTION_TTL_MS = 48 * 60 * 60 * 1000;

const storageKey = (orderPublicId) => `${PREFIX}${String(orderPublicId || "").trim()}`;

export const clearPaymentRecoveryAttribution = (orderPublicId) => {
  if (!orderPublicId) return false;
  return safeRemoveSessionItem(storageKey(orderPublicId));
};

export const readPaymentRecoveryAttribution = (orderPublicId, now = Date.now()) => {
  const normalizedOrderPublicId = String(orderPublicId || "").trim();
  if (!normalizedOrderPublicId) return null;
  const value = safeGetSessionJson(storageKey(normalizedOrderPublicId));
  if (!value || typeof value !== "object") return null;

  const startedAt = Number(value.startedAt || 0);
  if (!startedAt || startedAt > now + 5 * 60 * 1000 || now - startedAt > PAYMENT_RECOVERY_ATTRIBUTION_TTL_MS) {
    clearPaymentRecoveryAttribution(normalizedOrderPublicId);
    return null;
  }

  return {
    orderPublicId: normalizedOrderPublicId,
    amount: Math.max(0, Number(value.amount || 0)),
    startedAt,
  };
};

export const writePaymentRecoveryAttribution = ({ orderPublicId, amount } = {}, now = Date.now()) => {
  const normalizedOrderPublicId = String(orderPublicId || "").trim();
  if (!normalizedOrderPublicId) return false;

  return safeSetSessionJson(storageKey(normalizedOrderPublicId), {
    version: 1,
    amount: Math.max(0, Number(amount || 0)),
    startedAt: Number(now),
  });
};
