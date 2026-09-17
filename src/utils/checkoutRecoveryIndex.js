import { safeGetLocalJson, safeRemoveLocalItem, safeSetLocalJson } from "./safeStorage";

export const CHECKOUT_RECOVERY_INDEX_KEY = "cutinapp_checkout_recovery_index";
export const CHECKOUT_RECOVERY_INDEX_LIMIT = 8;

const normalizeSlug = (slug) => (typeof slug === "string" ? slug.trim() : "");

const normalizeEntry = (entry) => {
  const slug = normalizeSlug(entry?.slug);
  const savedAt = Number(entry?.savedAt || 0);
  if (!slug || !Number.isFinite(savedAt) || savedAt <= 0) return null;
  return {
    slug,
    savedAt,
    hasOrder: Boolean(entry?.hasOrder),
  };
};

export const readCheckoutRecoveryIndex = (now = Date.now(), ttlMs = 7 * 24 * 60 * 60 * 1000) => {
  const stored = safeGetLocalJson(CHECKOUT_RECOVERY_INDEX_KEY);
  const entries = Array.isArray(stored) ? stored : [];
  const valid = entries
    .map(normalizeEntry)
    .filter(Boolean)
    .filter((entry) => now - entry.savedAt <= ttlMs)
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, CHECKOUT_RECOVERY_INDEX_LIMIT);

  if (valid.length !== entries.length) safeSetLocalJson(CHECKOUT_RECOVERY_INDEX_KEY, valid);
  return valid;
};

export const rememberCheckoutRecovery = (slug, { savedAt = Date.now(), hasOrder = false } = {}) => {
  const normalizedSlug = normalizeSlug(slug);
  if (!normalizedSlug) return false;
  const current = readCheckoutRecoveryIndex(savedAt);
  const next = [
    { slug: normalizedSlug, savedAt: Number(savedAt), hasOrder: Boolean(hasOrder) },
    ...current.filter((entry) => entry.slug !== normalizedSlug),
  ].slice(0, CHECKOUT_RECOVERY_INDEX_LIMIT);
  return safeSetLocalJson(CHECKOUT_RECOVERY_INDEX_KEY, next);
};

export const forgetCheckoutRecovery = (slug) => {
  const normalizedSlug = normalizeSlug(slug);
  if (!normalizedSlug) return false;
  const current = readCheckoutRecoveryIndex();
  const next = current.filter((entry) => entry.slug !== normalizedSlug);
  if (next.length === current.length) return false;
  return safeSetLocalJson(CHECKOUT_RECOVERY_INDEX_KEY, next);
};

export const clearCheckoutRecoveryIndex = () => safeRemoveLocalItem(CHECKOUT_RECOVERY_INDEX_KEY);
