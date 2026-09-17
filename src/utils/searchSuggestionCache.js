const DEFAULT_TTL_MS = 15000;
const DEFAULT_MAX_ENTRIES = 40;

const stableSerialize = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
};

export const createSearchSuggestionCache = ({
  ttlMs = DEFAULT_TTL_MS,
  maxEntries = DEFAULT_MAX_ENTRIES,
  now = () => Date.now(),
} = {}) => {
  const entries = new Map();

  const prune = () => {
    const current = now();
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= current) entries.delete(key);
    }
    while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
  };

  return {
    get(payload) {
      prune();
      const key = stableSerialize(payload);
      const entry = entries.get(key);
      if (!entry) return undefined;
      entries.delete(key);
      entries.set(key, entry);
      return entry.value;
    },
    set(payload, value) {
      prune();
      const key = stableSerialize(payload);
      entries.delete(key);
      entries.set(key, { value, expiresAt: now() + ttlMs });
      prune();
      return value;
    },
    clear() {
      entries.clear();
    },
    size() {
      prune();
      return entries.size;
    },
  };
};

export { stableSerialize };
