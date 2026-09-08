import appApiClient from "./AppApiClient";
import { createIdempotentMutation, createMutationRequestKey } from "../utils/idempotencyAttempts";

const compactStrings = (items = []) => (
  Array.isArray(items)
    ? items.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 8)
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
  promotions,
  featuredItems,
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
  promotions: compactStrings(promotions),
  featured_items: compactStrings(featuredItems),
});

const generateEventFlyerBackgroundIdempotently = createIdempotentMutation({
  storagePrefix: "cutinapp_creative_event_flyer_attempt_",
  keyPrefix: "creative-flyer",
  requestKeyFor: (payload) => createMutationRequestKey(payload),
  mutate: async ({ idempotencyKey }, payload) => (
    await appApiClient.post("/creative/images", payload, {
      headers: { "Idempotency-Key": idempotencyKey },
    })
  ).data,
});

const creativeService = {
  generateEventFlyerBackground: (input) => (
    generateEventFlyerBackgroundIdempotently(normalizeFlyerPayload(input))
  ),

  getEventCreativePresets: async () => (
    await appApiClient.get("/creative/presets")
  ).data,
};

export default creativeService;
