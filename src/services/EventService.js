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

  agenda: async (productionId) => (await appApiClient.get(`/event-agenda/productions/${productionId}`)).data,
  setAgendaStatus: async (productionId, isActive) => (await appApiClient.patch(`/event-agenda/productions/${productionId}/status`, { is_active: isActive })).data,
  createAgendaItem: async (productionId, formData) => (await appApiClient.post(`/event-agenda/productions/${productionId}/items`, formData)).data,
  updateAgendaItem: async (scheduleId, formData) => (await appApiClient.post(`/event-agenda/items/${scheduleId}`, formData)).data,
  setAgendaItemStatus: async (scheduleId, isActive) => (await appApiClient.patch(`/event-agenda/items/${scheduleId}/status`, { is_active: isActive })).data,
  deleteAgendaItem: async (scheduleId) => (await appApiClient.delete(`/event-agenda/items/${scheduleId}`)).data,
  generateAgendaItem: async (scheduleId) => (await appApiClient.post(`/event-agenda/items/${scheduleId}/generate`)).data,
  generateAgendaUpcoming: async (productionId) => (await appApiClient.post(`/event-agenda/productions/${productionId}/generate-upcoming`)).data,
};

export default eventService;
