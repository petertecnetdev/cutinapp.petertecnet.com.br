import appApiClient from "./AppApiClient";

const unwrap = (value) => Array.isArray(value) ? value : Array.isArray(value?.data) ? value.data : [];

const eventService = {
  search: async (params = {}) => (await appApiClient.get("/events", { params })).data,
  list: async (params = {}) => unwrap((await appApiClient.get("/events", { params })).data.events),
  view: async (slug) => (await appApiClient.get(`/events/public/${slug}`)).data,
  store: async (formData) => (await appApiClient.post("/events", formData)).data,
  update: async (eventId, formData) => (await appApiClient.patch(`/events/${eventId}`, formData)).data,
  show: async (eventId) => (await appApiClient.get(`/events/${eventId}/manage`)).data.event,
  myEvents: async (params = {}) => unwrap((await appApiClient.get("/events/mine", { params: { per_page: 100, ...params } })).data.events),
};

export default eventService;
