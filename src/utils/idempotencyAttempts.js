import { isNetworkFailure } from "./networkStatus";
import { safeGetSessionJson, safeRemoveSessionItem, safeSetSessionJson } from "./safeStorage";

const uncertainStatuses = new Set([408, 409, 425, 429]);

export const createOpaqueRequestKey = (value) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

const requestValueSignature = (value) => {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return String(value ?? "");

  if (typeof File !== "undefined" && value instanceof File) {
    return {
      name: String(value.name || ""),
      size: Number(value.size || 0),
      type: String(value.type || ""),
      lastModified: Number(value.lastModified || 0),
    };
  }

  if (typeof Blob !== "undefined" && value instanceof Blob) {
    return {
      size: Number(value.size || 0),
      type: String(value.type || ""),
    };
  }

  return value;
};

export const createMutationRequestKey = (payload) => {
  if (payload && typeof payload.entries === "function") {
    return JSON.stringify(Array.from(payload.entries())
      .map(([key, value]) => [String(key), requestValueSignature(value)])
      .sort(([left], [right]) => left.localeCompare(right)));
  }

  if (payload && typeof payload === "object") {
    return JSON.stringify(Object.keys(payload).sort().map((key) => [key, requestValueSignature(payload[key])]));
  }

  return JSON.stringify(payload ?? null);
};

export const shouldKeepIdempotencyAttempt = (error) => {
  if (isNetworkFailure(error)) return true;

  const status = Number(error?.status || error?.response?.status || 0);
  if (uncertainStatuses.has(status)) return true;

  return status >= 500 && status <= 599;
};

export const createIdempotencyAttemptManager = ({ storagePrefix, keyPrefix = "mutation" }) => {
  const fallbackAttempts = new Map();
  const storageFor = (requestKey) => `${storagePrefix}${createOpaqueRequestKey(requestKey)}`;

  const createKey = () => {
    if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
    return `${keyPrefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
  };

  const read = (requestKey) => {
    const requestKeyHash = createOpaqueRequestKey(requestKey);
    const stored = safeGetSessionJson(storageFor(requestKey));
    const matchesCurrentFormat = stored?.requestKeyHash === requestKeyHash;
    const matchesLegacyFormat = stored?.requestKey === requestKey;
    if ((matchesCurrentFormat || matchesLegacyFormat) && stored?.idempotencyKey) return stored.idempotencyKey;
    return fallbackAttempts.get(requestKey) || null;
  };

  const save = (requestKey, idempotencyKey) => {
    fallbackAttempts.set(requestKey, idempotencyKey);
    safeSetSessionJson(storageFor(requestKey), {
      requestKeyHash: createOpaqueRequestKey(requestKey),
      idempotencyKey,
    });
  };

  return {
    keyFor(requestKey) {
      const existing = read(requestKey);
      if (existing) return existing;
      const created = createKey();
      save(requestKey, created);
      return created;
    },
    clear(requestKey) {
      fallbackAttempts.delete(requestKey);
      safeRemoveSessionItem(storageFor(requestKey));
    },
  };
};
