import {
  safeRemoveLocalItem,
  safeSetLocalItem,
} from "./safeStorage";

const AUTH_TOKEN_KEY = "token";
let memoryToken = null;
let memoryFallback = false;

const readPersistedToken = () => {
  if (typeof window === "undefined") return { available: false, value: null };
  try {
    return { available: true, value: window.localStorage.getItem(AUTH_TOKEN_KEY) };
  } catch (_) {
    return { available: false, value: null };
  }
};

export const getAuthToken = () => {
  if (memoryFallback) return memoryToken;

  const persisted = readPersistedToken();
  if (!persisted.available) return memoryToken;

  memoryToken = persisted.value || null;
  return memoryToken;
};

export const setAuthToken = (token) => {
  const normalized = typeof token === "string" ? token.trim() : "";
  memoryToken = normalized || null;

  if (!memoryToken) {
    memoryFallback = !safeRemoveLocalItem(AUTH_TOKEN_KEY);
    return false;
  }

  const persisted = safeSetLocalItem(AUTH_TOKEN_KEY, memoryToken);
  memoryFallback = !persisted;
  return persisted;
};

export const clearAuthToken = () => {
  memoryToken = null;
  memoryFallback = !safeRemoveLocalItem(AUTH_TOKEN_KEY);
};

export const resetAuthTokenMemoryForTests = () => {
  memoryToken = null;
  memoryFallback = false;
};
