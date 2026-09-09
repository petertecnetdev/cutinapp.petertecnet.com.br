export const checkoutSelectionFromOrder = (order = {}) => {
  const tickets = [];
  const items = [];

  for (const line of Array.isArray(order?.items) ? order.items : []) {
    const quantity = Math.max(1, Number(line?.quantity || 1));
    if (line?.type === "ticket" && Number(line?.ticket_id || 0) > 0) {
      tickets.push({ id: Number(line.ticket_id), quantity });
      continue;
    }
    if (Number(line?.event_item_id || 0) > 0) {
      items.push({ id: Number(line.event_item_id), quantity });
    }
  }

  return { tickets, items };
};

export const latestPaymentFromOrder = (order = {}) => {
  const payments = Array.isArray(order?.payments) ? order.payments : [];
  if (!payments.length) return null;
  return payments.reduce((latest, payment) => (
    Number(payment?.id || 0) > Number(latest?.id || 0) ? payment : latest
  ), payments[0]);
};

export const paymentMethodFromOrder = (order = {}) => {
  const latestPayment = latestPaymentFromOrder(order);
  return String(latestPayment?.method || order?.payment_method || "").trim().toLowerCase();
};

export const pendingPixExpirationState = (order = {}, nowMs = Date.now()) => {
  if (String(order?.status || "").trim().toLowerCase() !== "pending") return null;
  if (paymentMethodFromOrder(order) !== "pix") return null;

  const payment = latestPaymentFromOrder(order);
  if (payment && String(payment?.status || "").trim().toLowerCase() !== "pending") return null;

  const expiresAtMs = Date.parse(order?.expires_at || "");
  if (!Number.isFinite(expiresAtMs)) return null;

  const remainingMs = expiresAtMs - Number(nowMs || 0);
  return {
    expiresAtMs,
    remainingMs: Math.max(0, remainingMs),
    remainingMinutes: remainingMs > 0 ? Math.max(1, Math.ceil(remainingMs / 60000)) : 0,
    expired: remainingMs <= 0,
  };
};

export const isPendingPixRecoverable = (order = {}, nowMs = Date.now()) => {
  const expiration = pendingPixExpirationState(order, nowMs);
  return Boolean(expiration && !expiration.expired);
};

export const isPendingPixExpired = (order = {}, nowMs = Date.now()) => Boolean(
  pendingPixExpirationState(order, nowMs)?.expired,
);

export const latestPendingPaymentFromOrder = (order = {}) => latestPaymentFromOrder(order);
