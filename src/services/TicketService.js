import appApiClient from "./AppApiClient";
import { createIdempotentMutation, createMutationRequestKey } from "../utils/idempotencyAttempts";

const normalizePayload = (payload = {}) => {
  if (payload.source_ticket_id) {
    return {
      source_ticket_id: Number(payload.source_ticket_id),
      event_ids: (payload.event_ids || []).map(Number),
    };
  }

  const rawMaxPerUser = payload.max_per_user;
  const maxPerUser = rawMaxPerUser === "" || rawMaxPerUser == null
    ? null
    : Math.max(1, Number(rawMaxPerUser));

  const normalized = {
    name: payload.name,
    quantity: payload.quantity,
    max_per_user: Number.isFinite(maxPerUser) ? maxPerUser : null,
    description: payload.description || null,
    price: Number(payload.price || 0),
    ticket_type: payload.ticket_type || (Number(payload.price || 0) > 0 ? "standard" : "courtesy"),
    sales_cutoff_mode: payload.sales_cutoff_mode || "at_start",
    sales_cutoff_offset_minutes: Math.max(0, Number(payload.sales_cutoff_offset_minutes || 0)),
  };

  if (Array.isArray(payload.event_ids) && payload.event_ids.length > 0) {
    normalized.event_ids = payload.event_ids.map(Number);
  } else {
    normalized.event_id = Number(payload.event_id);
  }

  return normalized;
};

const storeIdempotently = createIdempotentMutation({
  storagePrefix: "cutinapp_ticket_create_attempt_",
  keyPrefix: "ticket",
  requestKeyFor: (requestPayload) => createMutationRequestKey(requestPayload),
  mutate: async ({ idempotencyKey }, requestPayload) => (
    await appApiClient.post("/tickets", requestPayload, {
      headers: { "Idempotency-Key": idempotencyKey },
    })
  ).data,
});

const bulkUpdateIdempotently = createIdempotentMutation({
  storagePrefix: "cutinapp_ticket_bulk_update_attempt_",
  keyPrefix: "ticket-bulk-update",
  requestKeyFor: (requestPayload) => createMutationRequestKey(requestPayload),
  mutate: async ({ idempotencyKey }, requestPayload) => (
    await appApiClient.patch("/tickets/bulk", requestPayload, {
      headers: { "Idempotency-Key": idempotencyKey },
    })
  ).data,
});

const store = (payload) => storeIdempotently(normalizePayload(payload));

const listByEvent = async (eventId) => {
  const response = (await appApiClient.get(`/events/${Number(eventId)}/tickets`)).data;
  return Array.isArray(response?.tickets) ? response.tickets : [];
};

const similar = async (ticketId) => (
  await appApiClient.get(`/tickets/${Number(ticketId)}/similar`)
).data;

const bulkUpdate = (payload = {}) => bulkUpdateIdempotently({
  ...payload,
  ticket_ids: (payload.ticket_ids || []).map(Number),
});

const ticketService = { store, listByEvent, similar, bulkUpdate };

export default ticketService;
