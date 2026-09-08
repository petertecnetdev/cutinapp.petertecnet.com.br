import appApiClient from "./AppApiClient";
import { createIdempotentMutation, createMutationRequestKey } from "../utils/idempotencyAttempts";

const normalizeId = (value) => Number(value);

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

const applicationAdminTicketService = {
  update: (ticketId, payload) => updateTicketMutation(ticketId, payload),
  remove: (ticketId) => deleteTicketMutation(ticketId),
};

export default applicationAdminTicketService;
