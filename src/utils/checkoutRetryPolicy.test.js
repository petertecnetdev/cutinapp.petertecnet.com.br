import { isCheckoutInventoryConflict, isCheckoutOperationInProgress, prepareCheckoutFailureForRecovery, shouldKeepCheckoutAttempt } from "./checkoutRetryPolicy";

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
    "Estoque esgotado para este adicional.",
    "Estoque insuficiente para concluir a compra.",
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
    "Pagamento recusado pelo provedor. Use outro cartão.",
    "Não foi possível validar os dados do pagamento.",
  ])("preserves non-inventory 422 instead of triggering false stock recovery: %s", (message) => {
    const error = { status: 422, message };
    prepareCheckoutFailureForRecovery(error);
    expect(error.status).toBe(400);
    expect(error.serverStatus).toBe(422);
    expect(error.message).toBe(message);
  });

  test("routes a 422 without a message away from inventory recovery", () => {
    const error = { status: 422 };
    prepareCheckoutFailureForRecovery(error);
    expect(error.status).toBe(400);
    expect(error.serverStatus).toBe(422);
  });
});

describe("checkout conflict classification", () => {
  test("classifies authoritative stock shortage as inventory conflict", () => {
    expect(isCheckoutInventoryConflict({ status: 422, message: "Não há quantidade suficiente no lote VIP." })).toBe(true);
  });

  test("does not classify idempotency processing conflict as inventory change", () => {
    expect(isCheckoutInventoryConflict({ status: 409, message: "Esta operação já está em processamento." })).toBe(false);
    expect(isCheckoutOperationInProgress({ status: 409, message: "Esta operação já está em processamento." })).toBe(true);
  });

  test("keeps processing conflicts out of inventory recovery without losing the idempotency attempt", () => {
    const error = { status: 409, message: "Esta operação já está em processamento." };
    expect(shouldKeepCheckoutAttempt(error)).toBe(true);
    expect(error.status).toBe(425);
    expect(error.serverStatus).toBe(409);
    expect(error.message).toContain("Não inicie outra cobrança");
  });
});
