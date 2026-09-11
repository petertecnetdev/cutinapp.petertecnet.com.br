import appApiClient from "./AppApiClient";
import { isNetworkFailure } from "../utils/networkStatus";
import { safeGetSessionJson, safeRemoveSessionItem, safeSetSessionJson } from "../utils/safeStorage";
import { trackTelemetry } from "../utils/telemetry";
import { shouldKeepCheckoutAttempt } from "../utils/checkoutRetryPolicy";
import { clearPaymentRecoveryAttribution, readPaymentRecoveryAttribution } from "../utils/paymentRecoveryAttribution";
import { createIdempotentMutation, createMutationRequestKey } from "../utils/idempotencyAttempts";
import { isBrowserOffline, waitForOnline } from "../utils/checkoutConnectivity";
import { trackSearchConversion } from "../utils/searchAttribution";

const pendingCheckouts = new Map();
const fallbackAttempts = new Map();
const catalogCache = new Map();
const CHECKOUT_ATTEMPT_PREFIX = "cutinapp_checkout_attempt_";
const CATALOG_CACHE_TTL_MS = 15000;
const AUTO_RETRY_CHECKOUT_STATUSES = new Set([502, 503, 504]);
const DEFAULT_CHECKOUT_RETRY_DELAY_MS = 350;
const MAX_CHECKOUT_RETRY_DELAY_MS = 1500;
const OFFLINE_CHECKOUT_RETRY_WAIT_MS = 8000;

const checkoutRequestKey = (payload = {}) => JSON.stringify({
  event_id: Number(payload.event_id || 0),
  payment_method: String(payload.payment_method || ""),
  payment_method_id: String(payload.payment_method_id || ""),
  issuer_id: String(payload.issuer_id || ""),
  installments: Number(payload.installments || 0),
  payer_email: String(payload.payer_email || "").trim().toLowerCase(),
  payer_identification_type: String(payload.payer_identification_type || ""),
  payer_identification_number: String(payload.payer_identification_number || "").replace(/\D+/g, ""),
  coupon_code: String(payload.coupon_code || "").trim().toUpperCase(),
  tickets: (Array.isArray(payload.tickets) ? payload.tickets : []).map((item) => ({ id: Number(item?.id || 0), quantity: Number(item?.quantity || 0) })),
  items: (Array.isArray(payload.items) ? payload.items : []).map((item) => ({ id: Number(item?.id || 0), quantity: Number(item?.quantity || 0) })),
});

const requestKeyHash = (value) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); }
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
const saveAttempt = (requestKey, idempotencyKey) => { fallbackAttempts.set(requestKey, idempotencyKey); safeSetSessionJson(storageFor(requestKey), { requestKey, idempotencyKey }); };
const clearAttempt = (requestKey) => { fallbackAttempts.delete(requestKey); safeRemoveSessionItem(storageFor(requestKey)); };
const idempotencyKeyFor = (requestKey) => { const existing = readAttempt(requestKey); if (existing) return existing; const created = createIdempotencyKey(); saveAttempt(requestKey, created); return created; };
const shouldAutoRetryCheckout = (error) => { const status = Number(error?.status || error?.response?.status || 0); return isNetworkFailure(error) || AUTO_RETRY_CHECKOUT_STATUSES.has(status); };
const checkoutRetryDelay = (error) => { const retryAfter = Number(error?.response?.headers?.["retry-after"] || error?.headers?.["retry-after"] || 0); if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(Math.round(retryAfter * 1000), MAX_CHECKOUT_RETRY_DELAY_MS); return DEFAULT_CHECKOUT_RETRY_DELAY_MS; };
const wait = (milliseconds) => new Promise((resolve) => { window.setTimeout(resolve, milliseconds); });
const waitForCheckoutRetry = async (error) => {
  const retryDelayMs = checkoutRetryDelay(error);
  if (!isNetworkFailure(error) || !isBrowserOffline()) { await wait(retryDelayMs); return { retryDelayMs, waitedForConnectivity: false, connectivityRestored: null }; }
  const startedAt = Date.now(); const connectivity = await waitForOnline({ timeoutMs: OFFLINE_CHECKOUT_RETRY_WAIT_MS });
  return { retryDelayMs: Math.max(0, Date.now() - startedAt), waitedForConnectivity: connectivity.waited, connectivityRestored: connectivity.restored };
};

