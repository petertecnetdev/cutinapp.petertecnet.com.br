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
    expect(result.message).toContain("Não repita a mesma tentativa");
    expect(result.message).toContain("Recomendado: tente PIX");
  });

  test("guides correction when provider reports another invalid card field", () => {
    const result = paymentFailureGuidance({
      method: "card",
      pixAvailable: true,
      payment: { provider_payload: { status_detail: "cc_rejected_bad_filled_other" } },
    });
    expect(result.reason).toBe("card_additional_data");
    expect(result.title).toContain("outros dados do cartão");
    expect(result.message).toContain("diferente de número, validade ou CVV");
    expect(result.message).toContain("demais campos solicitados");
    expect(result.message).toContain("seleção continua preservada");
    expect(result.message).toContain("sem refazer sua seleção");
  });

  test("points directly to CVV when the provider rejects the security code", () => {
    const result = paymentFailureGuidance({
      method: "card",
      pixAvailable: true,
      payment: { provider_payload: { status_detail: "cc_rejected_bad_filled_security_code" } },
    });
    expect(result.reason).toBe("card_security_code");
    expect(result.title).toContain("código de segurança");
    expect(result.message).toContain("CVV");
    expect(result.message).toContain("3 ou 4 dígitos");
    expect(result.message).toContain("sem refazer sua seleção");
  });

  test("points directly to expiration data when month or year is invalid", () => {
    const result = paymentFailureGuidance({
      method: "card",
      payment: { provider_payload: { status_detail: "cc_rejected_bad_filled_date" } },
    });
    expect(result.reason).toBe("card_expiration_data");
    expect(result.title).toContain("validade");
    expect(result.message).toContain("mês e ano");
  });

  test("points directly to card number when provider reports invalid digits", () => {
    const result = paymentFailureGuidance({
      method: "card",
      payment: { provider_payload: { status_detail: "cc_rejected_bad_filled_card_number" } },
    });
    expect(result.reason).toBe("card_number");
    expect(result.title).toContain("número do cartão");
    expect(result.message).toContain("Confira os dígitos");
  });

  test("guides the buyer to change installments when the provider rejects the selected plan", () => {
    const result = paymentFailureGuidance({
      method: "card",
      pixAvailable: true,
      payment: { provider_payload: { status_detail: "cc_rejected_invalid_installments" } },
    });
    expect(result.reason).toBe("invalid_installments");
    expect(result.title).toContain("parcelas");
    expect(result.message).toContain("outra quantidade de parcelas");
    expect(result.message).toContain("valor da compra continuam preservados");
    expect(result.message).toContain("sem refazer sua seleção");
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
    expect(result.message).toContain("antes de tentar novamente");
    expect(result.message).toContain("sem refazer sua seleção");
  });

  test("redirects an unsupported card type to an eligible card or PIX without retrying it", () => {
    const result = paymentFailureGuidance({
      method: "card",
      pixAvailable: true,
      payment: { provider_payload: { status_detail: "cc_rejected_card_type_not_allowed" } },
    });
    expect(result.reason).toBe("card_type_not_allowed");
    expect(result.title).toContain("tipo de cartão");
    expect(result.message).toContain("Não repita este cartão");
    expect(result.message).toContain("outro cartão elegível");
    expect(result.message).toContain("sem refazer sua seleção");
  });

  test("does not recommend retrying an expired card", () => {
    const result = paymentFailureGuidance({
      method: "card",
      pixAvailable: true,
      payment: { provider_payload: { status_detail: "cc_rejected_card_expired" } },
    });
    expect(result.reason).toBe("expired_card");
    expect(result.message).toContain("Não tente novamente com este cartão");
    expect(result.message).toContain("outro cartão válido");
  });

  test("requires issuer authorization before another card attempt", () => {
    const result = paymentFailureGuidance({
      method: "card",
      pixAvailable: true,
      payment: { provider_payload: { status_detail: "cc_rejected_call_for_authorize" } },
    });
    expect(result.reason).toBe("issuer_authorization");
    expect(result.message).toContain("Autorize no seu banco primeiro");
    expect(result.message).toContain("só então tente novamente");
  });

  test("stops a duplicate-payment rejection from sending the buyer to another payment method", () => {
    const result = paymentFailureGuidance({
      method: "card",
      pixAvailable: true,
      payment: { provider_payload: { status_detail: "cc_rejected_duplicated_payment" } },
    });
    expect(result.reason).toBe("duplicate_payment");
    expect(result.title).toContain("pagamento semelhante");
    expect(result.message).toContain("Não tente pagar novamente com outro cartão ou PIX agora");
    expect(result.message).toContain("Verifique o status da compra");
    expect(result.message).not.toContain("Recomendado: tente PIX");
    expect(result.retryAllowed).toBe(false);
  });

  test("keeps recovery actions enabled for ordinary recoverable failures", () => {
    const result = paymentFailureGuidance({
      method: "card",
      pixAvailable: true,
      payment: { provider_payload: { status_detail: "cc_rejected_bad_filled_security_code" } },
    });
    expect(result.reason).toBe("card_security_code");
    expect(result.retryAllowed).toBe(true);
  });

  test("does not recommend repeating identical data after a blacklist security block", () => {
    const result = paymentFailureGuidance({
      method: "card",
      pixAvailable: true,
      payment: { provider_payload: { status_detail: "cc_rejected_blacklist" } },
    });
    expect(result.reason).toBe("security_block");
    expect(result.title).toContain("não pode ser usado");
    expect(result.message).toContain("Não repita o mesmo cartão em sequência");
    expect(result.message).toContain("fale com o banco emissor");
    expect(result.message).toContain("Recomendado: tente PIX");
  });

  test("routes unspecified issuer or risk rejection away from an immediate identical retry", () => {
    const result = paymentFailureGuidance({
      method: "card",
      pixAvailable: true,
      payment: { provider_payload: { status_detail: "cc_rejected_other_reason" } },
    });
    expect(result.reason).toBe("issuer_or_risk_rejection");
    expect(result.title).toContain("banco não aprovou");
    expect(result.message).toContain("trocar o meio de pagamento");
    expect(result.message).toContain("Evite repetir imediatamente os mesmos dados");
    expect(result.message).toContain("Recomendado: tente PIX");
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

  test("does not recommend repeating identical data after an attempt limit", () => {
    const result = paymentFailureGuidance({
      method: "card",
      pixAvailable: true,
      payment: { provider_payload: { status_detail: "cc_rejected_max_attempts" } },
    });
    expect(result.reason).toBe("attempt_limit");
    expect(result.message).toContain("Não repita os mesmos dados");
  });

  test("falls back safely when provider does not return a specific reason", () => {
    const result = paymentFailureGuidance({ method: "card", payment: { status: "rejected" } });
    expect(result.reason).toBe("card_rejected");
    expect(result.message).not.toContain("PIX");
  });

  test("explains an expired PIX and preserves the current selection", () => {
    const result = paymentFailureGuidance({ method: "pix", payment: { status: "expired" } });
    expect(result.reason).toBe("pix_expired");
    expect(result.title).toContain("expirou");
    expect(result.message).toContain("não está mais ativo");
    expect(result.message).toContain("seleção continua preservada");
  });

  test("explains a cancelled PIX without suggesting that the old code remains usable", () => {
    const result = paymentFailureGuidance({ method: "pix", payment: { status: "cancelled" } });
    expect(result.reason).toBe("pix_cancelled");
    expect(result.title).toContain("encerrado");
    expect(result.message).toContain("não está mais ativa");
    expect(result.message).toContain("novo PIX");
  });

  test("distinguishes a rejected PIX for recovery attribution", () => {
    const result = paymentFailureGuidance({
      method: "pix",
      payment: { provider_payload: { status_detail: "pix_rejected" } },
    });
    expect(result.reason).toBe("pix_rejected");
    expect(result.message).toContain("não pôde ser concluída");
    expect(result.message).toContain("seleção continua preservada");
  });

  test("keeps generic PIX recovery selection-preserving when no specific status is available", () => {
    const result = paymentFailureGuidance({ method: "pix", payment: { status: "unknown" } });
    expect(result.reason).toBe("pix_not_completed");
    expect(result.message).toContain("seleção continua preservada");
  });
});
