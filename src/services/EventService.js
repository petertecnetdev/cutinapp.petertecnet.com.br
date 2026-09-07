import appApiClient from "./AppApiClient";
import { createIdempotentMutation, createMutationRequestKey } from "../utils/idempotencyAttempts";

const CUTINAPP_TIME_ZONE = "America/Sao_Paulo";
const HOME_DISCOVERY_KEYS = new Set(["lat", "lng", "radius_km", "city", "uf", "per_page", "sort"]);

const unwrap = (value) => Array.isArray(value) ? value : Array.isArray(value?.data) ? value.data : [];

const resolveWhatsappPhone = (...sources) => {
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    const value = source.whatsapp_phone
      || source.whatsapp_number
      || source.whatsapp
      || source.contact_whatsapp
      || source.phone
      || source.phone_number
      || source.contact_phone
      || source.mobile;
    if (value) return value;
  }
  return "";
};

const normalizePublicEventResponse = (response) => {
  const event = response?.event;
  if (!event) return response;

  const production = event.production || event.establishment || event.organization || null;
  const whatsappPhone = resolveWhatsappPhone(
    production,
    event.establishment,
    event.organization,
    event
  );

  if (!production || !whatsappPhone) return response;

  return {
    ...response,
    event: {
      ...event,
      production: {
        ...production,
        phone: whatsappPhone,
      },
    },
  };
};

const enrichPublicEventProductionContact = async (response) => {
  const normalized = normalizePublicEventResponse(response);
  const event = normalized?.event;
  const currentPhone = resolveWhatsappPhone(event?.production, event?.establishment, event?.organization, event);
  if (!event || currentPhone) return normalized;

  const production = event.production || event.establishment || event.organization || null;
  const productionSlug = production?.slug || event.production_slug || event.organization_slug || event.establishment_slug;
  if (!productionSlug) return normalized;

  try {
    const productionResponse = (await appApiClient.get(`/organizations/public/${productionSlug}`)).data;
    const publicProduction = productionResponse?.organization || productionResponse?.production || null;
    const whatsappPhone = resolveWhatsappPhone(publicProduction);
    if (!publicProduction || !whatsappPhone) return normalized;

    return {
      ...normalized,
      event: {
        ...event,
        production: {
          ...(production || {}),
          ...publicProduction,
          phone: whatsappPhone,
        },
      },
    };
  } catch (_) {
    return normalized;
  }
};

const createEvent = createIdempotentMutation({
  storagePrefix: "cutinapp_event_create_attempt_",
  keyPrefix: "event",
  requestKeyFor: (payload) => createMutationRequestKey(payload),
  mutate: async ({ idempotencyKey }, payload) => (
    await appApiClient.post("/events", payload, {
      headers: { "Idempotency-Key": idempotencyKey },
    })
  ).data,
});

const createIdempotentEventPost = ({ storagePrefix, keyPrefix, pathFor }) => createIdempotentMutation({
  storagePrefix,
  keyPrefix,
  requestKeyFor: (eventId, payload = {}) => `${Number(eventId)}:${createMutationRequestKey(payload)}`,
  mutate: async ({ idempotencyKey }, eventId, payload = {}) => (
    await appApiClient.post(pathFor(Number(eventId)), payload, {
      headers: { "Idempotency-Key": idempotencyKey },
    })
  ).data,
});

const duplicateEvent = createIdempotentEventPost({
  storagePrefix: "cutinapp_event_duplicate_attempt_",
  keyPrefix: "event-duplicate",
  pathFor: (eventId) => `/events/${eventId}/duplicate`,
});

const createEventSeries = createIdempotentEventPost({
  storagePrefix: "cutinapp_event_series_attempt_",
  keyPrefix: "event-series",
  pathFor: (eventId) => `/events/${eventId}/series`,
});

const createAgendaItem = createIdempotentMutation({
  storagePrefix: "cutinapp_event_agenda_create_attempt_",
  keyPrefix: "event-agenda",
  requestKeyFor: (productionId, formData) => `${Number(productionId)}:${createMutationRequestKey(formData)}`,
  mutate: async ({ idempotencyKey }, productionId, formData) => (
    await appApiClient.post(`/event-agenda/productions/${Number(productionId)}/items`, formData, {
      headers: { "Idempotency-Key": idempotencyKey },
    })
  ).data,
});

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

const rawSearch = async (params = {}, options = {}) => (await appApiClient.get("/events", { params, signal: options.signal })).data;

const search = async (params = {}, options = {}) => {
  const response = await rawSearch(params, options);

  if (!isHomeDiscoverySearch(params)) return response;

  const localEvents = response?.events?.data || [];
  if (hasLocationFilter(params) && localEvents.length === 0) return response;

  try {
    const todayResponse = await rawSearch({ date: dateKeyInTimeZone(), per_page: 12 }, options);
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
  view: async (slug) => enrichPublicEventProductionContact((await appApiClient.get(`/events/public/${slug}`)).data),
  store: createEvent,
  update: async (eventId, formData) => (await appApiClient.patch(`/events/${eventId}`, formData)).data,
  show: async (eventId) => (await appApiClient.get(`/events/${eventId}/manage`)).data.event,
  myEvents: async (params = {}) => unwrap((await appApiClient.get("/events/mine", { params: { per_page: 100, ...params } })).data.events),
  duplicate: (eventId, date) => duplicateEvent(eventId, { date }),
  series: (eventId, payload) => createEventSeries(eventId, payload),

  agenda: async (productionId) => (await appApiClient.get(`/event-agenda/productions/${productionId}`)).data,
  setAgendaStatus: async (productionId, isActive) => (await appApiClient.patch(`/event-agenda/productions/${productionId}/status`, { is_active: isActive })).data,
  createAgendaItem,
  updateAgendaItem: async (scheduleId, formData) => (await appApiClient.post(`/event-agenda/items/${scheduleId}`, formData)).data,
  setAgendaItemStatus: async (scheduleId, isActive) => (await appApiClient.patch(`/event-agenda/items/${scheduleId}/status`, { is_active: isActive })).data,
  deleteAgendaItem: async (scheduleId) => (await appApiClient.delete(`/event-agenda/items/${scheduleId}`)).data,
  generateAgendaItem: async (scheduleId) => (await appApiClient.post(`/event-agenda/items/${scheduleId}/generate`)).data,
  generateAgendaUpcoming: async (productionId) => (await appApiClient.post(`/event-agenda/productions/${productionId}/generate-upcoming`)).data,
};

export default eventService;