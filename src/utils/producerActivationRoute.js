export const nextProducerActivationRoute = ({ eventId, ticketId, ticketType }) => {
  const normalizedEventId = Number(eventId || 0);
  const normalizedTicketId = Number(ticketId || 0);

  if (!normalizedEventId) return "/event/manage";

  const params = new URLSearchParams({ activation: "first-ticket" });
  if (normalizedTicketId) params.set("created", String(normalizedTicketId));

  if (ticketType === "paid") {
    return `/event/edit/${normalizedEventId}?${params.toString()}`;
  }

  return `/event/${normalizedEventId}/courtesies?${params.toString()}`;
};
