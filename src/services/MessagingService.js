import appApiClient from "./AppApiClient";

const messagingService = {
  conversations: async (params = {}) => (await appApiClient.get("/messaging/conversations", { params })).data,
  unreadCount: async () => (await appApiClient.get("/messaging/unread-count")).data,
  people: async (params = {}) => (await appApiClient.get("/messaging/people", { params })).data,
  blockStatus: async (userId) => (await appApiClient.get(`/messaging/people/${userId}/block-status`)).data,
  createDirect: async (recipientUserId) => (await appApiClient.post("/messaging/conversations/direct", {
    recipient_user_id: Number(recipientUserId),
  })).data,
  messages: async (conversationId, params = {}) => (await appApiClient.get(`/messaging/conversations/${conversationId}/messages`, { params })).data,
  searchMessages: async (conversationId, q) => (await appApiClient.get(`/messaging/conversations/${conversationId}/messages/search`, { params: { q } })).data,
  send: async (conversationId, { body = "", attachments = [], replyToMessageId = null, clientToken = null } = {}) => {
    if (attachments.length > 0) {
      const form = new FormData();
      if (body) form.append("body", body);
      if (replyToMessageId) form.append("reply_to_message_id", String(replyToMessageId));
      if (clientToken) form.append("client_token", clientToken);
      attachments.forEach((file) => form.append("attachments[]", file));
      return (await appApiClient.post(`/messaging/conversations/${conversationId}/messages`, form)).data;
    }

    return (await appApiClient.post(`/messaging/conversations/${conversationId}/messages`, {
      body,
      reply_to_message_id: replyToMessageId || null,
      client_token: clientToken || null,
    })).data;
  },
  updateMessage: async (conversationId, messageId, body) => (await appApiClient.patch(`/messaging/conversations/${conversationId}/messages/${messageId}`, { body })).data,
  deleteMessage: async (conversationId, messageId) => (await appApiClient.delete(`/messaging/conversations/${conversationId}/messages/${messageId}`)).data,
  react: async (conversationId, messageId, emoji) => (await appApiClient.put(`/messaging/conversations/${conversationId}/messages/${messageId}/reaction`, { emoji })).data,
  typing: async (conversationId, isTyping) => (await appApiClient.post(`/messaging/conversations/${conversationId}/typing`, { is_typing: Boolean(isTyping) })).data,
  updateConversation: async (conversationId, preferences) => (await appApiClient.patch(`/messaging/conversations/${conversationId}`, preferences)).data,
  markRead: async (conversationId) => (await appApiClient.patch(`/messaging/conversations/${conversationId}/read`)).data,
  blockUser: async (userId) => (await appApiClient.put(`/messaging/people/${userId}/block`)).data,
  unblockUser: async (userId) => (await appApiClient.delete(`/messaging/people/${userId}/block`)).data,
  reportUser: async (userId, payload) => (await appApiClient.post(`/messaging/people/${userId}/report`, payload)).data,
  attachmentBlob: async (conversationId, messageId, attachmentId) => (await appApiClient.get(
    `/messaging/conversations/${conversationId}/messages/${messageId}/attachments/${attachmentId}`,
    { responseType: "blob" }
  )).data,
};

export default messagingService;
