import apiClient from "./ApiClient";

const commerceService = {
  catalog: async (slug) => (await apiClient.get(`/cutinapp/events/public/${slug}/commerce`)).data,
  checkout: async (payload) => (await apiClient.post("/cutinapp/checkout", payload)).data,
  myOrders: async (params = {}) => (await apiClient.get("/cutinapp/orders/mine", { params })).data,
  order: async (publicId) => (await apiClient.get(`/cutinapp/orders/${publicId}`)).data.order,
  saveEventItem: async (eventId, payload, itemId = null) => (
    await apiClient.post(itemId ? `/cutinapp/events/${eventId}/items/${itemId}` : `/cutinapp/events/${eventId}/items`, payload)
  ).data,
  deleteEventItem: async (eventId, itemId) => (await apiClient.delete(`/cutinapp/events/${eventId}/items/${itemId}`)).data,
  paymentAccount: async (productionId) => (await apiClient.get(`/cutinapp/productions/${productionId}/payment-account`)).data.account,
  savePaymentAccount: async (productionId, pixKey) => (await apiClient.put(`/cutinapp/productions/${productionId}/payment-account`, { pix_key: pixKey })).data,
  financialSummary: async (productionId) => (await apiClient.get(`/cutinapp/productions/${productionId}/financial-summary`)).data,
  payout: async (productionId, amount = null) => (await apiClient.post(`/cutinapp/productions/${productionId}/payouts`, amount ? { amount } : {})).data,
};

export default commerceService;
