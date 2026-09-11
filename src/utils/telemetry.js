const ATTRIBUTION_STORAGE_KEY = "cutinapp_telemetry_attribution";
const ATTRIBUTION_TTL_MS = 60 * 60 * 1000;
const ATTRIBUTION_TERMINAL_EVENT = "checkout_fulfilled";
const CHECKOUT_JOURNEY_STORAGE_KEY = "cutinapp_checkout_journey";
const CHECKOUT_JOURNEY_TTL_MS = 2 * 60 * 60 * 1000;

const canUseSessionStorage = () => typeof window !== "undefined" && Boolean(window.sessionStorage);

const clearAttribution = () => {
  try {
    if (canUseSessionStorage()) window.sessionStorage.removeItem(ATTRIBUTION_STORAGE_KEY);
  } catch (_) {
    // Attribution must never interrupt navigation or telemetry.
  }
};

const readAttribution = () => {
  try {
    if (!canUseSessionStorage()) return null;
    const raw = window.sessionStorage.getItem(ATTRIBUTION_STORAGE_KEY);
    if (!raw) return null;
    const attribution = JSON.parse(raw);
    if (!attribution?.source || !Number.isFinite(Number(attribution?.expires_at)) || Number(attribution.expires_at) <= Date.now()) {
      clearAttribution();
      return null;
    }
    return attribution;
  } catch (_) {
    clearAttribution();
    return null;
  }
};

const saveAttribution = (attribution = {}) => {
  try {
    if (!canUseSessionStorage() || !attribution?.source) return;
    const now = Date.now();
    window.sessionStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify({
      ...attribution,
      captured_at: now,
      expires_at: now + ATTRIBUTION_TTL_MS,
    }));
  } catch (_) {
    // Attribution must never interrupt navigation or telemetry.
  }
};

const saveAttributionFromFeed = (details = {}) => {
  const metadata = details?.metadata || {};
  if (metadata?.source !== "feed") return;
  saveAttribution({
    source: "feed",
    post_id: Number(metadata?.post_id || 0) || null,
    event_id: Number(metadata?.event_id || 0) || null,
    event_slug: metadata?.event_slug || null,
  });
};

const saveAttributionFromRecovery = (details = {}) => {
  saveAttribution({
    source: "checkout_recovery",
    event_id: Number(details?.event_id || 0) || null,
    event_slug: details?.target || null,
    recovery_surface: details?.surface || null,
    recovery_source: details?.source || null,
    recovery_has_pending_order: Boolean(details?.has_pending_order),
  });
};

const shouldAttachAttribution = () => {
  if (typeof window === "undefined") return false;
  return /^\/(event|checkout)\//.test(window.location?.pathname || "");
};

const clearCheckoutJourney = () => {
  try {
    if (canUseSessionStorage()) window.sessionStorage.removeItem(CHECKOUT_JOURNEY_STORAGE_KEY);
  } catch (_) {
    // Checkout analytics must never interrupt the purchase flow.
  }
};

const readCheckoutJourney = () => {
  try {
    if (!canUseSessionStorage()) return null;
    const raw = window.sessionStorage.getItem(CHECKOUT_JOURNEY_STORAGE_KEY);
    if (!raw) return null;
    const journey = JSON.parse(raw);
    if (!journey?.id || !Number.isFinite(Number(journey?.expires_at)) || Number(journey.expires_at) <= Date.now()) {
      clearCheckoutJourney();
      return null;
    }
    return journey;
  } catch (_) {
    clearCheckoutJourney();
    return null;
  }
};

const createCheckoutJourneyId = () => {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch (_) {
    // Fall through to a non-identifying local random id.
  }
  return `cj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
};

const resolveCheckoutJourney = (details = {}) => {
  if (typeof window === "undefined" || !/^\/checkout\//.test(window.location?.pathname || "")) return null;
  const eventSlug = String(details?.target || window.location.pathname.split("/").filter(Boolean)[1] || "").trim() || null;
  const existing = readCheckoutJourney();
  if (existing && (!eventSlug || existing.event_slug === eventSlug)) return existing;

  try {
    if (!canUseSessionStorage()) return null;
    const now = Date.now();
    const journey = {
      id: createCheckoutJourneyId(),
      event_slug: eventSlug,
      started_at: now,
      expires_at: now + CHECKOUT_JOURNEY_TTL_MS,
    };
    window.sessionStorage.setItem(CHECKOUT_JOURNEY_STORAGE_KEY, JSON.stringify(journey));
    return journey;
  } catch (_) {
    return null;
  }
};

const ensureAttributionAwareTracker = () => {
  if (typeof window === "undefined") return null;
  const telemetry = window.PeterTecnetTelemetry;
  const tracker = telemetry?.track;
  if (typeof tracker !== "function") return null;
  if (tracker.__cutinappAttributionAware) return tracker;

  const originalTrack = tracker.bind(telemetry);
  const wrappedTrack = (type, details = {}) => {
    const attribution = shouldAttachAttribution() ? readAttribution() : null;
    const checkoutJourney = resolveCheckoutJourney(details);
    const enriched = attribution || checkoutJourney
      ? {
        ...details,
        metadata: {
          ...(details?.metadata || {}),
          ...(attribution ? {
            attribution_source: attribution.source,
            attribution_post_id: attribution.post_id || null,
            attribution_event_id: attribution.event_id || null,
            attribution_event_slug: attribution.event_slug || null,
            attribution_recovery_surface: attribution.recovery_surface || null,
            attribution_recovery_source: attribution.recovery_source || null,
            attribution_recovery_has_pending_order: attribution.recovery_has_pending_order ?? null,
          } : {}),
          ...(checkoutJourney ? {
            checkout_journey_id: checkoutJourney.id,
            checkout_journey_started_at: checkoutJourney.started_at,
          } : {}),
        },
      }
      : details;

    const result = originalTrack(type, enriched);
    if (type === ATTRIBUTION_TERMINAL_EVENT) {
      clearAttribution();
      clearCheckoutJourney();
    }
    return result;
  };

  wrappedTrack.__cutinappAttributionAware = true;
  telemetry.track = wrappedTrack;
  return wrappedTrack;
};

export const trackTelemetry = (type, details = {}) => {
  try {
    if (typeof window === "undefined") return false;
    if (["feed_event_opened", "feed_ticket_intent_clicked"].includes(type)) saveAttributionFromFeed(details);
    if (type === "checkout_resume_prompt_clicked") saveAttributionFromRecovery(details);
    const tracker = ensureAttributionAwareTracker();
    if (typeof tracker !== "function") return false;
    tracker(type, details);
    return true;
  } catch (_) {
    return false;
  }
};
