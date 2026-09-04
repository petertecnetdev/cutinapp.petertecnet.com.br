export const AUTH_TOKEN_STORAGE_KEY = "token";

export const isAuthTokenStorageEvent = (event) => (
  Boolean(event)
  && event.key === AUTH_TOKEN_STORAGE_KEY
);

export const subscribeToAuthTokenChanges = (listener) => {
  if (typeof window === "undefined" || typeof listener !== "function") {
    return () => {};
  }

  const handleStorage = (event) => {
    if (!isAuthTokenStorageEvent(event)) return;
    listener(event.newValue, event.oldValue);
  };

  window.addEventListener("storage", handleStorage);
  return () => window.removeEventListener("storage", handleStorage);
};
