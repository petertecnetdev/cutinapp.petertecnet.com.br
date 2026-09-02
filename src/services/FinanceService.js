import { applicationApiClient as apiClient } from "./ApiClient";

const financeService = {
  overview: async (productionId) => (
    await apiClient.get(`/organizations/${productionId}/finance`)
  ).data,

  saveIdentity: async (productionId, payload) => (
    await apiClient.put(`/organizations/${productionId}/finance/identity`, payload)
  ).data,

  uploadDocument: async (productionId, front, back = null) => {
    const body = new FormData();
    body.append("front", front);
    if (back) body.append("back", back);
    body.append("consent", "1");
    return (
      await apiClient.post(`/organizations/${productionId}/finance/identity/document`, body)
    ).data;
  },

  startLiveness: async (productionId) => (
    await apiClient.post(`/organizations/${productionId}/finance/identity/liveness-session`)
  ).data,

  completeLiveness: async (productionId, sessionId) => (
    await apiClient.post(`/organizations/${productionId}/finance/identity/liveness-complete`, {
      session_id: sessionId,
    })
  ).data,

  savePix: async (productionId, pixKeyType, pixKey) => (
    await apiClient.put(`/organizations/${productionId}/finance/pix`, {
      pix_key_type: pixKeyType,
      pix_key: pixKey,
    })
  ).data,

  requestPayout: async (productionId, amount) => (
    await apiClient.post(`/organizations/${productionId}/finance/payouts`, { amount })
  ).data,
};

export default financeService;
