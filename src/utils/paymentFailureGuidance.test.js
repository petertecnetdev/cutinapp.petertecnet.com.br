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
    expect(result.message).toContain("Recomendado: tente PIX");
  });

  test("guides correction when provider reports invalid card data", () => {
    const result = classifyPaymentFailure({ provider_payload: { status_detail: "cc_rejected_bad_filled_security_code" } }, "card");
    expect(result.reason).toBe("card_data");
  });

  test("explains disabled cards and recommends PIX without losing the selection", () => {
    const result = paymentFailureGuidance({
      method: "card",
      pixAvailable: true,
      payment: { provider_payload: { status_detail: "cc_rejected_card_disabled" } },
    });
    expect(result.reason).toBe("card_disabled");
    expect(result.title).toContain("bloqueado");
    expect(result.message).toContain("compras online");
    expect(result.message).toContain("sem refazer sua seleção");
  });

  test("redirects an unsupported card type to an eligible card or PIX", () => {
    const result = paymentFailureGuidance({
      method: "card",
      pixAvailable: true,
      payment: { provider_payload: { status_detail: "cc_rejected_card_type_not_allowed" } },
    });
    expect(result.reason).toBe("card_type_not_allowed");
    expect(result.title).toContain("tipo de cartão");
    expect(result.message).toContain("outro cartão elegível");
    expect(result.message).toContain("sem refazer sua seleção");
  });

  test("does not recommend repeating identical data after a security rejection", () => {
    const result = paymentFailureGuidance({
      method: "card",
      pixAvailable: true,
      payment: { provider_payload: { status_detail: "cc_rejected_high_risk" } },
    });
    expect(result.reason).toBe("security_review");
    expect(result.message).toContain("Não repita os mesmos dados");
    expect(result.message).toContain("Recomendado: tente PIX");
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
