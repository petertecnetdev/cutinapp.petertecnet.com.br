import apiClient from "./ApiClient";
const unwrap = (value) => Array.isArray(value) ? value : Array.isArray(value?.data) ? value.data : [];
const multipart = { headers: { "Content-Type": "multipart/form-data" } };
const eventService = {
  list: async (params = {}) => unwrap((await apiClient.get("/cutinapp/events", { params })).data.events),
  view: async (slug) => (await apiClient.get(`/cutinapp/events/public/${slug}`)).data,
  store: async (formData) => (await apiClient.post("/cutinapp/events", formData, multipart)).data,
  update: async (eventId, formData) => (await apiClient.post(`/cutinapp/events/${eventId}`, formData, multipart)).data,
  show: async (eventId) => (await apiClient.get(`/cutinapp/events/show/${eventId}`)).data.event,
  myEvents: async () => unwrap((await apiClient.get("/cutinapp/events/mine")).data.events),
};
export default eventService;
