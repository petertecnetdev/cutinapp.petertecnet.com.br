import { classifyPaymentFailure, paymentFailureGuidance } from "./paymentFailureGuidance";

describe("paymentFailureGuidance", () => {
  test("reads Mercado Pago status detail from provider payload without exposing it in guidance", () => {
    const result = paymentFailureGuidance({
      method: "card",
      pixAvailable: true,
      payment: { provider_payload: { status_detail: "cc_rejected_insufficient_amount" } },
    });
    expect(result.reason).toBe("insufficient_funds");
    expect(result.message).toContain("saldo ou limite insuficiente");
    expect(result.message).toContain("PIX");
  });

  test("guides correction when provider reports invalid card data", () => {
    const result = classifyPaymentFailure({ provider_payload: { status_detail: "cc_rejected_bad_filled_security_code" } }, "card");
    expect(result.reason).toBe("card_data");
  });

  test("falls back safely when provider does not return a specific reason", () => {
    const result = paymentFailureGuidance({ method: "card", payment: { status: "rejected" } });
    expect(result.reason).toBe("card_rejected");
    expect(result.message).not.toContain("PIX");
  });

  test("keeps PIX recovery specific and selection-preserving", () => {
    const result = paymentFailureGuidance({ method: "pix", payment: { status: "cancelled" } });
    expect(result.reason).toBe("pix_not_completed");
    expect(result.message).toContain("seleção continua preservada");
  });
});
