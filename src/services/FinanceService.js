import appApiClient from "./AppApiClient";

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

  requestPayout: async (organizationId, amount) => (
    await appApiClient.post(`/organizations/${organizationId}/finance/payouts`, { amount })
  ).data,
};

export default financeService;
