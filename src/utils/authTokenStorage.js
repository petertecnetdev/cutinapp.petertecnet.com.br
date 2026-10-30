import {
  safeReadLocalItem,
  safeRemoveLocalItem,
  safeSetLocalItem,
} from "./safeStorage";

const AUTH_TOKEN_KEY = "token";
let memoryToken = null;
let memoryFallback = false;
let sessionEpoch = 0;

const readPersistedToken = () => safeReadLocalItem(AUTH_TOKEN_KEY);

export const getAuthToken = () => {
  if (memoryFallback) return memoryToken;

  const persisted = readPersistedToken();
  if (!persisted.available) return memoryToken;

  const current = persisted.value || null;
  if (memoryToken !== current) sessionEpoch += 1;
  memoryToken = current;
  return memoryToken;
};

export const setAuthToken = (token) => {
  const normalized = typeof token === "string" ? token.trim() : "";
  sessionEpoch += 1;
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
  sessionEpoch += 1;
  memoryToken = null;
  memoryFallback = !safeRemoveLocalItem(AUTH_TOKEN_KEY);
};

export const getAuthSessionSnapshot = () => {
  const token = getAuthToken();
  return { token, epoch: sessionEpoch };
};

export const isCurrentAuthSession = (snapshot) => (
  Boolean(snapshot?.token)
  && getAuthSessionSnapshot().token === snapshot.token
  && getAuthSessionSnapshot().epoch === snapshot.epoch
);

// Storage events on other tabs invalidate in-flight requests even if a token
// changes A→B→A before their next continuation.
export const noteExternalAuthTokenChange = () => { sessionEpoch += 1; };

export const resetAuthTokenMemoryForTests = () => {
  memoryToken = null;
  memoryFallback = false;
  sessionEpoch = 0;
};
