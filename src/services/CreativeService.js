import appApiClient from "./AppApiClient";
import { createIdempotentMutation, createMutationRequestKey } from "../utils/idempotencyAttempts";

const CREATIVE_IMAGE_TIMEOUT_MS = 150000;
const CREATIVE_RETRY_DELAYS_MS = [900, 1800];
const TRANSIENT_CREATIVE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

const compactStrings = (items = []) => (
  Array.isArray(items)
    ? items.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 8)
    : []
);

const normalizeBrandColors = (items = []) => (
  Array.isArray(items)
    ? items.map((item) => String(item || "").trim()).filter((item) => /^#[0-9a-f]{6}$/i.test(item)).slice(0, 5)
    : []
);

const normalizeReferences = (items = []) => (
  Array.isArray(items)
    ? items.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 4)
    : []
);

const normalizeFlyerPayload = ({
  title,
  description,
  category,
  artist,
  style,
  intensity,
  productionName,
  venue,
  city,
  uf,
  format,
  brandContext,
  brandColors,
  referenceNotes,
  referenceImages,
  creativeMemory,
  promotions,
  featuredItems,
  generationMode = "preview",
  candidateCount = 3,
  candidateVariation,
  regenerationMode,
  includeCandidates = true,
}) => ({
  purpose: "event_flyer_background",
  subject: String(title || "").trim(),
  description: String(description || "").trim() || undefined,
  category: String(category || "").trim() || undefined,
  artist: String(artist || "").trim() || undefined,
  style: String(style || "automatic").trim(),
  intensity: String(intensity || "balanced").trim(),
  production_name: String(productionName || "").trim() || undefined,
  venue: String(venue || "").trim() || undefined,
  city: String(city || "").trim() || undefined,
  uf: String(uf || "").trim().toUpperCase() || undefined,
  format: String(format || "cover").trim(),
  brand_context: String(brandContext || "").trim().slice(0, 500) || undefined,
  brand_colors: normalizeBrandColors(brandColors),
  reference_notes: String(referenceNotes || "").trim().slice(0, 500) || undefined,
  reference_images: normalizeReferences(referenceImages),
  creative_memory: compactStrings(creativeMemory),
  promotions: compactStrings(promotions),
  featured_items: compactStrings(featuredItems),
  generation_mode: generationMode === "final" ? "final" : "preview",
  candidate_count: generationMode === "final" ? 1 : Math.max(1, Math.min(4, Number(candidateCount) || 3)),
  candidate_variation: String(candidateVariation || "").trim() || undefined,
  regeneration_mode: String(regenerationMode || "").trim() || undefined,
  include_candidates: generationMode === "final" ? false : Boolean(includeCandidates),
});

const sleep = (milliseconds) => new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));

const errorStatus = (error) => Number(error?.status || error?.response?.status || 0);
const isCreativeTimeout = (error) => (
  String(error?.code || "").toUpperCase() === "ECONNABORTED"
  || /timeout|tempo.*esgot|demorou/i.test(String(error?.message || ""))
);
const shouldRetryCreative = (error) => {
  const status = errorStatus(error);
  return isCreativeTimeout(error) || status === 0 || TRANSIENT_CREATIVE_STATUSES.has(status);
};

const postCreativeImage = async (payload, idempotencyKey, attempt = 0) => {
  try {
    return (await appApiClient.post("/creative/images", payload, {
      timeout: CREATIVE_IMAGE_TIMEOUT_MS,
      headers: { "Idempotency-Key": idempotencyKey },
    })).data;
  } catch (error) {
    if (attempt >= CREATIVE_RETRY_DELAYS_MS.length || !shouldRetryCreative(error)) throw error;
    await sleep(CREATIVE_RETRY_DELAYS_MS[attempt]);
    return postCreativeImage(payload, idempotencyKey, attempt + 1);
  }
};

const generateEventFlyerBackgroundIdempotently = createIdempotentMutation({
  storagePrefix: "cutinapp_creative_event_flyer_attempt_",
  keyPrefix: "creative-flyer",
  requestKeyFor: (payload) => createMutationRequestKey(payload),
  mutate: async ({ idempotencyKey }, payload) => postCreativeImage(payload, idempotencyKey),
});

const creativeService = {
  generateEventFlyerBackground: (input) => (
    generateEventFlyerBackgroundIdempotently(normalizeFlyerPayload({
      ...input,
      generationMode: input?.generationMode || "preview",
    }))
  ),

  finalizeEventFlyerBackground: (input, candidateVariation) => (
    generateEventFlyerBackgroundIdempotently(normalizeFlyerPayload({
      ...input,
      generationMode: "final",
      candidateCount: 1,
      candidateVariation: candidateVariation || input?.candidateVariation,
      includeCandidates: false,
    }))
  ),

  regenerateEventFlyerBackground: (input, regenerationMode) => (
    generateEventFlyerBackgroundIdempotently(normalizeFlyerPayload({
      ...input,
      generationMode: "preview",
      regenerationMode,
    }))
  ),

  getEventCreativePresets: async () => (
    await appApiClient.get("/creative/presets", { timeout: 30000 })
  ).data,
};

export default creativeService;
