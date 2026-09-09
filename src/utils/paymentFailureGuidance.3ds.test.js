import { classifyPaymentFailure, paymentFailureGuidance } from "./paymentFailureGuidance";

describe("failed 3DS recovery", () => {
  test("treats cc_rejected_3ds_challenge as a terminal authentication failure that can start a fresh challenge", () => {
    const payment = {
      status: "rejected",
      provider_payload: { status_detail: "cc_rejected_3ds_challenge" },
    };

    expect(classifyPaymentFailure(payment, "card")).toEqual({
      reason: "card_authentication_failed",
      detail: "cc_rejected_3ds_challenge",
    });

    const guidance = paymentFailureGuidance({
      method: "card",
      pixAvailable: true,
      payment,
    });

    expect(guidance.title).toContain("autenticação do cartão falhou");
    expect(guidance.message).toContain("não pode ser retomada");
    expect(guidance.message).toContain("inicie uma nova tentativa");
    expect(guidance.message).toContain("nova autenticação");
    expect(guidance.message).toContain("seleção continua preservada");
    expect(guidance.retryAllowed).toBe(true);
    expect(guidance.statusCheckOnly).toBe(false);
  });

  test("does not confuse a failed challenge with an expired challenge", () => {
    const guidance = paymentFailureGuidance({
      method: "card",
      payment: {
        status: "cancelled",
        provider_payload: { status_detail: "expired" },
      },
    });

    expect(guidance.reason).toBe("card_authentication_expired");
    expect(guidance.title).toContain("prazo de autenticação");
  });
});
