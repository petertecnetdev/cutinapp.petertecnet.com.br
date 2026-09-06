const SUPPORTED_PAYMENT_METHODS = new Set(["pix", "card"]);

export const resolveCheckoutPaymentMethod = (value, fallback = "pix") => {
  const candidates = [value?.order?.payment_method, value?.payment?.method, value?.payment_method, value?.method];
  const method = candidates.find((candidate) => typeof candidate === "string" && SUPPORTED_PAYMENT_METHODS.has(candidate.trim().toLowerCase()));
  return method ? method.trim().toLowerCase() : fallback;
};
