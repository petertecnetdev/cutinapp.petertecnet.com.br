import appApiClient from "./AppApiClient";

const socialFeedService = {
  createEventPost: async (eventId, payload) => (
    await appApiClient.post(`/events/${Number(eventId)}/community`, payload)
  ).data,

  likePost: async (postId) => (
    await appApiClient.post(`/community/${Number(postId)}/like`)
  ).data,

  unlikePost: async (postId) => (
    await appApiClient.delete(`/community/${Number(postId)}/like`)
  ).data,

  votePoll: async (postId, optionId) => (
    await appApiClient.post(`/community/${Number(postId)}/poll-vote`, { option_id: Number(optionId) })
  ).data,
};

export default socialFeedService;
