const normalizeHeaderValue = (value) => {
  if (Array.isArray(value)) return String(value[0] || "").trim();
  return String(value || "").trim();
};

const randomSegment = () => Math.random().toString(36).slice(2, 12);

export const createRequestId = () => {
  if (typeof globalThis !== "undefined" && typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `cut-${Date.now().toString(36)}-${randomSegment()}`;
};

export const getHeaderValue = (headers, name) => {
  if (!headers || !name) return "";

  if (typeof headers.get === "function") {
    return normalizeHeaderValue(headers.get(name));
  }

  const target = String(name).toLowerCase();
  const entry = Object.entries(headers).find(([key]) => String(key).toLowerCase() === target);
  return entry ? normalizeHeaderValue(entry[1]) : "";
};

export const resolveRequestId = ({ responseHeaders, requestHeaders } = {}) => (
  getHeaderValue(responseHeaders, "x-request-id") ||
  getHeaderValue(responseHeaders, "x-correlation-id") ||
  getHeaderValue(requestHeaders, "x-request-id") ||
  ""
);
