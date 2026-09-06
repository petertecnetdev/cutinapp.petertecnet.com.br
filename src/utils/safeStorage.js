const getBrowserStorage = (name) => {
  if (typeof window === "undefined") return null;
  try {
    return window[name] || null;
  } catch (_) {
    return null;
  }
};

export const safeSetSessionJson = (key, value) => {
  const storage = getBrowserStorage("sessionStorage");
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch (_) {
    return false;
  }
};

export const safeRemoveSessionItem = (key) => {
  const storage = getBrowserStorage("sessionStorage");
  if (!storage) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch (_) {
    return false;
  }
};
