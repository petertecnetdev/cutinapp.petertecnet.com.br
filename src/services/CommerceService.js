import { applicationApiClient as apiClient } from "./ApiClient";

const commerceService = {
  catalog: async (slug) => (await apiClient.get(`/events/public/${slug}/commerce`)).data,
  checkout: async (payload) => (await apiClient.post("/commerce/checkout", payload)).data,
  myOrders: async (params = {}) => (await apiClient.get("/commerce/orders/mine", { params })).data,
  order: async (publicId) => (await apiClient.get(`/commerce/orders/${publicId}`)).data.order,
  syncPayment: async (publicId) => (await apiClient.post(`/commerce/orders/${publicId}/sync-payment`)).data.order,

  purchases: async (params = {}) => (await apiClient.get("/commerce/purchases", { params })).data,
  purchase: async (publicId) => (await apiClient.get(`/commerce/purchases/${publicId}`)).data.order,
  receipt: async (publicId) => (await apiClient.get(`/commerce/purchases/${publicId}/receipt`)).data.receipt,
  receiptPdf: async (publicId) => (
    await apiClient.get(`/commerce/purchases/${publicId}/receipt.pdf`, { responseType: "blob" })
  ).data,
  producerSales: async (organizationId, params = {}) => (
    await apiClient.get(`/organizations/${organizationId}/sales`, { params })
  ).data,
  producerSale: async (organizationId, publicId) => (
    await apiClient.get(`/organizations/${organizationId}/sales/${publicId}`)
  ).data.order,

  saveEventItem: async (eventId, payload, itemId = null) => (
    itemId
      ? await apiClient.patch(`/events/${eventId}/items/${itemId}`, payload)
      : await apiClient.post(`/events/${eventId}/items`, payload)
  ).data,
  deleteEventItem: async (eventId, itemId) => (await apiClient.delete(`/events/${eventId}/items/${itemId}`)).data,
  paymentAccount: async (organizationId) => (await apiClient.get(`/organizations/${organizationId}/payment-account`)).data.account,
  connectMercadoPago: async (organizationId) => (await apiClient.get(`/organizations/${organizationId}/payment-provider/connect`)).data,
  financialSummary: async (organizationId) => (await apiClient.get(`/organizations/${organizationId}/financial-summary`)).data,
  payoutSummary: async (organizationId) => (await apiClient.get(`/organizations/${organizationId}/finance`)).data,
  requestPayout: async (organizationId, amount) => (await apiClient.post(`/organizations/${organizationId}/finance/payouts`, { amount })).data,
};

export default commerceService;
