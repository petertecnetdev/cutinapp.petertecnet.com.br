import { paymentFailureGuidance } from "./paymentFailureGuidance";

describe("paymentFailureGuidance generic card rejection recovery", () => {
  test("avoids immediate identical retry and recommends PIX when the provider gives no specific reason", () => {
    const result = paymentFailureGuidance({
      method: "card",
      pixAvailable: true,
      payment: { status: "rejected" },
    });

    expect(result.reason).toBe("card_rejected");
    expect(result.message).toContain("não informou um motivo específico");
    expect(result.message).toContain("Evite repetir imediatamente os mesmos dados");
    expect(result.message).toContain("outro cartão");
    expect(result.message).toContain("Recomendado: tente PIX");
    expect(result.message).toContain("sem refazer sua seleção");
  });

  test("keeps the fallback safe when PIX is unavailable", () => {
    const result = paymentFailureGuidance({
      method: "card",
      pixAvailable: false,
      payment: { status: "rejected" },
    });

    expect(result.reason).toBe("card_rejected");
    expect(result.message).toContain("use outro cartão ou consulte o banco emissor");
    expect(result.message).not.toContain("PIX");
  });
});
