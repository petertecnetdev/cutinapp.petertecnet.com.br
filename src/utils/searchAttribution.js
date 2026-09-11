import appApiClient from "../services/AppApiClient";

const KEY = "cutinapp:search-attribution:v1";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const readSearchAttribution = () => {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(window.sessionStorage.getItem(KEY) || "null");
    if (!value?.target_id || !value?.searched_at) return null;
    if (Date.now() - Number(value.searched_at) > MAX_AGE_MS) {
      window.sessionStorage.removeItem(KEY);
      return null;
    }
    return value;
  } catch (_) {
    return null;
  }
};

export const clearSearchAttribution = () => {
  if (typeof window === "undefined") return;
  try { window.sessionStorage.removeItem(KEY); } catch (_) { /* optional */ }
};

export const trackSearchConversion = async (conversionType, targetId, { clear = true } = {}) => {
  const attribution = readSearchAttribution();
  const numericTarget = Number(targetId || 0);
  if (!attribution || !numericTarget || Number(attribution.target_id) !== numericTarget) return false;

  try {
    const response = await appApiClient.post("/global-search/convert", {
      conversion_type: conversionType,
      target_id: numericTarget,
    });
    if (clear && response?.data?.attributed) clearSearchAttribution();
    return Boolean(response?.data?.attributed);
  } catch (_) {
    return false;
  }
};
