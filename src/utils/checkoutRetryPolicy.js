import { shouldKeepIdempotencyAttempt } from "./idempotencyAttempts";

const checkoutMessage = (error) => String(error?.data?.message || error?.message || "").trim().toLowerCase();

const inventoryConflict422 = (message) => message.includes("não há quantidade suficiente")
  || (message.startsWith("o lote ") && message.includes(" não está mais disponível"));

export const prepareCheckoutFailureForRecovery = (error) => {
  if (!error || Number(error?.status || 0) !== 422) return error;

  const message = checkoutMessage(error);
  if (!message || inventoryConflict422(message)) return error;

  // CheckoutPage reserves 422 for authoritative inventory reconciliation. Keep
  // the original server status available while routing other validation/payment
  // failures through their actionable error message instead of a false stock refresh.
  error.serverStatus = 422;
  error.status = 400;
  return error;
};

export const shouldKeepCheckoutAttempt = (error) => {
  const keepAttempt = shouldKeepIdempotencyAttempt(error);
  prepareCheckoutFailureForRecovery(error);
  return keepAttempt;
};
