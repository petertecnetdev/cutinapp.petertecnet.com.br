import appApiClient from "./AppApiClient";
import { createIdempotentMutation, createMutationRequestKey } from "../utils/idempotencyAttempts";

const openDirectIdempotently = createIdempotentMutation({
  storagePrefix: "cutinapp_messaging_direct_attempt_",
  keyPrefix: "direct",
  requestKeyFor: (userId) => createMutationRequestKey({ user_id: Number(userId) }),
  mutate: async ({ idempotencyKey }, userId) => (
    await appApiClient.post("/messaging/direct", { user_id: Number(userId) }, { headers: { "Idempotency-Key": idempotencyKey } })
  ).data,
});

const sendMessageIdempotently = createIdempotentMutation({
  storagePrefix: "cutinapp_messaging_send_attempt_",
  keyPrefix: "message",
  requestKeyFor: (conversationId, body, replyToId = null, options = {}) => createMutationRequestKey({
    conversation_id: Number(conversationId),
    body: String(body ?? ""),
    reply_to_id: replyToId ? Number(replyToId) : null,
    type: options.type || "text",
    metadata: options.metadata || null,
  }),
  mutate: async ({ idempotencyKey }, conversationId, body, replyToId = null, options = {}) => (
    await appApiClient.post(`/messaging/conversations/${Number(conversationId)}/messages`, {
      body,
      ...(replyToId ? { reply_to_id: Number(replyToId) } : {}),
      ...(options.type ? { type: options.type } : {}),
      ...(options.metadata ? { metadata: options.metadata } : {}),
    }, { headers: { "Idempotency-Key": idempotencyKey } })
  ).data,
});

const markConversationReadIdempotently = createIdempotentMutation({
  storagePrefix: "cutinapp_messaging_read_attempt_",
  keyPrefix: "message-read",
  requestKeyFor: (conversationId) => String(Number(conversationId)),
  mutate: async ({ idempotencyKey }, conversationId) => (
    await appApiClient.post(`/messaging/conversations/${Number(conversationId)}/read`, undefined, { headers: { "Idempotency-Key": idempotencyKey } })
  ).data,
});

const archiveConversationIdempotently = createIdempotentMutation({
  storagePrefix: "cutinapp_messaging_archive_attempt_",
  keyPrefix: "message-archive",
  requestKeyFor: (conversationId) => String(Number(conversationId)),
  mutate: async ({ idempotencyKey }, conversationId) => (
    await appApiClient.delete(`/messaging/conversations/${Number(conversationId)}`, { headers: { "Idempotency-Key": idempotencyKey } })
  ).data,
});

const messagingService = {
  conversations: async (params = {}) => (await appApiClient.get("/messaging/conversations", { params })).data,
  searchPeople: async (query) => (await appApiClient.get("/messaging/people", { params: { q: query } })).data,
  openDirect: (userId) => openDirectIdempotently(userId),
  conversation: async (conversationId) => (await appApiClient.get(`/messaging/conversations/${Number(conversationId)}`)).data,
  messages: async (conversationId, params = {}) => (await appApiClient.get(`/messaging/conversations/${Number(conversationId)}/messages`, { params })).data,
  send: (conversationId, body, replyToId = null, options = {}) => sendMessageIdempotently(conversationId, body, replyToId, options),
  sendFiles: async (conversationId, { body = "", replyToId = null, type = null, metadata = null, files = [], durationMs = null }) => {
    const form = new FormData();
    if (body) form.append("body", body);
    if (replyToId) form.append("reply_to_id", String(replyToId));
    if (type) form.append("type", type);
    if (metadata) form.append("metadata", JSON.stringify(metadata));
    if (durationMs) form.append("duration_ms", String(durationMs));
    files.forEach((file) => form.append("attachments[]", file));
    return (await appApiClient.post(`/messaging/conversations/${Number(conversationId)}/messages`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    })).data;
  },
  edit: async (messageId, body) => (await appApiClient.patch(`/messaging/messages/${Number(messageId)}`, { body })).data,
  remove: async (messageId) => (await appApiClient.delete(`/messaging/messages/${Number(messageId)}`)).data,
  react: async (messageId, reaction) => (await appApiClient.post(`/messaging/messages/${Number(messageId)}/reaction`, { reaction })).data,
  markDelivered: async (conversationId) => (await appApiClient.post(`/messaging/conversations/${Number(conversationId)}/delivered`)).data,
  markRead: (conversationId) => markConversationReadIdempotently(conversationId),
  state: async (conversationId, state) => (await appApiClient.patch(`/messaging/conversations/${Number(conversationId)}/state`, state)).data,
  archive: (conversationId) => archiveConversationIdempotently(conversationId),
  block: async (userId) => (await appApiClient.post(`/messaging/users/${Number(userId)}/block`)).data,
  unblock: async (userId) => (await appApiClient.delete(`/messaging/users/${Number(userId)}/block`)).data,
  report: async (userId, data) => (await appApiClient.post(`/messaging/users/${Number(userId)}/report`, data)).data,
};

export default messagingService;
