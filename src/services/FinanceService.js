import appApiClient from "./AppApiClient";
import {
  createIdempotencyAttemptManager,
  createMutationRequestKey,
  shouldKeepIdempotencyAttempt,
} from "../utils/idempotencyAttempts";

const pendingPayoutRequests = new Map();
const payoutAttempts = createIdempotencyAttemptManager({
  storagePrefix: "cutinapp_finance_payout_attempt_",
  keyPrefix: "finance-payout",
});

const requestPayout = (organizationId, amount) => {
  const payload = { amount };
  const requestKey = createMutationRequestKey({
    organization_id: String(organizationId),
    amount: Number(amount),
  });
  const pending = pendingPayoutRequests.get(requestKey);
  if (pending) return pending;

  const idempotencyKey = payoutAttempts.keyFor(requestKey);
  const request = appApiClient.post(`/organizations/${organizationId}/finance/payouts`, payload, {
    headers: { "Idempotency-Key": idempotencyKey },
  }).then((response) => {
    payoutAttempts.clear(requestKey);
    return response.data;
  }).catch((error) => {
    if (!shouldKeepIdempotencyAttempt(error)) payoutAttempts.clear(requestKey);
    throw error;
  }).finally(() => {
    if (pendingPayoutRequests.get(requestKey) === request) pendingPayoutRequests.delete(requestKey);
  });

  pendingPayoutRequests.set(requestKey, request);
  return request;
};

const financeService = {
  overview: async (organizationId) => (
    await appApiClient.get(`/organizations/${organizationId}/finance`)
  ).data,

  saveIdentity: async (organizationId, payload) => (
    await appApiClient.put(`/organizations/${organizationId}/finance/identity`, payload)
  ).data,

  uploadDocument: async (organizationId, front, back = null) => {
    const body = new FormData();
    body.append("front", front);
    if (back) body.append("back", back);
    body.append("consent", "1");
    return (
      await appApiClient.post(`/organizations/${organizationId}/finance/identity/document`, body)
    ).data;
  },

  startLiveness: async (organizationId) => (
    await appApiClient.post(`/organizations/${organizationId}/finance/identity/liveness-session`)
  ).data,

  completeLiveness: async (organizationId, sessionId) => (
    await appApiClient.post(`/organizations/${organizationId}/finance/identity/liveness-complete`, {
      session_id: sessionId,
    })
  ).data,

  savePix: async (organizationId, pixKeyType, pixKey) => (
    await appApiClient.put(`/organizations/${organizationId}/finance/pix`, {
      pix_key_type: pixKeyType,
      pix_key: pixKey,
    })
  ).data,

  requestPayout,
};

export default financeService;
