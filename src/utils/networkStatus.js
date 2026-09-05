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

export const isNetworkFailure = (error) => {
  if (!error) return false;
  if (getNetworkStatus() === "offline") return true;
  if (error.status) return false;

  const code = String(error.code || "").toUpperCase();
  const message = String(error.message || "");
  return ["ERR_NETWORK", "ECONNABORTED", "ETIMEDOUT"].includes(code)
    || /network error|failed to fetch|load failed|conectar ao servidor|conexão/i.test(message);
};