const checkout = (payload) => {
  const requestKey = checkoutRequestKey(payload); const pending = pendingCheckouts.get(requestKey); if (pending) return pending;
  const idempotencyKey = idempotencyKeyFor(requestKey);
  const postCheckout = (attempt = 0) => appApiClient.post("/commerce/checkout", payload, { headers: { "Idempotency-Key": idempotencyKey } }).catch(async (error) => {
    if (attempt === 0 && shouldAutoRetryCheckout(error)) {
      const retryPlan = await waitForCheckoutRetry(error); const retryAllowed = retryPlan.connectivityRestored !== false;
      trackTelemetry("checkout_transient_retry", { label: retryAllowed ? "Checkout repetido automaticamente após falha transitória" : "Checkout aguardou conexão, mas permaneceu offline", target: String(payload?.event_id || "checkout"), metadata: { payment_method: String(payload?.payment_method || "unknown"), status: Number(error?.status || error?.response?.status || 0), retry_attempt: retryAllowed ? 1 : 0, retry_delay_ms: retryPlan.retryDelayMs, waited_for_connectivity: retryPlan.waitedForConnectivity, connectivity_restored: retryPlan.connectivityRestored, retry_skipped_offline: !retryAllowed } });
      if (!retryAllowed) throw error; return postCheckout(1);
    }
    throw error;
  });
  const request = postCheckout().then(async (response) => { clearAttempt(requestKey); const data = response.data; const order = data?.order; const status = String(order?.status || data?.payment?.status || "").toLowerCase(); if (["paid","approved","completed"].includes(status)) await trackSearchConversion("ticket_purchase", payload?.event_id).catch(() => false); return data; }).catch((error) => { if (!shouldKeepCheckoutAttempt(error)) clearAttempt(requestKey); throw error; }).finally(() => { if (pendingCheckouts.get(requestKey) === request) pendingCheckouts.delete(requestKey); });
  pendingCheckouts.set(requestKey, request); return request;
};

const catalog = (slug, { force = false } = {}) => {
  const key = String(slug || "").trim(); const now = Date.now(); if (force) catalogCache.delete(key); const cached = catalogCache.get(key);
  if (cached?.data && cached.expiresAt > now) return Promise.resolve(cached.data); if (cached?.request) return cached.request;
  const request = appApiClient.get(`/events/public/${key}/commerce`).then((response) => { const data = response.data; catalogCache.set(key, { data, expiresAt: Date.now() + CATALOG_CACHE_TTL_MS }); return data; }).catch((error) => { catalogCache.delete(key); throw error; });
  catalogCache.set(key, { request }); return request;
};
const invalidateCatalogCache = () => catalogCache.clear();

