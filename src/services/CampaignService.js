import appApiClient from "./AppApiClient";

const unwrapPage = (response) => response?.campaigns?.data || response?.campaigns || [];

const campaignService = {
  list: async (params = {}) => unwrapPage((await appApiClient.get("/campaigns", { params })).data),
  get: async (uuid) => (await appApiClient.get(`/campaigns/${uuid}`)).data.campaign,
  create: async (payload) => (await appApiClient.post("/campaigns", payload)).data,
  update: async (uuid, payload) => (await appApiClient.put(`/campaigns/${uuid}`, payload)).data,
  publish: async (uuid) => (await appApiClient.post(`/campaigns/${uuid}/publish`)).data,
  setStatus: async (uuid, status) => (await appApiClient.patch(`/campaigns/${uuid}/status`, { status })).data,
  participate: async (uuid, payload = {}) => (await appApiClient.post(`/campaigns/${uuid}/participate`, payload)).data,
  touch: async (uuid, touchpoint, options = {}) => (await appApiClient.post(`/campaigns/${uuid}/touch`, {
    touchpoint,
    idempotency_key: options.idempotencyKey || null,
    metadata: options.metadata || null,
  })).data,
  analytics: async (uuid) => (await appApiClient.get(`/campaigns/${uuid}/analytics`)).data.metrics,
  draw: async (uuid, quantity = 1) => (await appApiClient.post(`/campaigns/${uuid}/draw`, { quantity })).data,
  compliance: async (uuid, payload) => (await appApiClient.put(`/campaigns/${uuid}/compliance`, payload)).data,
};

export default campaignService;
