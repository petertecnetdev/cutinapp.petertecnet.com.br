import axios from "axios";
import { apiBaseUrl, appSlug } from "../config";
import { classifyApiFailure, humanizeApiErrorMessage } from "../utils/apiErrorMessage";
import { getRetryDelayMs, shouldRetryRequest } from "../utils/apiRetryPolicy";
import { createRequestId, getHeaderValue, resolveRequestId } from "../utils/requestCorrelation";
import { clearAuthToken, getAuthToken } from "../utils/authTokenStorage";
import { getNetworkStatus } from "../utils/networkStatus";

const firstValidationMessage = (errors) => {
  if (!errors || typeof errors !== "object") return "";
  return Object.values(errors).flat().find((value) => typeof value === "string" && value.trim()) || "";
};

const nowMs = () => (typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now());
const durationMs = (config) => Math.max(0, Math.round(nowMs() - Number(config?._peterStartedAt || nowMs())));

const publishAuthInvalidation = (requestUrl) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("petertecnet:auth-invalidated", {
    detail: { application: appSlug, path: requestUrl, reason: "unauthorized" },
  }));
};

const publishApiFailure = ({ requestId, requestUrl, method, status, code, kind, duration }) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("petertecnet:api-failure", {
    detail: {
      application: appSlug,
      requestId: requestId || null,
      path: requestUrl,
      method: String(method || "GET").toUpperCase(),
      status: status || null,
      code: code || null,
      kind: kind || null,
      duration_ms: duration,
      network_status: getNetworkStatus(),
    },
  }));
};

const publishApiPerformance = (response) => {
  if (typeof window === "undefined") return;
  const duration = durationMs(response?.config);
  const serverTiming = response?.headers?.["server-timing"] || null;
  response.peterTiming = { durationMs: duration, serverTiming };
  window.dispatchEvent(new CustomEvent("petertecnet:api-performance", {
    detail: {
      application: appSlug,
      path: String(response?.config?.url || ""),
      method: String(response?.config?.method || "GET").toUpperCase(),
      status: response?.status || null,
      duration_ms: duration,
      server_timing: serverTiming,
      request_id: resolveRequestId({ responseHeaders: response?.headers, requestHeaders: response?.config?.headers }) || null,
    },
  }));
};

const wait = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs));

export const createApiClient = (baseURL) => {
  const client = axios.create({
    baseURL,
    timeout: 20000,
    headers: { Accept: "application/json", "X-Peter-App": appSlug },
  });

  client.interceptors.request.use((config) => {
    config._peterStartedAt = nowMs();
    const token = getAuthToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;

    if (!getHeaderValue(config.headers, "x-request-id")) {
      const requestId = createRequestId();
      if (typeof config.headers?.set === "function") config.headers.set("X-Request-ID", requestId);
      else if (config.headers) config.headers["X-Request-ID"] = requestId;
    }

    const isFormData = typeof FormData !== "undefined" && config.data instanceof FormData;
    if (isFormData) {
      if (typeof config.headers?.delete === "function") config.headers.delete("Content-Type");
      else if (config.headers) {
        delete config.headers["Content-Type"];
        delete config.headers["content-type"];
      }
    } else if (config.data != null && config.headers) {
      config.headers["Content-Type"] = "application/json";
    }

    return config;
  });

  client.interceptors.response.use(
    (response) => {
      publishApiPerformance(response);
      return response;
    },
    async (error) => {
      if (shouldRetryRequest(error)) {
        const retryConfig = {
          ...error.config,
          _peterRetryCount: Number(error.config?._peterRetryCount || 0) + 1,
          _peterStartedAt: nowMs(),
        };
        await wait(getRetryDelayMs(error));
        return client.request(retryConfig);
      }

      const status = error.response?.status;
      const requestUrl = String(error.config?.url || "");
      const requestId = resolveRequestId({ responseHeaders: error.response?.headers, requestHeaders: error.config?.headers });
      const keepSessionOn401 =
        requestUrl.includes("/auth/login") || requestUrl.includes("/auth/google") ||
        requestUrl.includes("/auth/instagram") || requestUrl.includes("/auth/change-password");

      if (status === 401 && !keepSessionOn401) {
        clearAuthToken();
        publishAuthInvalidation(requestUrl);
      }

      const data = error.response?.data;
      const validationMessage = firstValidationMessage(data?.errors);
      const candidate = validationMessage || data?.message || data?.error || error.message;
      const networkStatus = getNetworkStatus();
      const message = humanizeApiErrorMessage(candidate, status, error.code, { networkStatus });
      const kind = classifyApiFailure({ value: candidate, status, code: error.code, networkStatus });

      const normalizedError = new Error(message);
      normalizedError.status = status;
      normalizedError.code = data?.code || error.code || null;
      normalizedError.kind = kind;
      normalizedError.networkStatus = networkStatus;
      normalizedError.errors = data?.errors || null;
      normalizedError.data = data || null;
      normalizedError.retryAfter = error.response?.headers?.["retry-after"] || null;
      normalizedError.requestId = requestId || null;
      normalizedError.durationMs = durationMs(error.config);
      normalizedError.original = error;

      publishApiFailure({
        requestId,
        requestUrl,
        method: error.config?.method,
        status,
        code: normalizedError.code,
        kind,
        duration: normalizedError.durationMs,
      });

      return Promise.reject(normalizedError);
    }
  );

  return client;
};

const apiClient = createApiClient(apiBaseUrl);
export default apiClient;
