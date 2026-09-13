export const sellableTicketCount = (event) => {
  const available = event?.available_tickets_count;
  return available === undefined || available === null
    ? Number(event?.tickets_count || 0)
    : Number(available || 0);
};

export const hasSellableTickets = (event) => sellableTicketCount(event) > 0;

export const requiresPaymentSetup = (event) => Number(event?.available_paid_tickets_count || 0) > 0;

export const isEventPaymentReady = (event) => {
  if (!requiresPaymentSetup(event)) return true;
  if (!event?.payment_readiness) return true;
  return Boolean(event.payment_readiness.available);
};
