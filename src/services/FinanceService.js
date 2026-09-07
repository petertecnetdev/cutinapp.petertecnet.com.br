import appApiClient from "./AppApiClient";
import { createIdempotentMutation, createMutationRequestKey } from "../utils/idempotencyAttempts";

const requestPayoutIdempotently = createIdempotentMutation({
  storagePrefix: "cutinapp_finance_payout_attempt_",
  keyPrefix: "finance-payout",
  requestKeyFor: (organizationId, payload) => createMutationRequestKey({
    organization_id: String(organizationId),
    amount: payload.amount,
  }),
  mutate: async ({ idempotencyKey }, organizationId, payload) => (
    await appApiClient.post(`/organizations/${organizationId}/finance/payouts`, payload, {
      headers: { "Idempotency-Key": idempotencyKey },
    })
  ).data,
});

const requestPayout = (organizationId, amount) => {
  const payload = { amount: Number(amount) };
  return requestPayoutIdempotently(organizationId, payload);
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
