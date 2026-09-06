const MAX_TRANSIENT_RETRIES = 2;
const RETRYABLE_METHODS = new Set(["get", "head", "options"]);
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
const RETRYABLE_NETWORK_CODES = new Set(["ERR_NETWORK", "ECONNABORTED", "ETIMEDOUT"]);

export const shouldRetryRequest = (error) => {
  const method = String(error?.config?.method || "get").toLowerCase();
  if (!RETRYABLE_METHODS.has(method)) return false;

  const retryCount = Number(error?.config?._peterRetryCount || 0);
  if (retryCount >= MAX_TRANSIENT_RETRIES) return false;

  const status = error?.response?.status;
  if (RETRYABLE_STATUS.has(status)) return true;

  return !error?.response && RETRYABLE_NETWORK_CODES.has(error?.code);
};

export const getRetryDelayMs = (error) => {
  const retryAfterHeader = error?.response?.headers?.["retry-after"];
  const retryAfterSeconds = Number(retryAfterHeader);

  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    return Math.min(retryAfterSeconds * 1000, 5000);
  }

  const retryCount = Number(error?.config?._peterRetryCount || 0);
  const baseDelay = Math.min(300 * (2 ** retryCount), 2000);
  const jitter = Math.floor(Math.random() * 150);
  return baseDelay + jitter;
};
