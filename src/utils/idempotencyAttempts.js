import { isNetworkFailure } from "./networkStatus";
import { safeGetSessionJson, safeRemoveSessionItem, safeSetSessionJson } from "./safeStorage";

const uncertainStatuses = new Set([408, 409, 425, 429]);

const requestKeyHash = (value) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

export const shouldKeepIdempotencyAttempt = (error) => {
  if (isNetworkFailure(error)) return true;

  const status = Number(error?.status || error?.response?.status || 0);
  if (uncertainStatuses.has(status)) return true;

  return status >= 500 && status <= 599;
};

export const createIdempotencyAttemptManager = ({ storagePrefix, keyPrefix = "mutation" }) => {
  const fallbackAttempts = new Map();
  const storageFor = (requestKey) => `${storagePrefix}${requestKeyHash(requestKey)}`;

  const createKey = () => {
    if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
    return `${keyPrefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
  };

  const read = (requestKey) => {
    const stored = safeGetSessionJson(storageFor(requestKey));
    if (stored?.requestKey === requestKey && stored?.idempotencyKey) return stored.idempotencyKey;
    return fallbackAttempts.get(requestKey) || null;
  };

  const save = (requestKey, idempotencyKey) => {
    fallbackAttempts.set(requestKey, idempotencyKey);
    safeSetSessionJson(storageFor(requestKey), { requestKey, idempotencyKey });
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
