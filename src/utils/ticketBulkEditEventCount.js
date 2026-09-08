export const countSelectedTicketEvents = (tickets = []) => new Set(
  tickets.map((ticket) => Number(ticket?.event_id || ticket?.event?.id || 0)).filter(Boolean),
).size;
