import appApiClient from "./AppApiClient";
import {
  createIdempotencyAttemptManager,
  createMutationRequestKey,
  shouldKeepIdempotencyAttempt,
} from "../utils/idempotencyAttempts";

const pendingOnboardings = new Map();
const onboardingAttempts = createIdempotencyAttemptManager({
  storagePrefix: "cutinapp_acquisition_onboarding_attempt_",
  keyPrefix: "acquisition-onboarding",
});

const onboard = (payload = {}) => {
  const requestKey = createMutationRequestKey(payload);
  const pending = pendingOnboardings.get(requestKey);
  if (pending) return pending;

  const idempotencyKey = onboardingAttempts.keyFor(requestKey);
  const request = appApiClient.post("/acquisition/onboardings", payload, {
    headers: { "Idempotency-Key": idempotencyKey },
  }).then((response) => {
    onboardingAttempts.clear(requestKey);
    return response.data;
  }).catch((error) => {
    if (!shouldKeepIdempotencyAttempt(error)) onboardingAttempts.clear(requestKey);
    throw error;
  }).finally(() => {
    if (pendingOnboardings.get(requestKey) === request) pendingOnboardings.delete(requestKey);
  });

  pendingOnboardings.set(requestKey, request);
  return request;
};

const acquisitionService = {
  context: async () => (await appApiClient.get("/acquisition/context")).data,
  dashboard: async () => (await appApiClient.get("/acquisition/dashboard")).data,
  referrals: async (params = {}) => (await appApiClient.get("/acquisition/referrals", { params })).data,
  onboard,
  resend: async (referralId) => (await appApiClient.post(`/acquisition/referrals/${referralId}/resend`)).data,
  updateCommission: async (eventId, percentage) => (await appApiClient.put(`/acquisition/events/${eventId}/commission`, { percentage })).data,
  publicReferral: async (token) => (await appApiClient.get(`/acquisition/referrals/public/${encodeURIComponent(token)}`)).data,
  activate: async (payload) => (await appApiClient.post("/acquisition/referrals/activate", payload)).data,
};

export default acquisitionService;
