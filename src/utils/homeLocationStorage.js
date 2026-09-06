import { safeGetLocalJson, safeRemoveLocalItem, safeSetLocalJson } from "./safeStorage";

const HOME_LOCATION_KEY = "cutinapp.homeLocation";
const PRECISE_LOCATION_TTL_MS = 24 * 60 * 60 * 1000;

const normalizeLocation = (value) => {
  if (!value || typeof value !== "object") return null;

  if (value.city) {
    return {
      city: String(value.city).trim(),
      uf: String(value.uf || "").trim(),
      mode: "city",
    };
  }

  const lat = Number(value.lat);
  const lng = Number(value.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return {
    lat: lat.toFixed(6),
    lng: lng.toFixed(6),
    mode: "nearby",
  };
};

export const readHomeLocation = (now = Date.now()) => {
  const stored = safeGetLocalJson(HOME_LOCATION_KEY);
  if (!stored) return null;

  // Legacy payloads stored the raw location indefinitely. Migrate them on read
  // so precise coordinates stop living permanently in the browser.
  if (!Object.prototype.hasOwnProperty.call(stored, "value")) {
    const legacy = normalizeLocation(stored);
    if (!legacy) {
      safeRemoveLocalItem(HOME_LOCATION_KEY);
      return null;
    }
    saveHomeLocation(legacy, now);
    return legacy;
  }

  const location = normalizeLocation(stored.value);
  if (!location) {
    safeRemoveLocalItem(HOME_LOCATION_KEY);
    return null;
  }

  if (location.mode === "nearby") {
    const expiresAt = Number(stored.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= now) {
      safeRemoveLocalItem(HOME_LOCATION_KEY);
      return null;
    }
  }

  return location;
};

export const saveHomeLocation = (value, now = Date.now()) => {
  const location = normalizeLocation(value);
  if (!location) return false;

  return safeSetLocalJson(HOME_LOCATION_KEY, {
    value: location,
    ...(location.mode === "nearby" ? { expiresAt: now + PRECISE_LOCATION_TTL_MS } : {}),
  });
};

export const clearHomeLocation = () => safeRemoveLocalItem(HOME_LOCATION_KEY);

export { HOME_LOCATION_KEY, PRECISE_LOCATION_TTL_MS };
