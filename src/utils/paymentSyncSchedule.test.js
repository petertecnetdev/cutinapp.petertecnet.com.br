import { DEFAULT_DELAYS_MS, MAX_RETRY_AFTER_MS, RATE_LIMIT_DELAY_MS, getPaymentSyncDelay, parseRetryAfterMs } from "./paymentSyncSchedule";

describe("payment sync schedule", () => {
  it("backs off progressively while keeping initial confirmations fast", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 10].map((attempt) => getPaymentSyncDelay(attempt, { random: () => 0.5 })))
      .toEqual([1500, 1500, 3000, 5000, 10000, 15000, 30000, 30000]);
  });

  it("keeps the first two confirmation windows within two seconds before jitter", () => {
    expect(DEFAULT_DELAYS_MS.slice(0, 2).every((delay) => delay <= 2000)).toBe(true);
  });

  it("uses a jittered cooldown after rate limiting to avoid a synchronized retry wave", () => {
    expect(getPaymentSyncDelay(0, { rateLimited: true, random: () => 0 })).toBe(Math.round(RATE_LIMIT_DELAY_MS * 0.9));
    expect(getPaymentSyncDelay(0, { rateLimited: true, random: () => 0.5 })).toBe(RATE_LIMIT_DELAY_MS);
    expect(getPaymentSyncDelay(0, { rateLimited: true, random: () => 1 })).toBe(Math.round(RATE_LIMIT_DELAY_MS * 1.1));
  });

  it("honors numeric Retry-After without retrying before the server window", () => {
    expect(getPaymentSyncDelay(0, { rateLimited: true, retryAfter: "12", random: () => 0 })).toBe(12000);
    expect(getPaymentSyncDelay(0, { rateLimited: true, retryAfter: "12", random: () => 1 })).toBe(13200);
  });

  it("honors HTTP-date Retry-After and caps excessive server waits", () => {
    const now = Date.parse("2026-09-13T06:00:00Z");
    expect(parseRetryAfterMs("Sun, 13 Sep 2026 06:00:45 GMT", now)).toBe(45000);
    expect(parseRetryAfterMs("Sun, 13 Sep 2026 06:10:00 GMT", now)).toBe(MAX_RETRY_AFTER_MS);
    expect(parseRetryAfterMs("invalid", now)).toBeNull();
  });

  it("adds bounded jitter to avoid synchronized polling", () => {
    expect(getPaymentSyncDelay(2, { random: () => 0 })).toBe(Math.round(DEFAULT_DELAYS_MS[2] * 0.9));
    expect(getPaymentSyncDelay(2, { random: () => 1 })).toBe(Math.round(DEFAULT_DELAYS_MS[2] * 1.1));
  });
});
