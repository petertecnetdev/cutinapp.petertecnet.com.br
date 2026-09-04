export const getNetworkStatus = () => {
  if (typeof navigator === "undefined" || typeof navigator.onLine !== "boolean") return "unknown";
  return navigator.onLine ? "online" : "offline";
};

export const subscribeToNetworkStatus = (listener) => {
  if (typeof window === "undefined" || typeof listener !== "function") return () => {};

  const emit = () => listener(getNetworkStatus());
  window.addEventListener("online", emit);
  window.addEventListener("offline", emit);

  return () => {
    window.removeEventListener("online", emit);
    window.removeEventListener("offline", emit);
  };
};
