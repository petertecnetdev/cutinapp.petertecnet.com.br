import { prepareCheckoutFailureForRecovery, shouldKeepCheckoutAttempt } from "./checkoutRetryPolicy";

describe("shouldKeepCheckoutAttempt", () => {
  test.each([408, 409, 425, 429, 500, 502, 503, 504])("keeps idempotency key for uncertain HTTP %s responses", (status) => {
    expect(shouldKeepCheckoutAttempt({ status })).toBe(true);
  });

  test.each([400, 401, 403, 404, 422])("allows a fresh attempt after definitive HTTP %s responses", (status) => {
    expect(shouldKeepCheckoutAttempt({ status })).toBe(false);
  });

  test("reads axios response status", () => {
    expect(shouldKeepCheckoutAttempt({ response: { status: 503 } })).toBe(true);
  });
});

describe("prepareCheckoutFailureForRecovery", () => {
  test.each([
    "Não há quantidade suficiente no lote Lote 1.",
    "Não há quantidade suficiente de Camiseta.",
    "O lote Promocional não está mais disponível.",
  ])("keeps inventory 422 eligible for catalog reconciliation: %s", (message) => {
    const error = { status: 422, message };
    prepareCheckoutFailureForRecovery(error);
    expect(error.status).toBe(422);
    expect(error.serverStatus).toBeUndefined();
  });

  test.each([
    "Informe um CPF válido para o titular do cartão.",
    "Esta forma de pagamento não está disponível para esta organização.",
    "Este evento não está disponível para venda.",
    "Cortesias gratuitas não entram no checkout pago.",
  ])("preserves actionable non-inventory 422 instead of triggering stock recovery: %s", (message) => {
    const error = { status: 422, message };
    prepareCheckoutFailureForRecovery(error);
    expect(error.status).toBe(400);
    expect(error.serverStatus).toBe(422);
    expect(error.message).toBe(message);
  });
});
