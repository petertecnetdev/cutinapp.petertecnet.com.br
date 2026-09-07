import {
  CHECKOUT_PAYMENT_RECOVERY_TTL_MS,
  clearCheckoutPaymentRecovery,
  readCheckoutPaymentRecovery,
  writeCheckoutPaymentRecovery,
} from "./checkoutPaymentRecovery";

describe("checkoutPaymentRecovery", () => {
  beforeEach(() => window.sessionStorage.clear());

  test("keeps failure attribution until a recovered checkout is approved", () => {
    expect(writeCheckoutPaymentRecovery({
      slug: "festival-2026",
      reason: "insufficient_funds",
      fromMethod: "card",
      toMethod: "pix",
      amount: 149.9,
    }, 1000)).toBe(true);

    expect(readCheckoutPaymentRecovery("festival-2026", 2000)).toEqual({
      reason: "insufficient_funds",
      fromMethod: "card",
      toMethod: "pix",
      amount: 149.9,
      startedAt: 1000,
    });
  });

  test("expires stale attribution so unrelated future purchases are not credited", () => {
    writeCheckoutPaymentRecovery({ slug: "festival-2026", reason: "card_rejected" }, 1000);
    expect(readCheckoutPaymentRecovery("festival-2026", 1000 + CHECKOUT_PAYMENT_RECOVERY_TTL_MS + 1)).toBeNull();
  });

  test("can clear attribution after conversion is recorded", () => {
    writeCheckoutPaymentRecovery({ slug: "festival-2026", reason: "card_rejected" }, 1000);
    expect(clearCheckoutPaymentRecovery("festival-2026")).toBe(true);
    expect(readCheckoutPaymentRecovery("festival-2026", 2000)).toBeNull();
  });
});