const redeemEventItemsIdempotently = createIdempotentMutation({ storagePrefix: "cutinapp_commerce_item_redemption_attempt_", keyPrefix: "item-redemption", requestKeyFor: (token, eventId) => createMutationRequestKey({ token: String(token || "").trim(), event_id: Number(eventId) }), mutate: async ({ idempotencyKey }, token, eventId) => (await appApiClient.post("/commerce/item-redemptions/redeem", { token: String(token || "").trim(), event_id: Number(eventId) }, { headers: { "Idempotency-Key": idempotencyKey } })).data });
const createEventItem = createIdempotentMutation({ storagePrefix: "cutinapp_event_item_create_attempt_", keyPrefix: "event-item-create", requestKeyFor: (eventId, payload = {}) => `${Number(eventId)}:${createMutationRequestKey(payload)}`, mutate: async ({ idempotencyKey }, eventId, payload = {}) => (await appApiClient.post(`/events/${Number(eventId)}/items`, payload, { headers: { "Idempotency-Key": idempotencyKey } })).data });
const updateEventItemIdempotently = createIdempotentMutation({ storagePrefix: "cutinapp_event_item_update_attempt_", keyPrefix: "event-item-update", requestKeyFor: (eventId, itemId, payload = {}) => `${Number(eventId)}:${Number(itemId)}:${createMutationRequestKey(payload)}`, mutate: async ({ idempotencyKey }, eventId, itemId, payload = {}) => (await appApiClient.patch(`/events/${Number(eventId)}/items/${Number(itemId)}`, payload, { headers: { "Idempotency-Key": idempotencyKey } })).data });
const deleteEventItemIdempotently = createIdempotentMutation({ storagePrefix: "cutinapp_event_item_delete_attempt_", keyPrefix: "event-item-delete", requestKeyFor: (eventId, itemId) => `${Number(eventId)}:${Number(itemId)}`, mutate: async ({ idempotencyKey }, eventId, itemId) => (await appApiClient.delete(`/events/${Number(eventId)}/items/${Number(itemId)}`, { headers: { "Idempotency-Key": idempotencyKey } })).data });
const requestPayoutIdempotently = createIdempotentMutation({ storagePrefix: "cutinapp_commerce_payout_request_attempt_", keyPrefix: "payout-request", requestKeyFor: (organizationId, amount) => `${Number(organizationId)}:${createMutationRequestKey({ amount: Number(amount) })}`, mutate: async ({ idempotencyKey }, organizationId, amount) => (await appApiClient.post(`/organizations/${Number(organizationId)}/payouts`, { amount }, { headers: { "Idempotency-Key": idempotencyKey } })).data });
const cancelPayoutIdempotently = createIdempotentMutation({ storagePrefix: "cutinapp_commerce_payout_cancel_attempt_", keyPrefix: "payout-cancel", requestKeyFor: (organizationId, payoutId) => `${Number(organizationId)}:${Number(payoutId)}`, mutate: async ({ idempotencyKey }, organizationId, payoutId) => (await appApiClient.post(`/organizations/${Number(organizationId)}/payouts/${Number(payoutId)}/cancel`, undefined, { headers: { "Idempotency-Key": idempotencyKey } })).data });
const recoverPendingCheckoutIdempotently = createIdempotentMutation({ storagePrefix: "cutinapp_commerce_checkout_recovery_attempt_", keyPrefix: "checkout-recovery", requestKeyFor: (orderId) => String(Number(orderId)), mutate: async ({ idempotencyKey }, orderId) => (await appApiClient.post("/commerce/checkout/pending/recover", { order_id: Number(orderId) }, { headers: { "Idempotency-Key": idempotencyKey } })).data });
const syncPaymentIdempotently = createIdempotentMutation({ storagePrefix: "cutinapp_commerce_payment_sync_attempt_", keyPrefix: "payment-sync", requestKeyFor: (publicId) => String(publicId || "").trim(), mutate: async ({ idempotencyKey }, publicId) => (await appApiClient.post(`/commerce/orders/${String(publicId || "").trim()}/sync-payment`, undefined, { headers: { "Idempotency-Key": idempotencyKey } })).data.order });
const createCouponIdempotently = createIdempotentMutation({ storagePrefix: "cutinapp_commerce_coupon_create_attempt_", keyPrefix: "coupon-create", requestKeyFor: (organizationId, payload = {}) => `${Number(organizationId)}:${createMutationRequestKey(payload)}`, mutate: async ({ idempotencyKey }, organizationId, payload = {}) => (await appApiClient.post(`/organizations/${Number(organizationId)}/coupons`, payload, { headers: { "Idempotency-Key": idempotencyKey } })).data.coupon });
const updateCouponIdempotently = createIdempotentMutation({ storagePrefix: "cutinapp_commerce_coupon_update_attempt_", keyPrefix: "coupon-update", requestKeyFor: (organizationId, couponId, payload = {}) => `${Number(organizationId)}:${Number(couponId)}:${createMutationRequestKey(payload)}`, mutate: async ({ idempotencyKey }, organizationId, couponId, payload = {}) => (await appApiClient.patch(`/organizations/${Number(organizationId)}/coupons/${Number(couponId)}`, payload, { headers: { "Idempotency-Key": idempotencyKey } })).data.coupon });
const disableCouponIdempotently = createIdempotentMutation({ storagePrefix: "cutinapp_commerce_coupon_disable_attempt_", keyPrefix: "coupon-disable", requestKeyFor: (organizationId, couponId) => `${Number(organizationId)}:${Number(couponId)}`, mutate: async ({ idempotencyKey }, organizationId, couponId) => (await appApiClient.delete(`/organizations/${Number(organizationId)}/coupons/${Number(couponId)}`, { headers: { "Idempotency-Key": idempotencyKey } })).data });
const syncPayment = async (publicId) => {
  const order = await syncPaymentIdempotently(publicId); const recoveryAttribution = readPaymentRecoveryAttribution(order?.public_id || publicId);
  if (order?.status === "paid" && recoveryAttribution) { trackTelemetry("checkout_recovery_paid", { label: "PIX recuperado convertido em pagamento", target: String(order?.event?.slug || order?.event_id || "checkout"), metadata: { event_id: Number(order?.event?.id || order?.event_id || 0), order_public_id: order?.public_id || publicId, recovered_gmv: Number(order?.total || recoveryAttribution.amount || 0), payment_method: String(order?.payment_method || "pix").toLowerCase(), recovery_started_at: new Date(recoveryAttribution.startedAt).toISOString(), outcome: "success" } }); clearPaymentRecoveryAttribution(order?.public_id || publicId); }
  if (String(order?.status || "").toLowerCase() === "paid") await trackSearchConversion("ticket_purchase", Number(order?.event?.id || order?.event_id || 0)).catch(() => false);
  return order;
};

