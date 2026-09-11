import appApiClient from "./AppApiClient";
import { createIdempotentMutation, createMutationRequestKey } from "../utils/idempotencyAttempts";

const openDirectIdempotently = createIdempotentMutation({
  storagePrefix: "cutinapp_messaging_direct_attempt_",
  keyPrefix: "direct",
  requestKeyFor: (userId) => createMutationRequestKey({
    user_id: Number(userId),
  }),
  mutate: async ({ idempotencyKey }, userId) => (
    await appApiClient.post("/messaging/direct", {
      user_id: Number(userId),
    }, {
      headers: { "Idempotency-Key": idempotencyKey },
    })
  ).data,
});

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

const fileFingerprint = (file) => ({
  name: String(file?.name || ""),
  size: Number(file?.size || 0),
  type: String(file?.type || ""),
  last_modified: Number(file?.lastModified || 0),
});

const sendRichIdempotently = createIdempotentMutation({
  storagePrefix: "cutinapp_messaging_rich_send_attempt_",
  keyPrefix: "rich-message",
  requestKeyFor: (conversationId, payload = {}, files = []) => createMutationRequestKey({
    conversation_id: Number(conversationId),
    body: String(payload.body ?? ""),
    type: String(payload.type || "text"),
    reply_to_id: payload.reply_to_id ? Number(payload.reply_to_id) : null,
    scheduled_at: payload.scheduled_at || null,
    expires_at: payload.expires_at || null,
    metadata: payload.metadata || null,
    client_uuid: payload.client_uuid || null,
    files: Array.from(files || []).map(fileFingerprint),
  }),
  mutate: async ({ idempotencyKey }, conversationId, payload = {}, files = []) => {
    const form = new FormData();
    if (payload.body != null && String(payload.body) !== "") form.append("body", String(payload.body));
    if (payload.type) form.append("type", String(payload.type));
    if (payload.reply_to_id) form.append("reply_to_id", String(Number(payload.reply_to_id)));
    if (payload.client_uuid) form.append("client_uuid", String(payload.client_uuid));
    if (payload.scheduled_at) form.append("scheduled_at", String(payload.scheduled_at));
    if (payload.expires_at) form.append("expires_at", String(payload.expires_at));
    if (payload.metadata && Object.keys(payload.metadata).length) {
      form.append("metadata", JSON.stringify(payload.metadata));
    }
    Array.from(files || []).forEach((file) => form.append("attachments[]", file));

    return (
      await appApiClient.post(`/messaging/conversations/${Number(conversationId)}/messages`, form, {
        headers: { "Idempotency-Key": idempotencyKey },
      })
    ).data;
  },
});

const markConversationReadIdempotently = createIdempotentMutation({
  storagePrefix: "cutinapp_messaging_read_attempt_",
  keyPrefix: "message-read",
  requestKeyFor: (conversationId) => String(Number(conversationId)),
  mutate: async ({ idempotencyKey }, conversationId) => (
    await appApiClient.post(`/messaging/conversations/${Number(conversationId)}/read`, undefined, {
      headers: { "Idempotency-Key": idempotencyKey },
    })
  ).data,
});

const archiveConversationIdempotently = createIdempotentMutation({
  storagePrefix: "cutinapp_messaging_archive_attempt_",
  keyPrefix: "message-archive",
  requestKeyFor: (conversationId) => String(Number(conversationId)),
  mutate: async ({ idempotencyKey }, conversationId) => (
    await appApiClient.delete(`/messaging/conversations/${Number(conversationId)}`, {
      headers: { "Idempotency-Key": idempotencyKey },
    })
  ).data,
});

