const getBrowserStorage = (name) => {
  if (typeof window === "undefined") return null;
  try {
    return window[name] || null;
  } catch (_) {
    return null;
  }
};

const COMMERCE_SCOPE_KEY = "cutinapp_commerce_scope_v1";
const COMMERCE_SESSION_SCOPE_KEY = "cutinapp_commerce_session_scope_v1";
const PROTECTED_COMMERCE_SESSION_PREFIXES = ["cutinapp_payment_"];

const isProtectedCommerceSessionKey = (key) => PROTECTED_COMMERCE_SESSION_PREFIXES
  .some((prefix) => String(key || "").startsWith(prefix));

const isCommerceSessionTransitionPending = (key) => {
  if (!isProtectedCommerceSessionKey(key)) return false;
  const localStorage = getBrowserStorage("localStorage");
  const sessionStorage = getBrowserStorage("sessionStorage");
  if (!localStorage || !sessionStorage) return false;
  try {
    const localScope = localStorage.getItem(COMMERCE_SCOPE_KEY);
    if (!localScope) return false;
    return sessionStorage.getItem(COMMERCE_SESSION_SCOPE_KEY) !== localScope;
  } catch (_) {
    return true;
  }
};

export const safeReadLocalItem = (key) => {
  const storage = getBrowserStorage("localStorage");
  if (!storage) return { available: false, value: null };
  try {
    return { available: true, value: storage.getItem(key) };
  } catch (_) {
    return { available: false, value: null };
  }
};

export const safeGetLocalItem = (key) => safeReadLocalItem(key).value;

export const safeGetLocalJson = (key, fallback = null) => {
  const stored = safeGetLocalItem(key);
  if (!stored) return fallback;
  try {
    return JSON.parse(stored);
  } catch (_) {
    safeRemoveLocalItem(key);
    return fallback;
  }
};

export const safeSetLocalItem = (key, value) => {
  const storage = getBrowserStorage("localStorage");
  if (!storage) return false;
  try {
    storage.setItem(key, String(value));
    return true;
  } catch (_) {
    return false;
  }
};

export const safeSetLocalJson = (key, value) => {
  const storage = getBrowserStorage("localStorage");
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch (_) {
    return false;
  }
};

export const safeRemoveLocalItem = (key) => {
  const storage = getBrowserStorage("localStorage");
  if (!storage) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch (_) {
    return false;
  }
};

export const safeGetSessionItem = (key) => {
  const storage = getBrowserStorage("sessionStorage");
  if (!storage || isCommerceSessionTransitionPending(key)) return null;
  try {
    return storage.getItem(key);
  } catch (_) {
    return null;
  }
};

export const safeGetSessionJson = (key) => {
  const stored = safeGetSessionItem(key);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch (_) {
    safeRemoveSessionItem(key);
    return null;
  }
};

export const safeSetSessionItem = (key, value) => {
  const storage = getBrowserStorage("sessionStorage");
  if (!storage || isCommerceSessionTransitionPending(key)) return false;
  try {
    storage.setItem(key, String(value));
    return true;
  } catch (_) {
    return false;
  }
};

export const safeSetSessionJson = (key, value) => {
  const storage = getBrowserStorage("sessionStorage");
  if (!storage || isCommerceSessionTransitionPending(key)) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch (_) {
    return false;
  }
};

export const safeRemoveSessionItem = (key) => {
  const storage = getBrowserStorage("sessionStorage");
  if (!storage || isCommerceSessionTransitionPending(key)) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch (_) {
    return false;
  }
};
