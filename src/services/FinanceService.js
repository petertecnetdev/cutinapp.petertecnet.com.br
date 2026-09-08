import appApiClient from "./AppApiClient";
import { createIdempotentMutation, createMutationRequestKey } from "../utils/idempotencyAttempts";

const uploadIdentityDocumentIdempotently = createIdempotentMutation({
  storagePrefix: "cutinapp_finance_identity_document_attempt_",
  keyPrefix: "finance-identity-document",
  requestKeyFor: (organizationId, front, back = null) => createMutationRequestKey({
    organization_id: String(organizationId),
    front,
    back,
    consent: "1",
  }),
  mutate: async ({ idempotencyKey }, organizationId, front, back = null) => {
    const body = new FormData();
    body.append("front", front);
    if (back) body.append("back", back);
    body.append("consent", "1");

    return (
      await appApiClient.post(`/organizations/${organizationId}/finance/identity/document`, body, {
        headers: { "Idempotency-Key": idempotencyKey },
      })
    ).data;
  },
});

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

const startLivenessIdempotently = createIdempotentMutation({
  storagePrefix: "cutinapp_finance_liveness_start_attempt_",
  keyPrefix: "finance-liveness-start",
  requestKeyFor: (organizationId) => createMutationRequestKey({
    organization_id: String(organizationId),
  }),
  mutate: async ({ idempotencyKey }, organizationId) => (
    await appApiClient.post(`/organizations/${organizationId}/finance/identity/liveness-session`, undefined, {
      headers: { "Idempotency-Key": idempotencyKey },
    })
  ).data,
});

const completeLivenessIdempotently = createIdempotentMutation({
  storagePrefix: "cutinapp_finance_liveness_complete_attempt_",
  keyPrefix: "finance-liveness-complete",
  requestKeyFor: (organizationId, sessionId) => createMutationRequestKey({
    organization_id: String(organizationId),
    session_id: String(sessionId || "").trim(),
  }),
  mutate: async ({ idempotencyKey }, organizationId, sessionId) => (
    await appApiClient.post(`/organizations/${organizationId}/finance/identity/liveness-complete`, {
      session_id: String(sessionId || "").trim(),
    }, {
      headers: { "Idempotency-Key": idempotencyKey },
    })
  ).data,
});

const financeService = {
  overview: async (organizationId) => (
    await appApiClient.get(`/organizations/${organizationId}/finance`)
  ).data,

  saveIdentity: async (organizationId, payload) => (
    await appApiClient.put(`/organizations/${organizationId}/finance/identity`, payload)
  ).data,

  uploadDocument: uploadIdentityDocumentIdempotently,

  startLiveness: startLivenessIdempotently,

  completeLiveness: completeLivenessIdempotently,

  savePix: async (organizationId, pixKeyType, pixKey) => (
    await appApiClient.put(`/organizations/${organizationId}/finance/pix`, {
      pix_key_type: pixKeyType,
      pix_key: pixKey,
    })
  ).data,

  requestPayout,
};

export default financeService;
