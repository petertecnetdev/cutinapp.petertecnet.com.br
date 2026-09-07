const memory = new Map();
const inflight = new Map();
const SESSION_PREFIX = "cutinapp_public_cache_v1:";

const stable = (value) => {
  if (value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(stable);
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
};

const keyFor = (url, params) => `${url}?${JSON.stringify(stable(params || {}))}`;

const readSession = (key) => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(`${SESSION_PREFIX}${key}`);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
};

const writeSession = (key, entry) => {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(`${SESSION_PREFIX}${key}`, JSON.stringify(entry));
  } catch (_) {
    // sessionStorage pode estar indisponível; cache em memória continua funcionando.
  }
};

export const invalidatePublicRequestCache = (prefix = "") => {
  for (const key of memory.keys()) if (!prefix || key.startsWith(prefix)) memory.delete(key);
  if (typeof window === "undefined") return;
  try {
    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const storageKey = window.sessionStorage.key(index);
      if (!storageKey?.startsWith(SESSION_PREFIX)) continue;
      const requestKey = storageKey.slice(SESSION_PREFIX.length);
      if (!prefix || requestKey.startsWith(prefix)) window.sessionStorage.removeItem(storageKey);
    }
  } catch (_) {
    // Falha ao limpar sessionStorage não deve bloquear a invalidação em memória.
  }
};

export const cachedPublicGet = async (client, url, { params = {}, ttlMs = 15000, staleMs = 120000 } = {}) => {
  const key = keyFor(url, params);
  const now = Date.now();
  const cached = memory.get(key) || readSession(key);

  if (cached && now - cached.at <= ttlMs) return cached.data;
  if (inflight.has(key)) return inflight.get(key);

  const request = client.get(url, { params })
    .then((response) => {
      const entry = { at: Date.now(), data: response.data };
      memory.set(key, entry);
      writeSession(key, entry);
      return entry.data;
    })
    .catch((error) => {
      if (cached && now - cached.at <= staleMs) return cached.data;
      throw error;
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, request);
  return request;
};
