import {
  PAYMENT_RECOVERY_ATTRIBUTION_TTL_MS,
  clearPaymentRecoveryAttribution,
  readPaymentRecoveryAttribution,
  writePaymentRecoveryAttribution,
} from "./paymentRecoveryAttribution";

describe("paymentRecoveryAttribution", () => {
  beforeEach(() => window.sessionStorage.clear());

  test("keeps recovered GMV tied to the resumed order", () => {
    expect(writePaymentRecoveryAttribution({ orderPublicId: "ord_123", amount: 149.9 }, 1000)).toBe(true);
    expect(readPaymentRecoveryAttribution("ord_123", 2000)).toEqual({
      orderPublicId: "ord_123",
      amount: 149.9,
      startedAt: 1000,
    });
  });

  test("expires stale recovery attribution", () => {
    writePaymentRecoveryAttribution({ orderPublicId: "ord_123", amount: 80 }, 1000);
    expect(readPaymentRecoveryAttribution("ord_123", 1000 + PAYMENT_RECOVERY_ATTRIBUTION_TTL_MS + 1)).toBeNull();
  });

  test("clears attribution after recovered payment is counted", () => {
    writePaymentRecoveryAttribution({ orderPublicId: "ord_123", amount: 80 }, 1000);
    expect(clearPaymentRecoveryAttribution("ord_123")).toBe(true);
    expect(readPaymentRecoveryAttribution("ord_123", 2000)).toBeNull();
  });
});
