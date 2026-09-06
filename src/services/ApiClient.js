import axios from "axios";
import { apiBaseUrl, appSlug } from "../config";
import { humanizeApiErrorMessage } from "../utils/apiErrorMessage";

const MAX_TRANSIENT_RETRIES = 2;
const RETRYABLE_METHODS = new Set(["get", "head", "options"]);
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
const RETRYABLE_NETWORK_CODES = new Set(["ERR_NETWORK", "ECONNABORTED", "ETIMEDOUT"]);

const firstValidationMessage = (errors) => {
  if (!errors || typeof errors !== "object") return "";
  return Object.values(errors).flat().find((value) => typeof value === "string" && value.trim()) || "";
};

const publishAuthInvalidation = (requestUrl) => {
  if (typeof window === "undefined") return;

  window.dispatchEvent(new CustomEvent("petertecnet:auth-invalidated", {
    detail: {
      application: appSlug,
      path: requestUrl,
      reason: "unauthorized",
    },
  }));
};

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

const wait = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs));

export const createApiClient = (baseURL) => {
  const client = axios.create({
    baseURL,
    timeout: 20000,
    headers: {
      Accept: "application/json",
      "X-Peter-App": appSlug,
    },
  });

  client.interceptors.request.use((config) => {
    const token = localStorage.getItem("token");
    if (token) config.headers.Authorization = `Bearer ${token}`;

    const isFormData = typeof FormData !== "undefined" && config.data instanceof FormData;
    if (isFormData) {
      if (typeof config.headers?.delete === "function") {
        config.headers.delete("Content-Type");
      } else if (config.headers) {
        delete config.headers["Content-Type"];
        delete config.headers["content-type"];
      }
    } else if (config.data != null && config.headers) {
      config.headers["Content-Type"] = "application/json";
    }

    return config;
  });

  client.interceptors.response.use(
    (response) => response,
    async (error) => {
      if (shouldRetryRequest(error)) {
        const retryConfig = {
          ...error.config,
          _peterRetryCount: Number(error.config?._peterRetryCount || 0) + 1,
        };

        await wait(getRetryDelayMs(error));
        return client.request(retryConfig);
      }

      const status = error.response?.status;
      const requestUrl = String(error.config?.url || "");
      const keepSessionOn401 =
        requestUrl.includes("/auth/login") ||
        requestUrl.includes("/auth/google") ||
        requestUrl.includes("/auth/instagram") ||
        requestUrl.includes("/auth/change-password");

      if (status === 401 && !keepSessionOn401) {
        localStorage.removeItem("token");
        publishAuthInvalidation(requestUrl);
      }

      const data = error.response?.data;
      const validationMessage = firstValidationMessage(data?.errors);
      const candidate = validationMessage || data?.message || data?.error || error.message;
      const message = humanizeApiErrorMessage(candidate, status, error.code);

      const normalizedError = new Error(message);
      normalizedError.status = status;
      normalizedError.code = data?.code || error.code || null;
      normalizedError.errors = data?.errors || null;
      normalizedError.data = data || null;
      normalizedError.retryAfter = error.response?.headers?.["retry-after"] || null;
      normalizedError.original = error;
      return Promise.reject(normalizedError);
    }
  );

  return client;
};

const apiClient = createApiClient(apiBaseUrl);

export default apiClient;
