import appApiClient from "./AppApiClient";
import { createIdempotentMutation, createMutationRequestKey } from "../utils/idempotencyAttempts";

const onboard = createIdempotentMutation({
  storagePrefix: "cutinapp_acquisition_onboarding_attempt_",
  keyPrefix: "acquisition-onboarding",
  requestKeyFor: (payload = {}) => createMutationRequestKey(payload),
  mutate: async ({ idempotencyKey }, payload = {}) => (
    await appApiClient.post("/acquisition/onboardings", payload, {
      headers: { "Idempotency-Key": idempotencyKey },
    })
  ).data,
});

const resend = createIdempotentMutation({
  storagePrefix: "cutinapp_acquisition_resend_attempt_",
  keyPrefix: "acquisition-resend",
  requestKeyFor: (referralId) => String(referralId),
  mutate: async ({ idempotencyKey }, referralId) => (
    await appApiClient.post(`/acquisition/referrals/${referralId}/resend`, undefined, {
      headers: { "Idempotency-Key": idempotencyKey },
    })
  ).data,
});

const activate = createIdempotentMutation({
  storagePrefix: "cutinapp_acquisition_activation_attempt_",
  keyPrefix: "acquisition-activation",
  requestKeyFor: (payload = {}) => createMutationRequestKey(payload),
  mutate: async ({ idempotencyKey }, payload = {}) => (
    await appApiClient.post("/acquisition/referrals/activate", payload, {
      headers: { "Idempotency-Key": idempotencyKey },
    })
  ).data,
});

const acquisitionService = {
  context: async () => (await appApiClient.get("/acquisition/context")).data,
  dashboard: async () => (await appApiClient.get("/acquisition/dashboard")).data,
  referrals: async (params = {}) => (await appApiClient.get("/acquisition/referrals", { params })).data,
  onboard,
  resend,
  updateCommission: async (eventId, percentage) => (await appApiClient.put(`/acquisition/events/${eventId}/commission`, { percentage })).data,
  publicReferral: async (token) => (await appApiClient.get(`/acquisition/referrals/public/${encodeURIComponent(token)}`)).data,
  activate,
};

export default acquisitionService;
