import { createIdempotencyAttemptManager, createOpaqueRequestKey } from "./idempotencyAttempts";

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
