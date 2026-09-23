import appApiClient from "./AppApiClient";

const supportService = {
  create: async (payload = {}) => {
    const response = await appApiClient.post("/support/tickets", {
      application_slug: "cutinapp",
      channel: "app",
      source_url: typeof window !== "undefined" ? window.location.href : undefined,
      ...payload,
    });
    return response.data;
  },
  mine: async (params = {}) => (await appApiClient.get("/support/my", { params })).data,
  show: async (publicId, token = "") => (await appApiClient.get(`/support/tickets/${publicId}`, {
    headers: token ? { "X-Support-Token": token } : undefined,
  })).data.ticket,
  reply: async (publicId, message, token = "") => (await appApiClient.post(`/support/tickets/${publicId}/messages`, { message }, {
    headers: token ? { "X-Support-Token": token } : undefined,
  })).data.ticket,
};

export default supportService;
