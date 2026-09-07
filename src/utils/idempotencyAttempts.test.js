import { createIdempotencyAttemptManager, createIdempotentMutation, createOpaqueRequestKey } from "./idempotencyAttempts";

describe("idempotencyAttempts privacy", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  test("persists only an opaque request signature, not sensitive request data", () => {
    const manager = createIdempotencyAttemptManager({
      storagePrefix: "privacy_test_",
      keyPrefix: "privacy",
    });
    const requestKey = "event=80:token=QR-SECRET-123:recipient=user@example.com";

    const idempotencyKey = manager.keyFor(requestKey);
    const stored = Object.values(sessionStorage).join(" ");

    expect(stored).toContain(idempotencyKey);
    expect(stored).toContain(createOpaqueRequestKey(requestKey));
    expect(stored).not.toContain("QR-SECRET-123");
    expect(stored).not.toContain("user@example.com");
    expect(stored).not.toContain(requestKey);
  });

  test("keeps backward compatibility with legacy persisted attempts", () => {
    const manager = createIdempotencyAttemptManager({
      storagePrefix: "legacy_test_",
      keyPrefix: "legacy",
    });
    const requestKey = "legacy-sensitive-request";
    const storageKey = `legacy_test_${createOpaqueRequestKey(requestKey)}`;
    sessionStorage.setItem(storageKey, JSON.stringify({
      requestKey,
      idempotencyKey: "legacy-idempotency-key",
    }));

    expect(manager.keyFor(requestKey)).toBe("legacy-idempotency-key");
  });

  test("clear removes the persisted attempt", () => {
    const manager = createIdempotencyAttemptManager({
      storagePrefix: "clear_test_",
      keyPrefix: "clear",
    });
    const requestKey = "request-to-clear";
    manager.keyFor(requestKey);

    manager.clear(requestKey);

    expect(sessionStorage.length).toBe(0);
  });
});

describe("createIdempotentMutation", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  test("invokes immediately and deduplicates equivalent concurrent mutations", async () => {
    let resolveMutation;
    const mutate = jest.fn(() => new Promise((resolve) => { resolveMutation = resolve; }));
    const mutation = createIdempotentMutation({
      storagePrefix: "mutation_test_",
      keyPrefix: "mutation-test",
      requestKeyFor: (payload) => JSON.stringify(payload),
      mutate,
    });

    const first = mutation({ id: 7 });
    const second = mutation({ id: 7 });

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);

    resolveMutation({ ok: true });
    await expect(first).resolves.toEqual({ ok: true });
  });

  test("reuses the idempotency key after an uncertain server failure", async () => {
    const keys = [];
    const mutate = jest.fn(({ idempotencyKey }) => {
      keys.push(idempotencyKey);
      if (keys.length === 1) return Promise.reject({ response: { status: 503 } });
      return Promise.resolve({ ok: true });
    });
    const mutation = createIdempotentMutation({
      storagePrefix: "retry_test_",
      keyPrefix: "retry-test",
      requestKeyFor: () => "same-request",
      mutate,
    });

    await expect(mutation()).rejects.toMatchObject({ response: { status: 503 } });
    await expect(mutation()).resolves.toEqual({ ok: true });

    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
  });
});
