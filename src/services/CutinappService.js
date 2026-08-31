import apiClient from "./ApiClient";

const unwrap = (value) => Array.isArray(value) ? value : Array.isArray(value?.data) ? value.data : [];

const cutinappService = {
  publicConfig: async () => (await apiClient.get("/cutinapp/config")).data,
  myProductions: async () => unwrap((await apiClient.get("/cutinapp/productions/mine")).data.productions),
  getProduction: async (id) => (await apiClient.get(`/cutinapp/productions/${id}`)).data.production,
  createProduction: async (formData) => (await apiClient.post("/cutinapp/productions", formData, { headers: { "Content-Type": "multipart/form-data" } })).data,
  updateProduction: async (id, formData) => (await apiClient.post(`/cutinapp/productions/${id}`, formData, { headers: { "Content-Type": "multipart/form-data" } })).data,
  claimCourtesy: async (ticketId) => (await apiClient.post(`/cutinapp/passes/claim/${ticketId}`)).data,
  myPasses: async () => unwrap((await apiClient.get("/cutinapp/passes/mine")).data.passes),
  eventParticipants: async (eventId) => (await apiClient.get(`/cutinapp/events/${eventId}/participants`)).data,
  checkIn: async (token) => (await apiClient.post("/cutinapp/checkin", { token })).data,
  checkInStats: async (eventId) => (await apiClient.get(`/cutinapp/checkin/event/${eventId}/stats`)).data,
};

export default cutinappService;
