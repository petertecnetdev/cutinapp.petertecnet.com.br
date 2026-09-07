import appApiClient from "./AppApiClient";
import { createIdempotentMutation, createMutationRequestKey } from "../utils/idempotencyAttempts";

const sendMessageIdempotently = createIdempotentMutation({
  storagePrefix: "cutinapp_messaging_send_attempt_",
  keyPrefix: "message",
  requestKeyFor: (conversationId, body, replyToId = null) => createMutationRequestKey({
    conversation_id: Number(conversationId),
    body: String(body ?? ""),
    reply_to_id: replyToId ? Number(replyToId) : null,
  }),
  mutate: async ({ idempotencyKey }, conversationId, body, replyToId = null) => (
    await appApiClient.post(`/messaging/conversations/${Number(conversationId)}/messages`, {
      body,
      ...(replyToId ? { reply_to_id: Number(replyToId) } : {}),
    }, {
      headers: { "Idempotency-Key": idempotencyKey },
    })
  ).data,
});

const messagingService = {
  conversations: async (params = {}) => (await appApiClient.get("/messaging/conversations", { params })).data,
  searchPeople: async (query) => (await appApiClient.get("/messaging/people", { params: { q: query } })).data,
  openDirect: async (userId) => (await appApiClient.post("/messaging/direct", { user_id: Number(userId) })).data,
  conversation: async (conversationId) => (await appApiClient.get(`/messaging/conversations/${Number(conversationId)}`)).data,
  messages: async (conversationId, params = {}) => (await appApiClient.get(`/messaging/conversations/${Number(conversationId)}/messages`, { params })).data,
  send: (conversationId, body, replyToId = null) => sendMessageIdempotently(conversationId, body, replyToId),
  markRead: async (conversationId) => (await appApiClient.post(`/messaging/conversations/${Number(conversationId)}/read`)).data,
  archive: async (conversationId) => (await appApiClient.delete(`/messaging/conversations/${Number(conversationId)}`)).data,
};

export default messagingService;
