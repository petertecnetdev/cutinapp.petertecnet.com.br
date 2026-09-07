import appApiClient from "./AppApiClient";
import { isNetworkFailure } from "../utils/networkStatus";
import { safeGetSessionJson, safeRemoveSessionItem, safeSetSessionJson } from "../utils/safeStorage";
import { trackTelemetry } from "../utils/telemetry";
import { shouldKeepCheckoutAttempt } from "../utils/checkoutRetryPolicy";
import { clearPaymentRecoveryAttribution, readPaymentRecoveryAttribution } from "../utils/paymentRecoveryAttribution";

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
      if (!shouldKeepCheckoutAttempt(error)) clearAttempt(requestKey);
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

const syncPayment = async (publicId) => {
  const order = (await appApiClient.post(`/commerce/orders/${publicId}/sync-payment`)).data.order;
  const recoveryAttribution = readPaymentRecoveryAttribution(order?.public_id || publicId);
  if (order?.status === "paid" && recoveryAttribution) {
    trackTelemetry("checkout_recovery_paid", {
      label: "PIX recuperado convertido em pagamento",
      target: String(order?.event?.slug || order?.event_id || "checkout"),
      metadata: {
        event_id: Number(order?.event?.id || order?.event_id || 0),
        order_public_id: order?.public_id || publicId,
        recovered_gmv: Number(order?.total || recoveryAttribution.amount || 0),
        payment_method: String(order?.payment_method || "pix").toLowerCase(),
        recovery_started_at: new Date(recoveryAttribution.startedAt).toISOString(),
        outcome: "success",
      },
    });
    clearPaymentRecoveryAttribution(order?.public_id || publicId);
  }
  return order;
};

const commerceService = {
  catalog,
  checkout,
  pendingCheckout: async () => (await appApiClient.get("/commerce/checkout/pending")).data,
  recoverPendingCheckout: async (orderId) => (
    await appApiClient.post("/commerce/checkout/pending/recover", { order_id: Number(orderId) })
  ).data,
  myOrders: async (params = {}) => (await appApiClient.get("/commerce/orders/mine", { params })).data,
  order: async (publicId) => (await appApiClient.get(`/commerce/orders/${publicId}`)).data.order,
  syncPayment,
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
  revenueFunnel: async (organizationId, days = 30) => {
    const boundedDays = Math.min(Math.max(Number(days) || 30, 1), 365);
    try {
      return (await appApiClient.get(`/organizations/${organizationId}/revenue-funnel`, {
        params: { days: boundedDays },
      })).data;
    } catch (error) {
      trackTelemetry("producer_revenue_analytics_unavailable", {
        label: "Métricas financeiras temporariamente indisponíveis",
        target: String(organizationId || ""),
        metadata: {
          days: boundedDays,
          status: Number(error?.status || error?.response?.status || 0) || null,
          network_failure: isNetworkFailure(error),
        },
      });
      return null;
    }
  },
  payoutSummary: async (organizationId) => (await appApiClient.get(`/organizations/${organizationId}/payouts`)).data,
  requestPayout: async (organizationId, amount) => (await appApiClient.post(`/organizations/${organizationId}/payouts`, { amount })).data,
  cancelPayout: async (organizationId, payoutId) => (await appApiClient.post(`/organizations/${organizationId}/payouts/${payoutId}/cancel`)).data,
};

export default commerceService;
