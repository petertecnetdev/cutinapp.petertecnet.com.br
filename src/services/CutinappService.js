import apiClient from "./ApiClient";

const unwrap = (value) => Array.isArray(value) ? value : Array.isArray(value?.data) ? value.data : [];

const cutinappService = {
  publicConfig: async () => (await apiClient.get("/cutinapp/config")).data,

  myProductions: async () => unwrap((await apiClient.get("/cutinapp/productions/mine")).data.productions),
  getProduction: async (id) => (await apiClient.get(`/cutinapp/productions/${id}`)).data.production,
  createProduction: async (formData) => (await apiClient.post("/cutinapp/productions", formData)).data,
  updateProduction: async (id, formData) => (await apiClient.post(`/cutinapp/productions/${id}`, formData)).data,

  publishEvent: async (eventId) => (await apiClient.post(`/cutinapp/events/${eventId}/publish`)).data,
  unpublishEvent: async (eventId) => (await apiClient.post(`/cutinapp/events/${eventId}/unpublish`)).data,
  eventCourtesies: async (eventId) => (await apiClient.get(`/cutinapp/events/${eventId}/courtesies`)).data,
  updateCourtesy: async (ticketId, payload) => (await apiClient.post(`/cutinapp/courtesies/${ticketId}`, payload)).data,
  deleteCourtesy: async (ticketId) => (await apiClient.delete(`/cutinapp/courtesies/${ticketId}`)).data,

  claimCourtesy: async (ticketId) => (await apiClient.post(`/cutinapp/passes/claim/${ticketId}`)).data,
  myPasses: async () => unwrap((await apiClient.get("/cutinapp/passes/mine")).data.passes),
  getPass: async (passId) => (await apiClient.get(`/cutinapp/passes/${passId}`)).data.pass,
  eventParticipants: async (eventId) => (await apiClient.get(`/cutinapp/events/${eventId}/participants`)).data,

  checkIn: async (token, eventId) => (await apiClient.post("/cutinapp/checkin", {
    token,
    event_id: Number(eventId),
  })).data,
  checkInStats: async (eventId) => (await apiClient.get(`/cutinapp/checkin/event/${eventId}/stats`)).data,
};

export default cutinappService;
