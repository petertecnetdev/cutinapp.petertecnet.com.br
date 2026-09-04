import appApiClient from "./AppApiClient";

const unwrap = (value) => Array.isArray(value) ? value : Array.isArray(value?.data) ? value.data : [];

const canonicalParams = (params = {}) => {
  const next = { ...params };
  if (next.production_id && !next.establishment_id) next.establishment_id = next.production_id;
  delete next.production_id;
  return next;
};

const canonicalPayload = (payload) => {
  if (typeof FormData !== "undefined" && payload instanceof FormData) {
    const next = new FormData();
    let establishmentId = payload.get("establishment_id");
    if (!establishmentId) establishmentId = payload.get("production_id");

    for (const [key, value] of payload.entries()) {
      if (key !== "production_id" && key !== "establishment_id") next.append(key, value);
    }
    if (establishmentId !== null && String(establishmentId).trim() !== "") next.append("establishment_id", establishmentId);
    return next;
  }

  const next = { ...(payload || {}) };
  if (next.production_id && !next.establishment_id) next.establishment_id = next.production_id;
  delete next.production_id;
  return next;
};

const normalizeEvent = (event) => {
  if (!event || typeof event !== "object") return event;
  const establishment = event.establishment || event.production || null;
  const establishmentId = event.establishment_id || event.production_id || establishment?.id || null;
  return {
    ...event,
    establishment,
    establishment_id: establishmentId,
    // Temporary render aliases for old components during route/page rename.
    production: event.production || establishment,
    production_id: event.production_id || establishmentId,
  };
};

const normalizeEventEnvelope = (data) => {
  if (!data || typeof data !== "object") return data;
  if (data.event) return { ...data, event: normalizeEvent(data.event) };
  return data;
};

const eventService = {
  search: async (params = {}) => {
    const data = (await appApiClient.get("/events", { params: canonicalParams(params) })).data;
    if (Array.isArray(data?.events?.data)) data.events.data = data.events.data.map(normalizeEvent);
    return data;
  },
  list: async (params = {}) => unwrap((await eventService.search(params)).events).map(normalizeEvent),
  view: async (slug) => normalizeEventEnvelope((await appApiClient.get(`/events/public/${slug}`)).data),
  store: async (payload) => normalizeEventEnvelope((await appApiClient.post("/events", canonicalPayload(payload))).data),
  update: async (eventId, payload) => normalizeEventEnvelope((await appApiClient.patch(`/events/${eventId}`, canonicalPayload(payload))).data),
  show: async (eventId) => normalizeEvent((await appApiClient.get(`/events/${eventId}/manage`)).data.event),
  myEvents: async (params = {}) => unwrap((await appApiClient.get("/events/mine", { params: { per_page: 100, ...canonicalParams(params) } })).data.events).map(normalizeEvent),
};

export default eventService;
