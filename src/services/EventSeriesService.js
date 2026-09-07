import appApiClient from "./AppApiClient";
import { createIdempotentMutation, createMutationRequestKey } from "../utils/idempotencyAttempts";

const createSeriesIdempotently = createIdempotentMutation({
  storagePrefix: "cutinapp_event_series_create_attempt_",
  keyPrefix: "event-series",
  requestKeyFor: (eventId, payload) => `${Number(eventId)}:${createMutationRequestKey(payload)}`,
  mutate: async ({ idempotencyKey }, eventId, payload) => (
    await appApiClient.post(`/admin/events/${eventId}/series`, payload, {
      headers: { "Idempotency-Key": idempotencyKey },
    })
  ).data,
});

const create = (eventId, payload) => {
  const normalizedEventId = Number(eventId);
  if (!Number.isInteger(normalizedEventId) || normalizedEventId <= 0) {
    return Promise.reject(new Error("Evento inválido para criação da agenda."));
  }

  return createSeriesIdempotently(normalizedEventId, payload);
};

const eventSeriesService = { create };

export default eventSeriesService;
