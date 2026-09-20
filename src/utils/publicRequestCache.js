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
    if (!raw) return null;
    const entry = JSON.parse(raw);
    memory.set(key, entry);
    return entry;
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

const store = (key, data) => {
  const entry = { at: Date.now(), data };
  memory.set(key, entry);
  writeSession(key, entry);
  return entry.data;
};

const revalidate = (client, key, url, params, fallback) => {
  const existing = inflight.get(key);
  if (existing) return existing.promise;

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const request = client.get(url, { params, ...(controller ? { signal: controller.signal } : {}) })
    .then((response) => store(key, response.data))
    .catch((error) => {
      if (fallback !== undefined) return fallback;
      throw error;
    })
    .finally(() => {
      if (inflight.get(key)?.promise === request) inflight.delete(key);
    });

  inflight.set(key, { promise: request, controller });
  return request;
};

export const invalidatePublicRequestCache = (prefix = "") => {
  for (const key of memory.keys()) if (!prefix || key.startsWith(prefix)) memory.delete(key);
  for (const [key, entry] of inflight.entries()) {
    if (!prefix || key.startsWith(prefix)) {
      entry.controller?.abort();
      inflight.delete(key);
    }
  }
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
  const age = cached ? now - cached.at : Infinity;

  if (cached && age <= ttlMs) return cached.data;

  // Stale-while-revalidate: exibe conteúdo aceitável imediatamente e atualiza
  // uma única vez em segundo plano para a próxima leitura.
  if (cached && age <= staleMs) {
    void revalidate(client, key, url, params, cached.data);
    return cached.data;
  }

  return revalidate(client, key, url, params);
};
