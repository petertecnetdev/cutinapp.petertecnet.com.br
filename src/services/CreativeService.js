import appApiClient from "./AppApiClient";
import { createIdempotentMutation, createMutationRequestKey } from "../utils/idempotencyAttempts";

const normalizeFlyerPayload = ({
  title,
  description,
  style,
  productionName,
  venue,
  city,
  uf,
  format,
}) => ({
  purpose: "event_flyer_background",
  subject: String(title || "").trim(),
  description: String(description || "").trim() || undefined,
  style: String(style || "").trim(),
  production_name: String(productionName || "").trim() || undefined,
  venue: String(venue || "").trim() || undefined,
  city: String(city || "").trim() || undefined,
  uf: String(uf || "").trim().toUpperCase() || undefined,
  format: String(format || "").trim(),
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
};

export default creativeService;
