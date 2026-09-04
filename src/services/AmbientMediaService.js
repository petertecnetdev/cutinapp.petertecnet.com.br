import appApiClient from "./AppApiClient";

const ambientMediaService = {
  publicMedia: async (subjectType, subjectId) => (
    await appApiClient.get(`/ambient-media/${subjectType}/${subjectId}`)
  ).data.media || null,

  manageMedia: async (subjectType, subjectId) => (
    await appApiClient.get(`/ambient-media/${subjectType}/${subjectId}/manage`)
  ).data.media || null,

  saveMedia: async (subjectType, subjectId, payload) => (
    await appApiClient.put(`/ambient-media/${subjectType}/${subjectId}`, payload)
  ).data,

  removeMedia: async (subjectType, subjectId) => (
    await appApiClient.delete(`/ambient-media/${subjectType}/${subjectId}`)
  ).data,

  recommendations: async (subjectType, subjectId) => (
    await appApiClient.get(`/ambient-media/${subjectType}/${subjectId}/recommendations`)
  ).data,
};

export default ambientMediaService;
