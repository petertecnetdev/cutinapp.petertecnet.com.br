import appApiClient from "./AppApiClient";
import { createIdempotentMutation, createMutationRequestKey } from "../utils/idempotencyAttempts";

const initiateAssisted = createIdempotentMutation({
  storagePrefix: "cutinapp_assisted_onboarding_attempt_",
  keyPrefix: "assisted-onboarding",
  requestKeyFor: (payload = {}) => createMutationRequestKey(payload),
  mutate: async ({ idempotencyKey }, payload = {}) => (
    await appApiClient.post("/organization-onboarding/assisted", payload, {
      headers: { "Idempotency-Key": idempotencyKey },
    })
  ).data,
});

const resendHandoff = createIdempotentMutation({
  storagePrefix: "cutinapp_onboarding_handoff_attempt_",
  keyPrefix: "onboarding-handoff",
  requestKeyFor: (organizationId) => String(Number(organizationId)),
  mutate: async ({ idempotencyKey }, organizationId) => (
    await appApiClient.post(
      `/organizations/${Number(organizationId)}/onboarding/resend-handoff`,
      undefined,
      { headers: { "Idempotency-Key": idempotencyKey } },
    )
  ).data,
});

const onboardingService = {
  mine: async () => (await appApiClient.get("/organization-onboarding/mine")).data.onboardings || [],
  show: async (organizationId) => (
    await appApiClient.get(`/organizations/${Number(organizationId)}/onboarding`)
  ).data.onboarding,
  admin: async (params = {}) => (
    await appApiClient.get("/organization-onboarding/admin", { params })
  ).data.onboardings,
  initiateAssisted,
  resendHandoff,
};

export default onboardingService;
