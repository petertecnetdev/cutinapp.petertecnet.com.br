import appApiClient from "./AppApiClient";

const messagingService = {
  conversations: async (params = {}) => (await appApiClient.get("/messaging/conversations", { params })).data,
  unreadCount: async () => (await appApiClient.get("/messaging/unread-count")).data,
  people: async (params = {}) => (await appApiClient.get("/messaging/people", { params })).data,
  createDirect: async (recipientUserId) => (await appApiClient.post("/messaging/conversations/direct", {
    recipient_user_id: Number(recipientUserId),
  })).data,
  messages: async (conversationId, params = {}) => (await appApiClient.get(`/messaging/conversations/${conversationId}/messages`, { params })).data,
  send: async (conversationId, body) => (await appApiClient.post(`/messaging/conversations/${conversationId}/messages`, { body })).data,
  markRead: async (conversationId) => (await appApiClient.patch(`/messaging/conversations/${conversationId}/read`)).data,
};

export default messagingService;
