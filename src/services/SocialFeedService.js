import appApiClient from "./AppApiClient";

const socialFeedService = {
  list: async (params = {}) => (await appApiClient.get("/social/posts", { params })).data,

  publish: async ({ body = "", media = null, parentId = null }) => {
    const formData = new FormData();
    if (body) formData.append("body", body);
    if (media) formData.append("media", media);
    if (parentId) formData.append("parent_id", String(parentId));
    return (await appApiClient.post("/social/posts", formData)).data;
  },

  remove: async (postId) => (await appApiClient.delete(`/social/posts/${postId}`)).data,
  like: async (postId) => (await appApiClient.post(`/social/posts/${postId}/like`)).data,
  unlike: async (postId) => (await appApiClient.delete(`/social/posts/${postId}/like`)).data,
};

export default socialFeedService;
