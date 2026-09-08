import appApiClient from "./AppApiClient";
import { createIdempotentMutation, createMutationRequestKey } from "../utils/idempotencyAttempts";

const CUTINAPP_TIME_ZONE = "America/Sao_Paulo";
const HOME_DISCOVERY_KEYS = new Set(["lat", "lng", "radius_km", "city", "uf", "per_page", "sort"]);
const HOME_EVENTS_CACHE_KEY = "cutinapp.homeEvents.v1";
const HOME_EVENTS_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

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

const updateMultipartEvent = createIdempotentMutation({
  storagePrefix: "cutinapp_event_update_attempt_",
  keyPrefix: "event-update",
  requestKeyFor: (eventId, formData) => `${Number(eventId)}:${createMutationRequestKey(formData)}`,
  mutate: async ({ idempotencyKey }, eventId, formData) => (
    await appApiClient.post(`/events/${Number(eventId)}`, formData, {
      headers: { "Idempotency-Key": idempotencyKey },
    })
  ).data,
});

const updateJsonEvent = createIdempotentMutation({
  storagePrefix: "cutinapp_event_json_update_attempt_",
  keyPrefix: "event-json-update",
  requestKeyFor: (eventId, payload = {}) => `${Number(eventId)}:${createMutationRequestKey(payload)}`,
  mutate: async ({ idempotencyKey }, eventId, payload = {}) => (
    await appApiClient.patch(`/events/${Number(eventId)}`, payload, {
      headers: { "Idempotency-Key": idempotencyKey },
    })
  ).data,
});

const updateAgendaItem = createIdempotentMutation({
  storagePrefix: "cutinapp_event_agenda_update_attempt_",
  keyPrefix: "event-agenda-update",
  requestKeyFor: (scheduleId, formData) => `${Number(scheduleId)}:${createMutationRequestKey(formData)}`,
  mutate: async ({ idempotencyKey }, scheduleId, formData) => (
    await appApiClient.post(`/event-agenda/items/${Number(scheduleId)}`, formData, {
      headers: { "Idempotency-Key": idempotencyKey },
    })
  ).data,
});

const createAgendaGeneration = ({ storagePrefix, keyPrefix, pathFor }) => createIdempotentMutation({
  storagePrefix,
  keyPrefix,
  requestKeyFor: (resourceId) => String(Number(resourceId)),
  mutate: async ({ idempotencyKey }, resourceId) => (
    await appApiClient.post(pathFor(Number(resourceId)), undefined, {
      headers: { "Idempotency-Key": idempotencyKey },
    })
  ).data,
});

const generateAgendaItem = createAgendaGeneration({
  storagePrefix: "cutinapp_event_agenda_generate_item_attempt_",
  keyPrefix: "event-agenda-generate-item",
  pathFor: (scheduleId) => `/event-agenda/items/${scheduleId}/generate`,
});

const generateAgendaUpcoming = createAgendaGeneration({
  storagePrefix: "cutinapp_event_agenda_generate_upcoming_attempt_",
  keyPrefix: "event-agenda-generate-upcoming",
  pathFor: (productionId) => `/event-agenda/productions/${productionId}/generate-upcoming`,
});

const setAgendaStatusIdempotently = createIdempotentMutation({
  storagePrefix: "cutinapp_event_agenda_status_attempt_",
  keyPrefix: "event-agenda-status",
  requestKeyFor: (productionId, isActive) => createMutationRequestKey({
    production_id: Number(productionId),
    is_active: Boolean(isActive),
  }),
  mutate: async ({ idempotencyKey }, productionId, isActive) => (
    await appApiClient.patch(`/event-agenda/productions/${Number(productionId)}/status`, {
      is_active: Boolean(isActive),
    }, {
      headers: { "Idempotency-Key": idempotencyKey },
    })
  ).data,
});

const setAgendaItemStatusIdempotently = createIdempotentMutation({
  storagePrefix: "cutinapp_event_agenda_item_status_attempt_",
  keyPrefix: "event-agenda-item-status",
  requestKeyFor: (scheduleId, isActive) => createMutationRequestKey({
    schedule_id: Number(scheduleId),
    is_active: Boolean(isActive),
  }),
  mutate: async ({ idempotencyKey }, scheduleId, isActive) => (
    await appApiClient.patch(`/event-agenda/items/${Number(scheduleId)}/status`, {
      is_active: Boolean(isActive),
    }, {
      headers: { "Idempotency-Key": idempotencyKey },
    })
  ).data,
});

