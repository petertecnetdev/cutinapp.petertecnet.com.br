import { DEFAULT_DELAYS_MS, RATE_LIMIT_DELAY_MS, getPaymentSyncDelay } from "./paymentSyncSchedule";

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

  it("adds bounded jitter to avoid synchronized polling", () => {
    expect(getPaymentSyncDelay(2, { random: () => 0 })).toBe(Math.round(DEFAULT_DELAYS_MS[2] * 0.9));
    expect(getPaymentSyncDelay(2, { random: () => 1 })).toBe(Math.round(DEFAULT_DELAYS_MS[2] * 1.1));
  });
});
