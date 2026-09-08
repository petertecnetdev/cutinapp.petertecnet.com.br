export const defaultBulkTicketSelection = (sourceTicket, similarTickets = []) => {
  const ids = [];
  if (sourceTicket?.id) ids.push(Number(sourceTicket.id));
  similarTickets.forEach((ticket) => {
    if (Number(ticket?.similarity_score || 0) >= 85 && ticket?.id) ids.push(Number(ticket.id));
  });
  return Array.from(new Set(ids));
};

export const maxIssuedAcrossTickets = (tickets = []) => tickets.reduce(
  (max, ticket) => Math.max(max, Number(ticket?.passes_count || 0)),
  0,
);

export const buildBulkTicketUpdatePayload = ({
  selectedIds = [],
  enabledFields = {},
  values = {},
  cutoffRule = null,
} = {}) => {
  const payload = { ticket_ids: Array.from(new Set(selectedIds.map(Number).filter(Boolean))) };

  if (enabledFields.name) payload.name = String(values.name || "").trim();
  if (enabledFields.price) {
    payload.price = Number(values.price || 0);
    if (values.ticket_type) payload.ticket_type = values.ticket_type;
  }
  if (enabledFields.quantity) payload.quantity = Number(values.quantity || 0);
  if (enabledFields.description) payload.description = String(values.description || "").trim() || null;
  if (enabledFields.cutoff && cutoffRule) {
    payload.sales_cutoff_mode = cutoffRule.mode;
    payload.sales_cutoff_offset_minutes = Number(cutoffRule.offsetMinutes || 0);
  }

  return payload;
};

export const hasBulkTicketChanges = (enabledFields = {}) => Object.values(enabledFields).some(Boolean);
