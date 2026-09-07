import appApiClient from "./AppApiClient";
import {
  createIdempotencyAttemptManager,
  createMutationRequestKey,
  shouldKeepIdempotencyAttempt,
} from "../utils/idempotencyAttempts";

const pendingSeriesCreates = new Map();
const seriesCreateAttempts = createIdempotencyAttemptManager({
  storagePrefix: "cutinapp_event_series_create_attempt_",
  keyPrefix: "event-series",
});

const requestKeyFor = (eventId, payload) => `${Number(eventId)}:${createMutationRequestKey(payload)}`;

const create = (eventId, payload) => {
  const normalizedEventId = Number(eventId);
  if (!Number.isInteger(normalizedEventId) || normalizedEventId <= 0) {
    return Promise.reject(new Error("Evento inválido para criação da agenda."));
  }

  const requestKey = requestKeyFor(normalizedEventId, payload);
  const pending = pendingSeriesCreates.get(requestKey);
  if (pending) return pending;

  const idempotencyKey = seriesCreateAttempts.keyFor(requestKey);
  const request = appApiClient.post(`/admin/events/${normalizedEventId}/series`, payload, {
    headers: { "Idempotency-Key": idempotencyKey },
  }).then((response) => {
    seriesCreateAttempts.clear(requestKey);
    return response.data;
  }).catch((error) => {
    if (!shouldKeepIdempotencyAttempt(error)) seriesCreateAttempts.clear(requestKey);
    throw error;
  }).finally(() => {
    if (pendingSeriesCreates.get(requestKey) === request) pendingSeriesCreates.delete(requestKey);
  });

  pendingSeriesCreates.set(requestKey, request);
  return request;
};

const eventSeriesService = { create };

export default eventSeriesService;
