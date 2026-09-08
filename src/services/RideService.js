import appApiClient from "./AppApiClient";
import { createIdempotentMutation, createMutationRequestKey } from "../utils/idempotencyAttempts";

const normalizeId = (value) => Number(value);

const createRideMutation = createIdempotentMutation({
  storagePrefix: "cutinapp_ride_create_attempt_",
  keyPrefix: "ride-create",
  requestKeyFor: (eventId, payload) => `${normalizeId(eventId)}:${createMutationRequestKey(payload)}`,
  mutate: async ({ idempotencyKey }, eventId, payload) => (
    await appApiClient.post(`/events/${normalizeId(eventId)}/rides`, payload, {
      headers: { "Idempotency-Key": idempotencyKey },
    })
  ).data,
});

const requestSeatMutation = createIdempotentMutation({
  storagePrefix: "cutinapp_ride_request_attempt_",
  keyPrefix: "ride-request",
  requestKeyFor: (rideId, payload) => `${normalizeId(rideId)}:${createMutationRequestKey(payload)}`,
  mutate: async ({ idempotencyKey }, rideId, payload) => (
    await appApiClient.post(`/rides/${normalizeId(rideId)}/requests`, payload, {
      headers: { "Idempotency-Key": idempotencyKey },
    })
  ).data,
});

const respondToRequestMutation = createIdempotentMutation({
  storagePrefix: "cutinapp_ride_response_attempt_",
  keyPrefix: "ride-response",
  requestKeyFor: (rideId, requestId, status) => `${normalizeId(rideId)}:${normalizeId(requestId)}:${String(status || "")}`,
  mutate: async ({ idempotencyKey }, rideId, requestId, status) => (
    await appApiClient.patch(`/rides/${normalizeId(rideId)}/requests/${normalizeId(requestId)}`, { status }, {
      headers: { "Idempotency-Key": idempotencyKey },
    })
  ).data,
});

const cancelRideMutation = createIdempotentMutation({
  storagePrefix: "cutinapp_ride_cancel_attempt_",
  keyPrefix: "ride-cancel",
  requestKeyFor: (rideId) => String(normalizeId(rideId)),
  mutate: async ({ idempotencyKey }, rideId) => (
    await appApiClient.delete(`/rides/${normalizeId(rideId)}`, {
      headers: { "Idempotency-Key": idempotencyKey },
    })
  ).data,
});

const rideService = {
  async list(eventId) {
    const response = await appApiClient.get(`/events/${normalizeId(eventId)}/rides`);
    return response?.data;
  },

  create(eventId, payload) {
    return createRideMutation(eventId, payload);
  },

  requestSeat(rideId, payload = { seats: 1 }) {
    return requestSeatMutation(rideId, payload);
  },

  respond(rideId, requestId, status) {
    return respondToRequestMutation(rideId, requestId, status);
  },

  cancel(rideId) {
    return cancelRideMutation(rideId);
  },
};

export default rideService;
