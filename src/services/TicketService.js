import appApiClient from "./AppApiClient";
import {
  createIdempotencyAttemptManager,
  createMutationRequestKey,
  shouldKeepIdempotencyAttempt,
} from "../utils/idempotencyAttempts";

const pendingTicketCreates = new Map();
const ticketCreateAttempts = createIdempotencyAttemptManager({
  storagePrefix: "cutinapp_ticket_create_attempt_",
  keyPrefix: "ticket",
});

const normalizePayload = (payload = {}) => ({
  event_id: payload.event_id,
  name: payload.name,
  quantity: payload.quantity,
  limit_date: payload.limit_date || null,
  description: payload.description || null,
  price: Number(payload.price || 0),
  ticket_type: payload.ticket_type || (Number(payload.price || 0) > 0 ? "standard" : "courtesy"),
});

const store = (payload) => {
  const requestPayload = normalizePayload(payload);
  const requestKey = createMutationRequestKey(requestPayload);
  const pending = pendingTicketCreates.get(requestKey);
  if (pending) return pending;

  const idempotencyKey = ticketCreateAttempts.keyFor(requestKey);
  const request = appApiClient.post("/tickets", requestPayload, {
    headers: { "Idempotency-Key": idempotencyKey },
  }).then((response) => {
    ticketCreateAttempts.clear(requestKey);
    return response.data;
  }).catch((error) => {
    if (!shouldKeepIdempotencyAttempt(error)) ticketCreateAttempts.clear(requestKey);
    throw error;
  }).finally(() => {
    if (pendingTicketCreates.get(requestKey) === request) pendingTicketCreates.delete(requestKey);
  });

  pendingTicketCreates.set(requestKey, request);
  return request;
};

const ticketService = { store };

export default ticketService;
