import appApiClient from "./AppApiClient";
import { createIdempotentMutation, createMutationRequestKey } from "../utils/idempotencyAttempts";

const normalizePayload = (payload = {}) => ({
  event_id: payload.event_id,
  name: payload.name,
  quantity: payload.quantity,
  limit_date: payload.limit_date || null,
  description: payload.description || null,
  price: Number(payload.price || 0),
  ticket_type: payload.ticket_type || (Number(payload.price || 0) > 0 ? "standard" : "courtesy"),
});

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

const store = (payload) => storeIdempotently(normalizePayload(payload));

const ticketService = { store };

export default ticketService;
