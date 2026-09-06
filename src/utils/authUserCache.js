import {
  safeGetSessionJson,
  safeRemoveSessionItem,
  safeSetSessionJson,
} from "./safeStorage";

const KEY = "cutinapp_auth_user_cache_v1";
const MAX_AGE_MS = 5 * 60 * 1000;

export const readCachedAuthUser = () => {
  const cached = safeGetSessionJson(KEY);
  if (!cached?.user || !cached?.cachedAt) return null;
  if (Date.now() - Number(cached.cachedAt) > MAX_AGE_MS) {
    safeRemoveSessionItem(KEY);
    return null;
  }
  return cached.user;
};

export const cacheAuthUser = (user) => {
  if (!user) {
    safeRemoveSessionItem(KEY);
    return false;
  }
  return safeSetSessionJson(KEY, { user, cachedAt: Date.now() });
};

export const clearCachedAuthUser = () => safeRemoveSessionItem(KEY);
