import apiClient from "./ApiClient";

const financeService = {
  overview: async (productionId) => (
    await apiClient.get(`/finance/productions/${productionId}`)
  ).data,

  saveIdentity: async (productionId, payload) => (
    await apiClient.put(`/finance/productions/${productionId}/identity`, payload)
  ).data,

  uploadDocument: async (productionId, front, back = null) => {
    const body = new FormData();
    body.append("front", front);
    if (back) body.append("back", back);
    body.append("consent", "1");
    return (
      await apiClient.post(`/finance/productions/${productionId}/identity/document`, body, {
        headers: { "Content-Type": "multipart/form-data" },
      })
    ).data;
  },

  startLiveness: async (productionId) => (
    await apiClient.post(`/finance/productions/${productionId}/identity/liveness-session`)
  ).data,

  completeLiveness: async (productionId, sessionId) => (
    await apiClient.post(`/finance/productions/${productionId}/identity/liveness-complete`, {
      session_id: sessionId,
    })
  ).data,

  savePix: async (productionId, pixKeyType, pixKey) => (
    await apiClient.put(`/finance/productions/${productionId}/pix`, {
      pix_key_type: pixKeyType,
      pix_key: pixKey,
    })
  ).data,

  requestPayout: async (productionId, amount) => (
    await apiClient.post(`/finance/productions/${productionId}/payouts`, { amount })
  ).data,
};

export default financeService;
