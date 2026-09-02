import apiClient from "./ApiClient";

const commerceService = {
  catalog: async (slug) => (await apiClient.get(`/cutinapp/events/public/${slug}/commerce`)).data,
  checkout: async (payload) => (await apiClient.post("/cutinapp/checkout", payload)).data,
  myOrders: async (params = {}) => (await apiClient.get("/cutinapp/orders/mine", { params })).data,
  order: async (publicId) => (await apiClient.get(`/cutinapp/orders/${publicId}`)).data.order,
  syncPayment: async (publicId) => (await apiClient.post(`/cutinapp/orders/${publicId}/sync-payment`)).data.order,

  purchases: async (params = {}) => (await apiClient.get("/cutinapp/purchases", { params })).data,
  purchase: async (publicId) => (await apiClient.get(`/cutinapp/purchases/${publicId}`)).data.order,
  receipt: async (publicId) => (await apiClient.get(`/cutinapp/purchases/${publicId}/receipt`)).data.receipt,
  receiptPdf: async (publicId) => (
    await apiClient.get(`/cutinapp/purchases/${publicId}/receipt.pdf`, { responseType: "blob" })
  ).data,
  producerSales: async (productionId, params = {}) => (
    await apiClient.get(`/cutinapp/productions/${productionId}/sales`, { params })
  ).data,
  producerSale: async (productionId, publicId) => (
    await apiClient.get(`/cutinapp/productions/${productionId}/sales/${publicId}`)
  ).data.order,

  saveEventItem: async (eventId, payload, itemId = null) => (
    await apiClient.post(itemId ? `/cutinapp/events/${eventId}/items/${itemId}` : `/cutinapp/events/${eventId}/items`, payload)
  ).data,
  deleteEventItem: async (eventId, itemId) => (await apiClient.delete(`/cutinapp/events/${eventId}/items/${itemId}`)).data,
  paymentAccount: async (productionId) => (await apiClient.get(`/cutinapp/productions/${productionId}/payment-account`)).data.account,
  connectMercadoPago: async (productionId) => (await apiClient.get(`/cutinapp/productions/${productionId}/mercadopago/connect`)).data,
  financialSummary: async (productionId) => (await apiClient.get(`/cutinapp/productions/${productionId}/financial-summary`)).data,
  payoutSummary: async (productionId) => (await apiClient.get(`/cutinapp/productions/${productionId}/payouts`)).data,
  requestPayout: async (productionId, amount) => (await apiClient.post(`/cutinapp/productions/${productionId}/payouts`, { amount })).data,
  cancelPayout: async (productionId, payoutId) => (await apiClient.post(`/cutinapp/productions/${productionId}/payouts/${payoutId}/cancel`)).data,
};

export default commerceService;
