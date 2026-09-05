import appApiClient from "./AppApiClient";

const participantSocialService = {
  list: async (params = {}) => (await appApiClient.get("/participants", { params })).data,
  activity: async (params = {}) => (await appApiClient.get("/participants/activity", { params })).data,
  show: async (participantId) => (await appApiClient.get(`/participants/${participantId}`)).data,
  follow: async (participantId) => (await appApiClient.post(`/participants/${participantId}/follow`)).data,
  unfollow: async (participantId) => (await appApiClient.delete(`/participants/${participantId}/follow`)).data,
};

export default participantSocialService;
