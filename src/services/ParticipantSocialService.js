import appApiClient from "./AppApiClient";

const participantSocialService = {
  list: async (params = {}) => (await appApiClient.get("/participants", { params })).data,
  activity: async (params = {}) => (await appApiClient.get("/participants/activity", { params })).data,
  show: async (participantId) => (await appApiClient.get(`/participants/${participantId}`)).data,
  settings: async () => (await appApiClient.get("/participants/me/social-settings")).data,
  updateSettings: async (payload) => (await appApiClient.put("/participants/me/social-settings", payload)).data,
  follow: async (participantId) => (await appApiClient.post(`/participants/${participantId}/follow`)).data,
  unfollow: async (participantId) => (await appApiClient.delete(`/participants/${participantId}/follow`)).data,
};

export default participantSocialService;
