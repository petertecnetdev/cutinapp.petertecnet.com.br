import appApiClient from "./AppApiClient";
import { createIdempotentMutation, createMutationRequestKey } from "../utils/idempotencyAttempts";

const normalizeId = (value) => Number(value);
const normalizeIds = (ids = []) => Array.from(new Set(ids.map(normalizeId).filter(Number.isFinite))).sort((a, b) => a - b);

const deleteEventMutation = createIdempotentMutation({
  storagePrefix: "cutinapp_admin_event_delete_attempt_",
  keyPrefix: "admin-event-delete",
  requestKeyFor: (eventId) => String(normalizeId(eventId)),
  mutate: async ({ idempotencyKey }, eventId) => (
    await appApiClient.delete(`/events/${normalizeId(eventId)}`, {
      headers: { "Idempotency-Key": idempotencyKey },
    })
  ).data,
});

const bulkDeleteEventsMutation = createIdempotentMutation({
  storagePrefix: "cutinapp_admin_event_bulk_delete_attempt_",
  keyPrefix: "admin-event-bulk-delete",
  requestKeyFor: (ids) => createMutationRequestKey(normalizeIds(ids)),
  mutate: async ({ idempotencyKey }, ids) => (
    await appApiClient.delete("/admin/events", {
      data: { ids: normalizeIds(ids) },
      headers: { "Idempotency-Key": idempotencyKey },
    })
  ).data,
});

const updateTicketMutation = createIdempotentMutation({
  storagePrefix: "cutinapp_admin_ticket_update_attempt_",
  keyPrefix: "admin-ticket-update",
  requestKeyFor: (ticketId, payload) => createMutationRequestKey({ id: normalizeId(ticketId), payload }),
  mutate: async ({ idempotencyKey }, ticketId, payload) => (
    await appApiClient.put(`/admin/tickets/${normalizeId(ticketId)}`, payload, {
      headers: { "Idempotency-Key": idempotencyKey },
    })
  ).data,
});

const deleteTicketMutation = createIdempotentMutation({
  storagePrefix: "cutinapp_admin_ticket_delete_attempt_",
  keyPrefix: "admin-ticket-delete",
  requestKeyFor: (ticketId) => String(normalizeId(ticketId)),
  mutate: async ({ idempotencyKey }, ticketId) => (
    await appApiClient.delete(`/admin/tickets/${normalizeId(ticketId)}`, {
      headers: { "Idempotency-Key": idempotencyKey },
    })
  ).data,
});

const applicationAdminMutationService = {
  deleteEvent: (eventId) => deleteEventMutation(eventId),
  bulkDeleteEvents: (ids) => bulkDeleteEventsMutation(normalizeIds(ids)),
  updateTicket: (ticketId, payload) => updateTicketMutation(ticketId, payload),
  deleteTicket: (ticketId) => deleteTicketMutation(ticketId),
};

export default applicationAdminMutationService;
