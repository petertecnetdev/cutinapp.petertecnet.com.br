import { createSearchSuggestionCache, stableSerialize } from "./searchSuggestionCache";

describe("search suggestion cache", () => {
  test("uses stable keys for equivalent payloads", () => {
    expect(stableSerialize({ type: "all", q: "rock" })).toBe(stableSerialize({ q: "rock", type: "all" }));
  });

  test("expires entries and reports misses", () => {
    let current = 1000;
    const cache = createSearchSuggestionCache({ ttlMs: 100, now: () => current });
    cache.set({ q: "rock" }, { terms: ["rock"] });
    expect(cache.get({ q: "rock" })).toEqual({ terms: ["rock"] });
    current += 101;
    expect(cache.get({ q: "rock" })).toBeUndefined();
    expect(cache.size()).toBe(0);
  });

  test("evicts the oldest entry when the bound is exceeded", () => {
    let current = 0;
    const cache = createSearchSuggestionCache({ maxEntries: 2, now: () => current });
    cache.set({ q: "a" }, "A");
    cache.set({ q: "b" }, "B");
    cache.set({ q: "c" }, "C");
    expect(cache.get({ q: "a" })).toBeUndefined();
    expect(cache.get({ q: "b" })).toBe("B");
    expect(cache.get({ q: "c" })).toBe("C");
  });
});
