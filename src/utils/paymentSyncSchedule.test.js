import { DEFAULT_DELAYS_MS, RATE_LIMIT_DELAY_MS, getPaymentSyncDelay } from "./paymentSyncSchedule";

describe("payment sync schedule", () => {
  it("backs off progressively while keeping initial confirmations fast", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 10].map((attempt) => getPaymentSyncDelay(attempt, { random: () => 0.5 })))
      .toEqual([2500, 4000, 6000, 10000, 15000, 30000, 60000, 60000]);
  });

  it("uses a cooldown after rate limiting", () => {
    expect(getPaymentSyncDelay(0, { rateLimited: true, random: () => 0 })).toBe(RATE_LIMIT_DELAY_MS);
  });

  it("adds bounded jitter to avoid synchronized polling", () => {
    expect(getPaymentSyncDelay(2, { random: () => 0 })).toBe(Math.round(DEFAULT_DELAYS_MS[2] * 0.9));
    expect(getPaymentSyncDelay(2, { random: () => 1 })).toBe(Math.round(DEFAULT_DELAYS_MS[2] * 1.1));
  });
});
