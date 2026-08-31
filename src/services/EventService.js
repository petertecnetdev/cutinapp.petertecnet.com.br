import apiClient from "./ApiClient";

const unwrap = (value) => Array.isArray(value) ? value : Array.isArray(value?.data) ? value.data : [];

const eventService = {
  search: async (params = {}) => (await apiClient.get("/cutinapp/events", { params })).data,
  list: async (params = {}) => unwrap((await apiClient.get("/cutinapp/events", { params })).data.events),
  view: async (slug) => (await apiClient.get(`/cutinapp/events/public/${slug}`)).data,
  store: async (formData) => (await apiClient.post("/cutinapp/events", formData)).data,
  update: async (eventId, formData) => (await apiClient.post(`/cutinapp/events/${eventId}`, formData)).data,
  show: async (eventId) => (await apiClient.get(`/cutinapp/events/show/${eventId}`)).data.event,
  myEvents: async (params = {}) => unwrap((await apiClient.get("/cutinapp/events/mine", { params: { per_page: 100, ...params } })).data.events),
};

export default eventService;
