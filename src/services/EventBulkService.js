import appApiClient from "./AppApiClient";
import { createIdempotentMutation } from "../utils/idempotencyAttempts";

const normalizeEventIds = (eventIds = []) => [...new Set(
  (Array.isArray(eventIds) ? eventIds : [])
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0)
)].sort((a, b) => a - b);

const deleteOwnedEventsIdempotently = createIdempotentMutation({
  storagePrefix: "cutinapp_event_bulk_delete_attempt_",
  keyPrefix: "event-bulk-delete",
  requestKeyFor: () => "mine",
  mutate: async ({ idempotencyKey }) => (
    await appApiClient.delete("/events/mine", {
      headers: { "Idempotency-Key": idempotencyKey },
    })
  ).data,
});

const deleteSelectedEventsIdempotently = createIdempotentMutation({
  storagePrefix: "cutinapp_event_selected_delete_attempt_",
  keyPrefix: "event-selected-delete",
  requestKeyFor: (eventIds) => normalizeEventIds(eventIds).join(","),
  mutate: async ({ idempotencyKey }, eventIds) => {
    const ids = normalizeEventIds(eventIds);
    if (!ids.length) throw new Error("Selecione ao menos um evento para excluir.");

    return (
      await appApiClient.delete("/events/bulk", {
        data: { event_ids: ids },
        headers: { "Idempotency-Key": idempotencyKey },
      })
    ).data;
  },
});

const eventBulkService = {
  deleteMine: () => deleteOwnedEventsIdempotently(),
  deleteSelected: (eventIds) => deleteSelectedEventsIdempotently(eventIds),
};

export default eventBulkService;