const deleteAgendaItemIdempotently = createIdempotentMutation({
  storagePrefix: "cutinapp_event_agenda_delete_attempt_",
  keyPrefix: "event-agenda-delete",
  requestKeyFor: (scheduleId) => String(Number(scheduleId)),
  mutate: async ({ idempotencyKey }, scheduleId) => (
    await appApiClient.delete(`/event-agenda/items/${Number(scheduleId)}`, {
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

const readCachedHomeEvents = () => {
  if (typeof window === "undefined") return [];

  try {
    const cached = JSON.parse(window.localStorage.getItem(HOME_EVENTS_CACHE_KEY) || "null");
    const cachedAt = Number(cached?.cached_at || 0);
    if (!cachedAt || Date.now() - cachedAt > HOME_EVENTS_CACHE_MAX_AGE_MS) return [];
    return Array.isArray(cached?.events) ? cached.events : [];
  } catch (_) {
    return [];
  }
};

const cacheHomeEvents = (events) => {
  if (typeof window === "undefined" || !Array.isArray(events) || events.length === 0) return;

  try {
    window.localStorage.setItem(HOME_EVENTS_CACHE_KEY, JSON.stringify({
      cached_at: Date.now(),
      events: events.slice(0, 12),
    }));
  } catch (_) {
    // Cache local é apenas uma proteção contra uma falha transitória da API.
  }
};

const withHomeEvents = (response, events) => ({
  ...(response || {}),
  events: {
    ...(response?.events || {}),
    data: mergeUniqueEvents(events).slice(0, 12),
  },
});

const rawSearch = async (params = {}, options = {}) => (await appApiClient.get("/events", { params, signal: options.signal })).data;

const search = async (params = {}, options = {}) => {
  if (!isHomeDiscoverySearch(params)) return rawSearch(params, options);

  let response = null;
  let primaryError = null;

  try {
    response = await rawSearch(params, options);
  } catch (error) {
    primaryError = error;
  }

  const localEvents = response?.events?.data || [];

  // A HomePage já trata ausência por localização buscando o catálogo global.
  // Mantemos esse comportamento para não misturar outra cidade sob um título local.
  if (hasLocationFilter(params) && localEvents.length === 0) {
    if (primaryError) throw primaryError;
    return response;
  }

  let homeEvents = localEvents;
  const fallbackQueries = [
    { date: dateKeyInTimeZone(), per_page: 12 },
  ];

  // Se não há próximos eventos, ainda mostramos eventos reais do catálogo.
  // "newest" e "popular" são ordenações públicas já suportadas pela página de eventos.
  if (homeEvents.length === 0) {
    fallbackQueries.push(
      { per_page: 12, sort: "newest" },
      { per_page: 12, sort: "popular" }
    );
  }

  for (const fallbackParams of fallbackQueries) {
    try {
      const fallbackResponse = await rawSearch(fallbackParams, options);
      const fallbackEvents = fallbackResponse?.events?.data || [];
      if (fallbackEvents.length === 0) continue;

      response = response || fallbackResponse;
      homeEvents = mergeUniqueEvents(fallbackEvents, homeEvents).slice(0, 12);

      // Quando a busca principal veio vazia, o primeiro fallback útil já resolve
      // e evita chamadas extras sem necessidade.
      if (localEvents.length === 0) break;
    } catch (_) {
      // Tenta a próxima estratégia antes de recorrer ao cache local.
    }
  }

  if (homeEvents.length > 0) {
    cacheHomeEvents(homeEvents);
    return withHomeEvents(response, homeEvents);
  }

  const cachedEvents = readCachedHomeEvents();
  if (cachedEvents.length > 0) return withHomeEvents(response, cachedEvents);

  if (primaryError) throw primaryError;
  return response;
};

const eventService = {
  search,
  list: async (params = {}) => unwrap((await appApiClient.get("/events", { params })).data.events),
  view: async (slug) => enrichPublicEventProductionContact((await appApiClient.get(`/events/public/${slug}`)).data),
  store: createEvent,
  update: async (eventId, payload) => {
    // PHP only populates uploaded files reliably for multipart POST requests.
    // When editing an event with a generated/uploaded cover, send POST and
    // spoof PATCH so Laravel routes it to the update action while preserving
    // the file in Request::file()/hasFile().
    if (typeof FormData !== "undefined" && payload instanceof FormData) {
      if (typeof payload.set === "function") payload.set("_method", "PATCH");
      else payload.append("_method", "PATCH");
      return updateMultipartEvent(eventId, payload);
    }
    return updateJsonEvent(eventId, payload);
  },
  show: async (eventId) => (await appApiClient.get(`/events/${eventId}/manage`)).data.event,
  myEvents: async (params = {}) => unwrap((await appApiClient.get("/events/mine", { params: { per_page: 100, ...params } })).data.events),
  duplicate: (eventId, date) => duplicateEvent(eventId, { date }),
  series: (eventId, payload) => createEventSeries(eventId, payload),

  agenda: async (productionId) => (await appApiClient.get(`/event-agenda/productions/${productionId}`)).data,
  setAgendaStatus: (productionId, isActive) => setAgendaStatusIdempotently(productionId, isActive),
  createAgendaItem,
  updateAgendaItem,
  setAgendaItemStatus: (scheduleId, isActive) => setAgendaItemStatusIdempotently(scheduleId, isActive),
  deleteAgendaItem: (scheduleId) => deleteAgendaItemIdempotently(scheduleId),
  generateAgendaItem,
  generateAgendaUpcoming,
};

export default eventService;