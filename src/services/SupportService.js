import apiClient from "./ApiClient";

const supportService = {
  create: async (payload = {}) => {
    const response = await apiClient.post("/support/tickets", {
      application_slug: "cutinapp",
      channel: "app",
      source_url: typeof window !== "undefined" ? window.location.href : undefined,
      ...payload,
    });
    return response.data;
  },
  mine: async (params = {}) => (await apiClient.get("/support/my", { params })).data,
  show: async (publicId, token = "") => (await apiClient.get(`/support/tickets/${publicId}`, {
    headers: token ? { "X-Support-Token": token } : undefined,
  })).data.ticket,
  reply: async (publicId, message, token = "") => (await apiClient.post(`/support/tickets/${publicId}/messages`, { message }, {
    headers: token ? { "X-Support-Token": token } : undefined,
  })).data.ticket,
};

export default supportService;
