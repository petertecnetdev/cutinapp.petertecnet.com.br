import appApiClient from "./AppApiClient";
import { createIdempotencyAttemptManager, createMutationRequestKey, shouldKeepIdempotencyAttempt } from "../utils/idempotencyAttempts";

const CUTINAPP_TIME_ZONE = "America/Sao_Paulo";
const HOME_DISCOVERY_KEYS = new Set(["lat", "lng", "radius_km", "city", "uf", "per_page", "sort"]);

const unwrap = (value) => Array.isArray(value) ? value : Array.isArray(value?.data) ? value.data : [];

const pendingEventCreates = new Map();
const eventCreateAttempts = createIdempotencyAttemptManager({
  storagePrefix: "cutinapp_event_create_attempt_",
  keyPrefix: "event",
});

const createEvent = (payload) => {
  const requestKey = createMutationRequestKey(payload);
  const pending = pendingEventCreates.get(requestKey);
  if (pending) return pending;

  const idempotencyKey = eventCreateAttempts.keyFor(requestKey);
  const request = appApiClient.post("/events", payload, {
    headers: { "Idempotency-Key": idempotencyKey },
  }).then((response) => {
    eventCreateAttempts.clear(requestKey);
    return response.data;
  }).catch((error) => {
    if (!shouldKeepIdempotencyAttempt(error)) eventCreateAttempts.clear(requestKey);
    throw error;
  }).finally(() => {
    if (pendingEventCreates.get(requestKey) === request) pendingEventCreates.delete(requestKey);
  });

  pendingEventCreates.set(requestKey, request);
  return request;
};

const dateKeyInTimeZone = (value = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CUTINAPP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);

  const dateParts = Object.fromEntries(
    parts
      .filter(({ type }) => type === "year" || type === "month" || type === "day")
      .map(({ type, value: partValue }) => [type, partValue])
  );

  return `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
};

const isHomeDiscoverySearch = (params = {}) => {
  const keys = Object.keys(params);
  return Number(params.per_page) === 12
    && params.sort === "soonest"
    && keys.every((key) => HOME_DISCOVERY_KEYS.has(key));
};

const hasLocationFilter = (params = {}) => Boolean(
  params.city || (params.lat !== undefined && params.lng !== undefined)
);

const mergeUniqueEvents = (...collections) => {
  const seen = new Set();
  return collections.flat().filter((event) => {
    const key = event?.id ?? event?.slug;
    if (key === undefined || key === null) return true;
    const normalizedKey = String(key);
    if (seen.has(normalizedKey)) return false;
    seen.add(normalizedKey);
    return true;
  });
};

const rawSearch = async (params = {}) => (await appApiClient.get("/events", { params })).data;

const search = async (params = {}) => {
  const response = await rawSearch(params);

  if (!isHomeDiscoverySearch(params)) return response;

  const localEvents = response?.events?.data || [];
  if (hasLocationFilter(params) && localEvents.length === 0) return response;

  try {
    const todayResponse = await rawSearch({ date: dateKeyInTimeZone(), per_page: 12 });
    const todayEvents = todayResponse?.events?.data || [];
    if (todayEvents.length === 0 || !response?.events) return response;

    return {
      ...response,
      events: {
        ...response.events,
        data: mergeUniqueEvents(todayEvents, localEvents).slice(0, 12),
      },
    };
  } catch (_) {
    return response;
  }
};

const eventService = {
  search,
  list: async (params = {}) => unwrap((await appApiClient.get("/events", { params })).data.events),
  view: async (slug) => (await appApiClient.get(`/events/public/${slug}`)).data,
  store: createEvent,
  update: async (eventId, formData) => (await appApiClient.patch(`/events/${eventId}`, formData)).data,
  show: async (eventId) => (await appApiClient.get(`/events/${eventId}/manage`)).data.event,
  myEvents: async (params = {}) => unwrap((await appApiClient.get("/events/mine", { params: { per_page: 100, ...params } })).data.events),
  duplicate: async (eventId, date) => (await appApiClient.post(`/events/${eventId}/duplicate`, { date })).data,
  series: async (eventId, payload) => (await appApiClient.post(`/events/${eventId}/series`, payload)).data,

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
