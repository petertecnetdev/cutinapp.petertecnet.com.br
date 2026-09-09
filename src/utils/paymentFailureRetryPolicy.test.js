import { paymentFailureGuidance } from "./paymentFailureGuidance";

describe("payment failure retry policy", () => {
  test.each([
    "cc_rejected_blacklist",
    "cc_rejected_high_risk",
    "cc_rejected_max_attempts",
    "cc_rejected_rejected_by_issuer",
    "cc_rejected_other_reason",
    "cc_rejected_card_type_not_allowed",
    "cc_rejected_card_expired",
    "cc_rejected_insufficient_amount",
    "cc_rejected_card_disabled",
  ])("blocks an identical card retry for %s", (statusDetail) => {
    const result = paymentFailureGuidance({
      method: "card",
      pixAvailable: true,
      payment: { provider_payload: { status_detail: statusDetail } },
    });

    expect(result.retryAllowed).toBe(false);
    expect(result.statusCheckOnly).toBe(false);
  });

  test.each([
    "cc_rejected_bad_filled_security_code",
    "cc_rejected_bad_filled_date",
    "cc_rejected_bad_filled_card_number",
    "cc_rejected_invalid_installments",
    "cc_rejected_call_for_authorize",
  ])("keeps retry available when the buyer can correct %s", (statusDetail) => {
    const result = paymentFailureGuidance({
      method: "card",
      pixAvailable: true,
      payment: { provider_payload: { status_detail: statusDetail } },
    });

    expect(result.retryAllowed).toBe(true);
    expect(result.statusCheckOnly).toBe(false);
  });

  test("reserves status-only recovery for duplicate payments", () => {
    const result = paymentFailureGuidance({
      method: "card",
      pixAvailable: true,
      payment: { provider_payload: { status_detail: "cc_rejected_duplicated_payment" } },
    });

    expect(result.retryAllowed).toBe(false);
    expect(result.statusCheckOnly).toBe(true);
  });

  test("treats a cancelled expired card payment as an expired 3DS challenge, not an expired card", () => {
    const result = paymentFailureGuidance({
      method: "card",
      pixAvailable: true,
      payment: { status: "cancelled", status_detail: "expired" },
    });

    expect(result.reason).toBe("card_authentication_expired");
    expect(result.retryAllowed).toBe(true);
    expect(result.statusCheckOnly).toBe(false);
    expect(result.title).toBe("O prazo de autenticação do banco expirou");
  });
});
