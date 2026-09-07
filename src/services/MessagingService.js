import appApiClient from "./AppApiClient";

const messagingService = {
  conversations: async (params = {}) => (await appApiClient.get("/messaging/conversations", { params })).data,
  searchPeople: async (query) => (await appApiClient.get("/messaging/people", { params: { q: query } })).data,
  openDirect: async (userId) => (await appApiClient.post("/messaging/direct", { user_id: Number(userId) })).data,
  conversation: async (conversationId) => (await appApiClient.get(`/messaging/conversations/${Number(conversationId)}`)).data,
  messages: async (conversationId, params = {}) => (await appApiClient.get(`/messaging/conversations/${Number(conversationId)}/messages`, { params })).data,
  send: async (conversationId, body, replyToId = null) => (await appApiClient.post(`/messaging/conversations/${Number(conversationId)}/messages`, {
    body,
    ...(replyToId ? { reply_to_id: Number(replyToId) } : {}),
  })).data,
  markRead: async (conversationId) => (await appApiClient.post(`/messaging/conversations/${Number(conversationId)}/read`)).data,
  archive: async (conversationId) => (await appApiClient.delete(`/messaging/conversations/${Number(conversationId)}`)).data,
};

export default messagingService;
