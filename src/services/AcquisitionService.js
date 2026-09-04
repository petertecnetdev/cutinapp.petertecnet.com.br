import appApiClient from "./AppApiClient";

const acquisitionService = {
  context: async () => (await appApiClient.get("/acquisition/context")).data,
  dashboard: async () => (await appApiClient.get("/acquisition/dashboard")).data,
  referrals: async (params = {}) => (await appApiClient.get("/acquisition/referrals", { params })).data,
  onboard: async (payload) => (await appApiClient.post("/acquisition/onboardings", payload)).data,
  resend: async (referralId) => (await appApiClient.post(`/acquisition/referrals/${referralId}/resend`)).data,
  updateCommission: async (eventId, percentage) => (await appApiClient.put(`/acquisition/events/${eventId}/commission`, { percentage })).data,
  publicReferral: async (token) => (await appApiClient.get(`/acquisition/referrals/public/${encodeURIComponent(token)}`)).data,
  activate: async (payload) => (await appApiClient.post("/acquisition/referrals/activate", payload)).data,
};

export default acquisitionService;
