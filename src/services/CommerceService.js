import appApiClient from "./AppApiClient";

const pendingCheckouts = new Map();

const checkoutRequestKey = (payload = {}) => JSON.stringify({
  event_id: Number(payload.event_id || 0),
  payment_method: String(payload.payment_method || ""),
  tickets: (Array.isArray(payload.tickets) ? payload.tickets : []).map((item) => ({
    id: Number(item?.id || 0),
    quantity: Number(item?.quantity || 0),
  })),
  items: (Array.isArray(payload.items) ? payload.items : []).map((item) => ({
    id: Number(item?.id || 0),
    quantity: Number(item?.quantity || 0),
  })),
});

const checkout = (payload) => {
  const key = checkoutRequestKey(payload);
  const pending = pendingCheckouts.get(key);
  if (pending) return pending;

  const request = appApiClient
    .post("/commerce/checkout", payload)
    .then((response) => response.data)
    .finally(() => {
      if (pendingCheckouts.get(key) === request) pendingCheckouts.delete(key);
    });

  pendingCheckouts.set(key, request);
  return request;
};

const commerceService = {
  catalog: async (slug) => (await appApiClient.get(`/events/public/${slug}/purchase-options`)).data,
  checkout,
  myOrders: async (params = {}) => (await appApiClient.get("/commerce/orders/mine", { params })).data,
  order: async (publicId) => (await appApiClient.get(`/commerce/orders/${publicId}`)).data.order,
  syncPayment: async (publicId) => (await appApiClient.post(`/commerce/orders/${publicId}/sync-payment`)).data.order,
  pickupCredential: async (publicId) => (await appApiClient.get(`/commerce/orders/${publicId}/pickup-credential`)).data.credential,
  redeemEventItems: async (token, eventId) => (await appApiClient.post("/commerce/item-redemptions/redeem", {
    token,
    event_id: Number(eventId),
  })).data,

  purchases: async (params = {}) => (await appApiClient.get("/commerce/purchases", { params })).data,
  purchase: async (publicId) => (await appApiClient.get(`/commerce/purchases/${publicId}`)).data.order,
  receipt: async (publicId) => (await appApiClient.get(`/commerce/purchases/${publicId}/receipt`)).data.receipt,
  receiptPdf: async (publicId) => (
    await appApiClient.get(`/commerce/purchases/${publicId}/receipt.pdf`, { responseType: "blob" })
  ).data,
  producerSales: async (organizationId, params = {}) => (
    await appApiClient.get(`/organizations/${organizationId}/sales`, { params })
  ).data,
  producerSale: async (organizationId, publicId) => (
    await appApiClient.get(`/organizations/${organizationId}/sales/${publicId}`)
  ).data.order,

  saveEventItem: async (eventId, payload, itemId = null) => (
    itemId
      ? await appApiClient.patch(`/events/${eventId}/items/${itemId}`, payload)
      : await appApiClient.post(`/events/${eventId}/items`, payload)
  ).data,
  deleteEventItem: async (eventId, itemId) => (await appApiClient.delete(`/events/${eventId}/items/${itemId}`)).data,
  paymentAccount: async (organizationId) => (await appApiClient.get(`/organizations/${organizationId}/payment-account`)).data.account,
  connectMercadoPago: async (organizationId) => (await appApiClient.get(`/organizations/${organizationId}/payment-provider/connect`)).data,
  financialSummary: async (organizationId) => (await appApiClient.get(`/organizations/${organizationId}/financial-summary`)).data,
  payoutSummary: async (organizationId) => (await appApiClient.get(`/organizations/${organizationId}/payouts`)).data,
  requestPayout: async (organizationId, amount) => (await appApiClient.post(`/organizations/${organizationId}/payouts`, { amount })).data,
  cancelPayout: async (organizationId, payoutId) => (await appApiClient.post(`/organizations/${organizationId}/payouts/${payoutId}/cancel`)).data,
};

export default commerceService;
