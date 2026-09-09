import { paymentFailureGuidance } from "./paymentFailureGuidance";

describe("issuer authorization recovery", () => {
  test("blocks an identical card retry until the buyer authorizes the purchase with the issuer", () => {
    const result = paymentFailureGuidance({
      method: "card",
      pixAvailable: true,
      payment: { provider_payload: { status_detail: "cc_rejected_call_for_authorize" } },
    });

    expect(result.reason).toBe("issuer_authorization");
    expect(result.message).toContain("Autorize no seu banco primeiro");
    expect(result.retryAllowed).toBe(false);
    expect(result.statusCheckOnly).toBe(false);
  });

  test("keeps corrective card retries enabled when the buyer can fix the data in checkout", () => {
    const result = paymentFailureGuidance({
      method: "card",
      pixAvailable: true,
      payment: { provider_payload: { status_detail: "cc_rejected_bad_filled_security_code" } },
    });

    expect(result.reason).toBe("card_security_code");
    expect(result.retryAllowed).toBe(true);
  });
});