const messagingService = {
  conversations: async (params = {}) => (await appApiClient.get("/messaging/conversations", { params })).data,
  searchPeople: async (query) => (await appApiClient.get("/messaging/people", { params: { q: query } })).data,
  openDirect: (userId) => openDirectIdempotently(userId),
  acceptRequest: async (conversationId) => (
    await appApiClient.post(`/messaging/conversations/${Number(conversationId)}/accept-request`)
  ).data,
  rejectRequest: async (conversationId) => (
    await appApiClient.delete(`/messaging/conversations/${Number(conversationId)}/request`)
  ).data,
  createGroup: async (title, participantIds) => (
    await appApiClient.post("/messaging/groups", {
      title,
      participant_ids: participantIds.map(Number),
    })
  ).data,
  conversation: async (conversationId) => (
    await appApiClient.get(`/messaging/conversations/${Number(conversationId)}`)
  ).data,
  updateConversation: async (conversationId, payload) => (
    await appApiClient.patch(`/messaging/conversations/${Number(conversationId)}`, payload)
  ).data,
  addParticipants: async (conversationId, userIds) => (
    await appApiClient.post(`/messaging/conversations/${Number(conversationId)}/participants`, {
      user_ids: userIds.map(Number),
    })
  ).data,
  removeParticipant: async (conversationId, userId) => (
    await appApiClient.delete(`/messaging/conversations/${Number(conversationId)}/participants/${Number(userId)}`)
  ).data,
  messages: async (conversationId, params = {}) => (
    await appApiClient.get(`/messaging/conversations/${Number(conversationId)}/messages`, { params })
  ).data,
  scheduled: async (conversationId) => (
    await appApiClient.get(`/messaging/conversations/${Number(conversationId)}/scheduled`)
  ).data,

  // Mantém o contrato legado e sua idempotência para texto simples.
  send: (conversationId, body, replyToId = null) => sendMessageIdempotently(conversationId, body, replyToId),
  sendRich: (conversationId, payload = {}, files = []) => sendRichIdempotently(conversationId, payload, files),

  editMessage: async (conversationId, messageId, body) => (
    await appApiClient.patch(`/messaging/conversations/${Number(conversationId)}/messages/${Number(messageId)}`, { body })
  ).data,
  deleteMessage: async (conversationId, messageId) => (
    await appApiClient.delete(`/messaging/conversations/${Number(conversationId)}/messages/${Number(messageId)}`)
  ).data,
  cancelScheduled: async (conversationId, messageId) => (
    await appApiClient.delete(`/messaging/conversations/${Number(conversationId)}/scheduled/${Number(messageId)}`)
  ).data,
  react: async (conversationId, messageId, emoji) => (
    await appApiClient.post(`/messaging/conversations/${Number(conversationId)}/messages/${Number(messageId)}/reactions`, { emoji })
  ).data,
  removeReaction: async (conversationId, messageId, emoji) => (
    await appApiClient.delete(`/messaging/conversations/${Number(conversationId)}/messages/${Number(messageId)}/reactions`, { data: { emoji } })
  ).data,
  pinMessage: async (conversationId, messageId, pinned = true) => (
    await appApiClient.put(`/messaging/conversations/${Number(conversationId)}/messages/${Number(messageId)}/pin`, { pinned })
  ).data,

  markRead: (conversationId) => markConversationReadIdempotently(conversationId),
  archive: (conversationId) => archiveConversationIdempotently(conversationId),
  typing: async (conversationId, typing) => (
    await appApiClient.post(`/messaging/conversations/${Number(conversationId)}/typing`, { typing: Boolean(typing) })
  ).data,
  heartbeat: async () => (await appApiClient.post("/messaging/presence/heartbeat")).data,
  presence: async (userId) => (await appApiClient.get(`/messaging/presence/${Number(userId)}`)).data,
  settings: async () => (await appApiClient.get("/messaging/settings")).data,
  updateSettings: async (payload) => (await appApiClient.put("/messaging/settings", payload)).data,
  block: async (userId, kind = "block") => (
    await appApiClient.post(`/messaging/users/${Number(userId)}/block`, { kind })
  ).data,
  unblock: async (userId) => (
    await appApiClient.delete(`/messaging/users/${Number(userId)}/block`)
  ).data,
  report: async (conversationId, payload) => (
    await appApiClient.post(`/messaging/conversations/${Number(conversationId)}/reports`, payload)
  ).data,
  attachmentBlob: async (attachmentId) => (
    await appApiClient.get(`/messaging/attachments/${Number(attachmentId)}`, { responseType: "blob" })
  ).data,
  startCall: async (conversationId, type, metadata = {}) => (
    await appApiClient.post(`/messaging/conversations/${Number(conversationId)}/calls`, { type, metadata })
  ).data,
  updateCall: async (conversationId, callId, status, metadata = {}) => (
    await appApiClient.patch(`/messaging/conversations/${Number(conversationId)}/calls/${Number(callId)}`, { status, metadata })
  ).data,
};

export default messagingService;
