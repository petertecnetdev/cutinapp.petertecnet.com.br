import axios from "axios";
import { apiBaseUrl, appSlug } from "../config";
import { humanizeApiErrorMessage } from "../utils/apiErrorMessage";
import { getRetryDelayMs, shouldRetryRequest } from "../utils/apiRetryPolicy";
import { createRequestId, getHeaderValue, resolveRequestId } from "../utils/requestCorrelation";
import { clearAuthToken, getAuthToken } from "../utils/authTokenStorage";

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

const publishApiFailure = ({ requestId, requestUrl, method, status, code }) => {
  if (typeof window === "undefined") return;

  window.dispatchEvent(new CustomEvent("petertecnet:api-failure", {
    detail: {
      application: appSlug,
      requestId: requestId || null,
      path: requestUrl,
      method: String(method || "GET").toUpperCase(),
      status: status || null,
      code: code || null,
    },
  }));
};

const wait = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs));

const stableSerialize = (value) => {
  if (value == null) return "";
  if (typeof value !== "object") return String(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${key}:${stableSerialize(value[key])}`).join(",")}}`;
};

const getDedupeKey = (config) => {
  if (String(config?.method || "get").toLowerCase() !== "get") return null;
  if (config?.signal || config?.responseType === "stream") return null;
  return `${config.baseURL || ""}|${config.url || ""}|${stableSerialize(config.params)}`;
};

export const createApiClient = (baseURL) => {
  const client = axios.create({
    baseURL,
    timeout: 20000,
    headers: {
      Accept: "application/json",
      "X-Peter-App": appSlug,
    },
  });
  const inFlightGets = new Map();

  client.interceptors.request.use((config) => {
    const token = getAuthToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;

    if (!getHeaderValue(config.headers, "x-request-id")) {
      const requestId = createRequestId();
      if (typeof config.headers?.set === "function") {
        config.headers.set("X-Request-ID", requestId);
      } else if (config.headers) {
        config.headers["X-Request-ID"] = requestId;
      }
    }

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
      const requestId = resolveRequestId({
        responseHeaders: error.response?.headers,
        requestHeaders: error.config?.headers,
      });
      const keepSessionOn401 =
        requestUrl.includes("/auth/login") ||
        requestUrl.includes("/auth/google") ||
        requestUrl.includes("/auth/instagram") ||
        requestUrl.includes("/auth/change-password");

      if (status === 401 && !keepSessionOn401) {
        clearAuthToken();
        publishAuthInvalidation(requestUrl);
      }

      const data = error.response?.data;
      const validationMessage = firstValidationMessage(data?.errors);
      const candidate = validationMessage || data?.message || data?.error || error.message;
      const message = humanizeApiErrorMessage(candidate, status, data?.code || error.code);

      const normalizedError = new Error(message);
      normalizedError.status = status;
      normalizedError.code = data?.code || error.code || null;
      normalizedError.errors = data?.errors || null;
      normalizedError.data = data || null;
      normalizedError.retryAfter = error.response?.headers?.["retry-after"] || null;
      normalizedError.requestId = requestId || null;
      normalizedError.original = error;

      publishApiFailure({
        requestId,
        requestUrl,
        method: error.config?.method,
        status,
        code: normalizedError.code,
      });

      return Promise.reject(normalizedError);
    }
  );

  const rawRequest = client.request.bind(client);
  client.request = (config = {}) => {
    const normalizedConfig = typeof config === "string" ? { url: config } : config;
    const dedupeKey = getDedupeKey({ baseURL, ...normalizedConfig });
    if (!dedupeKey) return rawRequest(config);

    const existing = inFlightGets.get(dedupeKey);
    if (existing) return existing;

    const request = rawRequest(config).finally(() => {
      if (inFlightGets.get(dedupeKey) === request) inFlightGets.delete(dedupeKey);
    });
    inFlightGets.set(dedupeKey, request);
    return request;
  };

  return client;
};

const apiClient = createApiClient(apiBaseUrl);

export default apiClient;