const commerceService = {
  catalog,
  checkout,
  validateCoupon: async (payload = {}) => (await appApiClient.post("/commerce/coupons/validate", payload)).data.coupon,
  producerCoupons: async (organizationId) => (await appApiClient.get(`/organizations/${Number(organizationId)}/coupons`)).data.coupons,
  createCoupon: (organizationId, payload = {}) => createCouponIdempotently(organizationId, payload),
  updateCoupon: (organizationId, couponId, payload = {}) => updateCouponIdempotently(organizationId, couponId, payload),
  disableCoupon: (organizationId, couponId) => disableCouponIdempotently(organizationId, couponId),
  pendingCheckout: async () => (await appApiClient.get("/commerce/checkout/pending")).data,
  recoverPendingCheckout: (orderId) => recoverPendingCheckoutIdempotently(orderId),
  myOrders: async (params = {}) => (await appApiClient.get("/commerce/orders/mine", { params })).data,
  order: async (publicId) => (await appApiClient.get(`/commerce/orders/${publicId}`)).data.order,
  syncPayment,
  pickupCredential: async (publicId) => (await appApiClient.get(`/commerce/orders/${publicId}/pickup-credential`)).data.credential,
  redeemEventItems: (token, eventId) => redeemEventItemsIdempotently(token, eventId),
  purchases: async (params = {}) => (await appApiClient.get("/commerce/purchases", { params })).data,
  purchase: async (publicId) => (await appApiClient.get(`/commerce/purchases/${publicId}`)).data.order,
  receipt: async (publicId) => (await appApiClient.get(`/commerce/purchases/${publicId}/receipt`)).data.receipt,
  receiptPdf: async (publicId) => (await appApiClient.get(`/commerce/purchases/${publicId}/receipt.pdf`, { responseType: "blob" })).data,
  producerSales: async (organizationId, params = {}) => (await appApiClient.get(`/organizations/${organizationId}/sales`, { params })).data,
  producerSale: async (organizationId, publicId) => (await appApiClient.get(`/organizations/${organizationId}/sales/${publicId}`)).data.order,
  saveEventItem: async (eventId, payload, itemId = null) => { const data = itemId ? await updateEventItemIdempotently(eventId, itemId, payload) : await createEventItem(eventId, payload); invalidateCatalogCache(); return data; },
  deleteEventItem: async (eventId, itemId) => { const data = await deleteEventItemIdempotently(eventId, itemId); invalidateCatalogCache(); return data; },
  paymentAccount: async (organizationId) => (await appApiClient.get(`/organizations/${organizationId}/payment-account`)).data.account,
  connectMercadoPago: async (organizationId) => (await appApiClient.get(`/organizations/${organizationId}/payment-provider/connect`)).data,
  financialSummary: async (organizationId) => (await appApiClient.get(`/organizations/${organizationId}/financial-summary`)).data,
  revenueFunnel: async (organizationId, days = 30) => { const boundedDays = Math.min(Math.max(Number(days) || 30, 1), 365); try { return (await appApiClient.get(`/organizations/${organizationId}/revenue-funnel`, { params: { days: boundedDays } })).data; } catch (error) { trackTelemetry("producer_revenue_analytics_unavailable", { label: "Métricas financeiras temporariamente indisponíveis", target: String(organizationId || ""), metadata: { days: boundedDays, status: Number(error?.status || error?.response?.status || 0) || null, network_failure: isNetworkFailure(error) } }); return null; } },
  payoutSummary: async (organizationId) => (await appApiClient.get(`/organizations/${organizationId}/payouts`)).data,
  requestPayout: (organizationId, amount) => requestPayoutIdempotently(organizationId, amount),
  cancelPayout: (organizationId, payoutId) => cancelPayoutIdempotently(organizationId, payoutId),
};

export default commerceService;
