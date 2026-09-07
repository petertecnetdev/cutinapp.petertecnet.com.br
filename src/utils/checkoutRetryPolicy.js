import { shouldKeepIdempotencyAttempt } from "./idempotencyAttempts";

const checkoutMessage = (error) => String(error?.data?.message || error?.message || "").trim().toLowerCase();

const inventoryConflict422 = (message) => message.includes("não há quantidade suficiente")
  || (message.startsWith("o lote ") && message.includes(" não está mais disponível"));

const hasValidationErrors = (error) => Boolean(
  error?.errors
  && typeof error.errors === "object"
  && Object.keys(error.errors).length
);

const actionableNonInventory422 = (message) => [
  "cpf válido",
  "forma de pagamento não está disponível",
  "evento não está disponível para venda",
  "evento já foi encerrado",
  "organização do evento é inválida",
  "cortesias gratuitas não entram no checkout pago",
  "selecione ao menos um ingresso ou item",
  "conecte uma conta de pagamento",
].some((fragment) => message.includes(fragment));

export const prepareCheckoutFailureForRecovery = (error) => {
  if (!error || Number(error?.status || 0) !== 422) return error;

  const message = checkoutMessage(error);
  if (!message || inventoryConflict422(message)) return error;
  if (!hasValidationErrors(error) && !actionableNonInventory422(message)) return error;

  // CheckoutPage reserves 422 for authoritative inventory reconciliation. Keep
  // the original server status available while routing known validation/payment
  // failures through their actionable message instead of a false stock refresh.
  error.serverStatus = 422;
  error.status = 400;
  return error;
};

export const shouldKeepCheckoutAttempt = (error) => {
  const keepAttempt = shouldKeepIdempotencyAttempt(error);
  prepareCheckoutFailureForRecovery(error);
  return keepAttempt;
};
