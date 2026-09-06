import { isNetworkFailure } from "./networkStatus";

const uncertainStatuses = new Set([408, 409, 425, 429]);

export const shouldKeepCheckoutAttempt = (error) => {
  if (isNetworkFailure(error)) return true;

  const status = Number(error?.status || error?.response?.status || 0);
  if (uncertainStatuses.has(status)) return true;

  return status >= 500 && status <= 599;
};
