import apiClient from "./ApiClient";

const commerceService = {
  catalog: async (slug) => (await apiClient.get(`/events/public/${slug}/commerce`)).data,
  checkout: async (payload) => (await apiClient.post("/checkout", payload)).data,
  myOrders: async (params = {}) => (await apiClient.get("/orders/mine", { params })).data,
  order: async (publicId) => (await apiClient.get(`/orders/${publicId}`)).data.order,
  syncPayment: async (publicId) => (await apiClient.post(`/orders/${publicId}/sync-payment`)).data.order,

  purchases: async (params = {}) => (await apiClient.get("/purchases", { params })).data,
  purchase: async (publicId) => (await apiClient.get(`/purchases/${publicId}`)).data.order,
  receipt: async (publicId) => (await apiClient.get(`/purchases/${publicId}/receipt`)).data.receipt,
  receiptPdf: async (publicId) => (
    await apiClient.get(`/purchases/${publicId}/receipt.pdf`, { responseType: "blob" })
  ).data,
  producerSales: async (productionId, params = {}) => (
    await apiClient.get(`/productions/${productionId}/sales`, { params })
  ).data,
  producerSale: async (productionId, publicId) => (
    await apiClient.get(`/productions/${productionId}/sales/${publicId}`)
  ).data.order,

  saveEventItem: async (eventId, payload, itemId = null) => (
    await apiClient.post(itemId ? `/events/${eventId}/items/${itemId}` : `/events/${eventId}/items`, payload)
  ).data,
  deleteEventItem: async (eventId, itemId) => (await apiClient.delete(`/events/${eventId}/items/${itemId}`)).data,
  paymentAccount: async (productionId) => (await apiClient.get(`/productions/${productionId}/payment-account`)).data.account,
  connectMercadoPago: async (productionId) => (await apiClient.get(`/productions/${productionId}/mercadopago/connect`)).data,
  financialSummary: async (productionId) => (await apiClient.get(`/productions/${productionId}/financial-summary`)).data,
  payoutSummary: async (productionId) => (await apiClient.get(`/productions/${productionId}/payouts`)).data,
  requestPayout: async (productionId, amount) => (await apiClient.post(`/productions/${productionId}/payouts`, { amount })).data,
  cancelPayout: async (productionId, payoutId) => (await apiClient.post(`/productions/${productionId}/payouts/${payoutId}/cancel`)).data,
};

export default commerceService;
