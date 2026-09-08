import appApiClient from "./AppApiClient";
import { createIdempotentMutation, createMutationRequestKey } from "../utils/idempotencyAttempts";

const normalizeId = (value) => Number(value);
const normalizeIds = (ids = []) => Array.from(new Set(ids.map(normalizeId).filter((id) => Number.isFinite(id) && id > 0))).sort((a, b) => a - b);

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
  requestKeyFor: (ids) => createMutationRequestKey({ ids: normalizeIds(ids) }),
  mutate: async ({ idempotencyKey }, ids) => (
    await appApiClient.delete("/admin/events", {
      data: { ids: normalizeIds(ids) },
      headers: { "Idempotency-Key": idempotencyKey },
    })
  ).data,
});

const applicationAdminEventService = {
  remove: (eventId) => deleteEventMutation(eventId),
  removeMany: (ids) => bulkDeleteEventsMutation(ids),
};

export default applicationAdminEventService;
