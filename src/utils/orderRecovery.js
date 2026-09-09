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

export const isPendingPixRecoverable = (order = {}, nowMs = Date.now()) => {
  if (String(order?.status || "").trim().toLowerCase() !== "pending") return false;

  const payment = latestPaymentFromOrder(order);
  if (payment && String(payment?.status || "").trim().toLowerCase() !== "pending") return false;
  if (paymentMethodFromOrder(order) !== "pix") return false;

  const expiresAt = Date.parse(order?.expires_at || "");
  return Number.isFinite(expiresAt) && expiresAt > Number(nowMs || 0);
};

export const latestPendingPaymentFromOrder = (order = {}) => latestPaymentFromOrder(order);
