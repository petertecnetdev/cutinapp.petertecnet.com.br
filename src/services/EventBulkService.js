import appApiClient from "./AppApiClient";
import { createIdempotentMutation } from "../utils/idempotencyAttempts";

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

const eventBulkService = {
  deleteMine: () => deleteOwnedEventsIdempotently(),
};

export default eventBulkService;
