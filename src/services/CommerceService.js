import appApiClient from "./AppApiClient";
import { isNetworkFailure } from "../utils/networkStatus";
import { safeGetSessionJson, safeRemoveSessionItem, safeSetSessionJson } from "../utils/safeStorage";

const pendingCheckouts = new Map();
const fallbackAttempts = new Map();
const catalogCache = new Map();
const CHECKOUT_ATTEMPT_PREFIX = "cutinapp_checkout_attempt_";
const CATALOG_CACHE_TTL_MS = 15000;

const checkoutRequestKey = (payload = {}) => JSON.stringify({
  event_id: Number(payload.event_id || 0),
  payment_method: String(payload.payment_method || ""),
  payment_method_id: String(payload.payment_method_id || ""),
  issuer_id: String(payload.issuer_id || ""),
  installments: Number(payload.installments || 0),
  payer_email: String(payload.payer_email || "").trim().toLowerCase(),
  payer_identification_type: String(payload.payer_identification_type || ""),
  payer_identification_number: String(payload.payer_identification_number || "").replace(/\D+/g, ""),
  tickets: (Array.isArray(payload.tickets) ? payload.tickets : []).map((item) => ({
    id: Number(item?.id || 0),
    quantity: Number(item?.quantity || 0),
  })),
  items: (Array.isArray(payload.items) ? payload.items : []).map((item) => ({
    id: Number(item?.id || 0),
    quantity: Number(item?.quantity || 0),
  })),
});

const requestKeyHash = (value) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

const createIdempotencyKey = () => {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `checkout-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
};

const storageFor = (requestKey) => `${CHECKOUT_ATTEMPT_PREFIX}${requestKeyHash(requestKey)}`;

const readAttempt = (requestKey) => {
  const stored = safeGetSessionJson(storageFor(requestKey));
  if (stored?.requestKey === requestKey && stored?.idempotencyKey) return stored.idempotencyKey;
  return fallbackAttempts.get(requestKey) || null;
};

const saveAttempt = (requestKey, idempotencyKey) => {
  fallbackAttempts.set(requestKey, idempotencyKey);
  safeSetSessionJson(storageFor(requestKey), { requestKey, idempotencyKey });
};

const clearAttempt = (requestKey) => {
  fallbackAttempts.delete(requestKey);
  safeRemoveSessionItem(storageFor(requestKey));
};

const idempotencyKeyFor = (requestKey) => {
  const existing = readAttempt(requestKey);
  if (existing) return existing;
  const created = createIdempotencyKey();
  saveAttempt(requestKey, created);
  return created;
};

const shouldKeepAttempt = (error) => isNetworkFailure(error) || Number(error?.status || 0) === 409;

const checkout = (payload) => {
  const requestKey = checkoutRequestKey(payload);
  const pending = pendingCheckouts.get(requestKey);
  if (pending) return pending;

  const idempotencyKey = idempotencyKeyFor(requestKey);
  const request = appApiClient
    .post("/commerce/checkout", payload, {
      headers: { "Idempotency-Key": idempotencyKey },
    })
    .then((response) => {
      clearAttempt(requestKey);
      return response.data;
    })
    .catch((error) => {
      if (!shouldKeepAttempt(error)) clearAttempt(requestKey);
      throw error;
    })
    .finally(() => {
      if (pendingCheckouts.get(requestKey) === request) pendingCheckouts.delete(requestKey);
    });

  pendingCheckouts.set(requestKey, request);
  return request;
};

const catalog = (slug) => {
  const key = String(slug || "").trim();
  const now = Date.now();
  const cached = catalogCache.get(key);

  if (cached?.data && cached.expiresAt > now) return Promise.resolve(cached.data);
  if (cached?.request) return cached.request;

  const request = appApiClient
    .get(`/events/public/${key}/commerce`)
    .then((response) => {
      const data = response.data;
      catalogCache.set(key, { data, expiresAt: Date.now() + CATALOG_CACHE_TTL_MS });
      return data;
    })
    .catch((error) => {
      catalogCache.delete(key);
      throw error;
    });

  catalogCache.set(key, { request });
  return request;
};

const invalidateCatalogCache = () => catalogCache.clear();

const commerceService = {
  catalog,
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

  saveEventItem: async (eventId, payload, itemId = null) => {
    const response = itemId
      ? await appApiClient.patch(`/events/${eventId}/items/${itemId}`, payload)
      : await appApiClient.post(`/events/${eventId}/items`, payload);
    invalidateCatalogCache();
    return response.data;
  },
  deleteEventItem: async (eventId, itemId) => {
    const response = await appApiClient.delete(`/events/${eventId}/items/${itemId}`);
    invalidateCatalogCache();
    return response.data;
  },
  paymentAccount: async (organizationId) => (await appApiClient.get(`/organizations/${organizationId}/payment-account`)).data.account,
  connectMercadoPago: async (organizationId) => (await appApiClient.get(`/organizations/${organizationId}/payment-provider/connect`)).data,
  financialSummary: async (organizationId) => (await appApiClient.get(`/organizations/${organizationId}/financial-summary`)).data,
  revenueFunnel: async (organizationId, days = 30) => (
    await appApiClient.get(`/organizations/${organizationId}/revenue-funnel`, {
      params: { days: Math.min(Math.max(Number(days) || 30, 1), 365) },
    })
  ).data,
  payoutSummary: async (organizationId) => (await appApiClient.get(`/organizations/${organizationId}/payouts`)).data,
  requestPayout: async (organizationId, amount) => (await appApiClient.post(`/organizations/${organizationId}/payouts`, { amount })).data,
  cancelPayout: async (organizationId, payoutId) => (await appApiClient.post(`/organizations/${organizationId}/payouts/${payoutId}/cancel`)).data,
};

export default commerceService;
