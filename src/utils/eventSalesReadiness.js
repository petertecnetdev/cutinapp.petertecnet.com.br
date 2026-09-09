export const sellableTicketCount = (event) => {
  const available = event?.available_tickets_count;
  return available === undefined || available === null
    ? Number(event?.tickets_count || 0)
    : Number(available || 0);
};

export const hasSellableTickets = (event) => sellableTicketCount(event) > 0;
