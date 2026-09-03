import { applicationApiClient as apiClient } from "./ApiClient";

const unwrap = (value) => Array.isArray(value) ? value : Array.isArray(value?.data) ? value.data : [];

const eventService = {
  search: async (params = {}) => (await apiClient.get("/events", { params })).data,
  list: async (params = {}) => unwrap((await apiClient.get("/events", { params })).data.events),
  view: async (slug) => (await apiClient.get(`/events/public/${slug}`)).data,
  store: async (formData) => (await apiClient.post("/events", formData)).data,
  update: async (eventId, formData) => (await apiClient.patch(`/events/${eventId}`, formData)).data,
  show: async (eventId) => (await apiClient.get(`/events/${eventId}/manage`)).data.event,
  myEvents: async (params = {}) => unwrap((await apiClient.get("/events/mine", { params: { per_page: 100, ...params } })).data.events),
};

export default eventService;
