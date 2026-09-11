import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Container } from "react-bootstrap";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import MercadoPagoCardForm from "../../components/payment/MercadoPagoCardForm";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import { AuthContext } from "../../context/AuthContext";
import commerceService from "../../services/CommerceService";
import { clearCheckoutRecovery, readCheckoutRecovery, writeCheckoutRecovery } from "../../utils/checkoutRecovery";
import { copyText } from "../../utils/clipboard";
import { resolveCheckoutPaymentMethod } from "../../utils/paymentMethod";
import { paymentReviewState } from "../../utils/paymentReviewState";
import { paymentFailureGuidance } from "../../utils/paymentFailureGuidance";
import { checkoutQuantityLimit, rankCheckoutAddOns, resolveCheckoutQuantity, summarizeCheckoutAddOnOffer } from "../../utils/checkoutAddOns";
import { checkoutReconciliationMessage, summarizeCheckoutReconciliation } from "../../utils/checkoutReconciliation";
import { getPaymentSyncDelay } from "../../utils/paymentSyncSchedule";
import { isCheckoutInventoryConflict, isCheckoutOperationInProgress } from "../../utils/checkoutRetryPolicy";
import { isPendingPixExpired, latestPaymentFromOrder, pendingPixExpirationState } from "../../utils/orderRecovery";
import { createKeyedSingleFlight } from "../../utils/singleFlight";
import { clearEventCart, readEventCart, writeEventCart } from "../../utils/eventCartStorage";
import { safeGetSessionJson, safeRemoveSessionItem, safeSetSessionJson } from "../../utils/safeStorage";
import "./CheckoutPage.css";

const money = (value) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
const failedStatuses = ["refunded", "charged_back", "rejected", "cancelled"];

const trackCheckout = (type, details = {}) => {
  try { window.PeterTecnetTelemetry?.track?.(type, details); } catch (_) { /* Telemetry must never interrupt checkout. */ }
};

export default function CheckoutPage() {
  const { slug } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const [catalog, setCatalog] = useState(null);
  const [selection, setSelection] = useState(null);
  const [method, setMethod] = useState("pix");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [syncingNow, setSyncingNow] = useState(false);
  const [paymentNow, setPaymentNow] = useState(() => Date.now());
  const [error, setError] = useState("");
  const [pixCopyStatus, setPixCopyStatus] = useState("idle");
  const [couponCode, setCouponCode] = useState("");
  const [coupon, setCoupon] = useState(null);
  const [couponError, setCouponError] = useState("");
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const resultRef = useRef(result);
  const trackedStatusRef = useRef("");
  const checkoutViewedRef = useRef(false);
  const addOnOfferViewedRef = useRef(false);
  const pixReadyTrackedRef = useRef("");
  const paymentSyncGateRef = useRef(createKeyedSingleFlight());
  const paymentSubmissionRef = useRef(false);
  const paymentAttemptedRef = useRef(false);
  const abandonmentTrackedRef = useRef(false);
  const checkoutOpenedAtRef = useRef(Date.now());
  const checkoutContextRef = useRef(null);
  const paymentSectionRef = useRef(null);
  const couponValidationSequenceRef = useRef(0);
  resultRef.current = result;

  const paymentStorageKey = `cutinapp_payment_${slug}`;

  useEffect(() => {
    let active = true;
    const fromState = location.state?.checkout || null;
    const recovery = readCheckoutRecovery(slug);

    if (fromState) {
      writeEventCart(slug, fromState);
      safeRemoveSessionItem(paymentStorageKey);
      writeCheckoutRecovery(slug, { selection: fromState, orderPublicId: null });
      trackCheckout("checkout_fresh_selection_started", { label: "Nova seleção substituiu pagamento anterior da sessão", target: slug, metadata: { event_id: Number(fromState?.eventId || 0), ticket_quantity: (fromState?.tickets || []).reduce((sum, item) => sum + Number(item?.quantity || 0), 0), item_quantity: (fromState?.items || []).reduce((sum, item) => sum + Number(item?.quantity || 0), 0) } });
    }

    let stored = fromState;
    if (!stored) stored = readEventCart(slug);
    if (!stored) stored = recovery?.selection || null;
    setSelection(stored);
    if (!fromState && recovery?.couponCode) setCouponCode(recovery.couponCode);

    let hasSessionPayment = false;
    const storedPayment = fromState ? null : safeGetSessionJson(paymentStorageKey);
    if (storedPayment?.order?.public_id) {
      hasSessionPayment = true;
      setMethod(resolveCheckoutPaymentMethod(storedPayment));
      setResult(storedPayment);
      const storedCouponCode = String(storedPayment?.order?.metadata?.coupon_code || "");
      if (storedCouponCode) {
        setCouponCode(storedCouponCode);
        setCoupon({ code: storedCouponCode, discount_amount: Number(storedPayment?.order?.discount_amount || 0), total: Number(storedPayment?.order?.total || 0), subtotal: Number(storedPayment?.order?.subtotal || 0) });
      }
    }

    if (!fromState && !hasSessionPayment && recovery?.orderPublicId) {
      commerceService.order(recovery.orderPublicId).then((order) => {
        if (!active) return;
        const latestPayment = latestPaymentFromOrder(order);
        setMethod(resolveCheckoutPaymentMethod({ order, payment: latestPayment }));
        setResult({ order, payment: latestPayment });
        const recoveredCode = String(order?.metadata?.coupon_code || "");
        if (recoveredCode) {
          setCouponCode(recoveredCode);
          setCoupon({ code: recoveredCode, discount_amount: Number(order?.discount_amount || 0), total: Number(order?.total || 0), subtotal: Number(order?.subtotal || 0) });
        }
        trackCheckout("checkout_recovered", { label: "Checkout recuperado após reabrir", target: slug, metadata: { order_status: order?.status || "unknown", fulfillment_status: order?.metadata?.fulfillment_status || "pending" } });
      }).catch((err) => { if (err?.status === 403 || err?.status === 404) clearCheckoutRecovery(slug); });
    }

    commerceService.catalog(slug).then(async (response) => {
      if (!active) return;
      setCatalog(response);
      const methods = Array.isArray(response?.payment_config?.methods) ? response.payment_config.methods : [];
      if (methods.length && !methods.includes("pix")) setMethod(methods[0]);

      if (!fromState && !hasSessionPayment && !recovery?.orderPublicId && recovery?.couponCode && stored) {
        try {
          const validated = await commerceService.validateCoupon({
            event_id: Number(response?.event?.id || 0),
            coupon_code: recovery.couponCode,
            tickets: (stored?.tickets || []).map((item) => ({ id: Number(item.id), quantity: Number(item.quantity) })),
            items: (stored?.items || []).map((item) => ({ id: Number(item.id), quantity: Number(item.quantity) })),
          });
          if (!active) return;
          setCoupon(validated);
          setCouponCode(validated.code || recovery.couponCode);
          trackCheckout("coupon_recovered", { label: "Cupom recuperado e revalidado", target: slug, metadata: { event_id: Number(response?.event?.id || 0), coupon_code: validated.code || recovery.couponCode, discount_amount: Number(validated.discount_amount || 0), new_amount: Number(validated.total || 0) } });
        } catch (err) {
          if (!active) return;
          setCoupon(null);
          setCouponError("O cupom usado anteriormente não está mais disponível. Você pode continuar a compra normalmente.");
          writeCheckoutRecovery(slug, { selection: stored, orderPublicId: null });
          trackCheckout("coupon_recovery_failed", { label: "Cupom recuperado não pôde ser revalidado", target: slug, metadata: { event_id: Number(response?.event?.id || 0), status: Number(err?.status || err?.response?.status || 0) } });
        }
      }
    }).catch((err) => active && setError(err?.message || "Não foi possível preparar o checkout.")).finally(() => active && setLoading(false));

    return () => { active = false; };
  }, [slug, location.state, paymentStorageKey]);

  useEffect(() => {
    if (result?.order?.public_id) {
      safeSetSessionJson(paymentStorageKey, result);
      writeCheckoutRecovery(slug, { selection, orderPublicId: result.order.public_id });
    }
  }, [result, paymentStorageKey, selection, slug]);

  const lines = useMemo(() => {
    if (!catalog || !selection) return [];
    const ticketLines = (selection.tickets || []).map((chosen) => {
      const item = (catalog.tickets || []).find((entry) => Number(entry.id) === Number(chosen.id));
      return item ? { ...item, kind: "ticket", quantity: Number(chosen.quantity || 0) } : null;
    }).filter(Boolean);
    const itemLines = (selection.items || []).map((chosen) => {
      const item = (catalog.items || []).find((entry) => Number(entry.id) === Number(chosen.id));
      return item ? { ...item, kind: "item", quantity: Number(chosen.quantity || 0) } : null;
    }).filter(Boolean);
    return [...ticketLines, ...itemLines];
  }, [catalog, selection]);

  const total = useMemo(() => lines.reduce((sum, line) => sum + Number(line.price) * line.quantity, 0), [lines]);
  const discountAmount = coupon ? Math.max(0, Number(coupon.discount_amount || 0)) : 0;
  const payableTotal = coupon ? Math.max(0, Number(coupon.total ?? total - discountAmount)) : total;
  const isFreeOrder = payableTotal <= 0;
  checkoutContextRef.current = { catalog, selection, lines, total: payableTotal, method, result };
  const availableAddOns = useMemo(() => {
    if (!catalog || !selection) return [];
    const selectedIds = new Set((selection.items || []).map((item) => Number(item.id)));
    return rankCheckoutAddOns(catalog.items || [], selectedIds, 3);
  }, [catalog, selection]);

  async function revalidateCouponForSelection(nextSelection, source) {
    const normalized = String(coupon?.code || "").trim().toUpperCase();
    if (!normalized || result || !catalog?.event?.id) return false;

    const validationSequence = ++couponValidationSequenceRef.current;
    setCoupon(null);
    setCouponError("");
    setApplyingCoupon(true);
    writeCheckoutRecovery(slug, { selection: nextSelection, orderPublicId: null, couponCode: normalized });

    try {
      const validated = await commerceService.validateCoupon({
        event_id: Number(catalog.event.id),
        coupon_code: normalized,
        tickets: (nextSelection?.tickets || []).map((item) => ({ id: Number(item.id), quantity: Number(item.quantity) })),
        items: (nextSelection?.items || []).map((item) => ({ id: Number(item.id), quantity: Number(item.quantity) })),
      });
      if (validationSequence !== couponValidationSequenceRef.current) return false;
      const validatedCode = validated.code || normalized;
      setCoupon(validated);
      setCouponCode(validatedCode);
      setCouponError("");
      writeCheckoutRecovery(slug, { selection: nextSelection, orderPublicId: null, couponCode: validatedCode });
      trackCheckout("coupon_revalidated_after_cart_change", { label: "Cupom revalidado após alteração do carrinho", target: slug, metadata: { event_id: Number(catalog.event.id), coupon_code: validatedCode, source, discount_amount: Number(validated.discount_amount || 0), new_amount: Number(validated.total || 0) } });
      return true;
    } catch (err) {
      if (validationSequence !== couponValidationSequenceRef.current) return false;
      setCoupon(null);
      setCouponError("O cupom não é válido para a seleção atual. Você pode continuar a compra normalmente.");
      writeCheckoutRecovery(slug, { selection: nextSelection, orderPublicId: null });
      trackCheckout("coupon_revalidation_failed_after_cart_change", { label: "Cupom deixou de ser válido após alteração do carrinho", target: slug, metadata: { event_id: Number(catalog.event.id), coupon_code: normalized, source, status: Number(err?.status || err?.response?.status || 0) } });
      return false;
    } finally {
      if (validationSequence === couponValidationSequenceRef.current) setApplyingCoupon(false);
    }
  }

  useEffect(() => {
    if (!catalog || !selection || result) return;
    const reconcile = (chosenItems = [], currentItems = [], limit) => chosenItems.map((chosen) => {
      const current = currentItems.find((entry) => Number(entry.id) === Number(chosen.id));
      if (!current || current.available === false || current.expired) return null;
      const quantity = resolveCheckoutQuantity(current, Math.max(1, Number(chosen.quantity || 1)), limit);
      if (quantity <= 0) return null;
      return { id: Number(chosen.id), quantity };
    }).filter(Boolean);

    const tickets = reconcile(selection.tickets || [], catalog.tickets || [], checkoutQuantityLimit("ticket"));
    const items = reconcile(selection.items || [], catalog.items || [], checkoutQuantityLimit("item"));
    const previous = JSON.stringify({ tickets: selection.tickets || [], items: selection.items || [] });
    const nextComparable = JSON.stringify({ tickets, items });
    if (previous === nextComparable) return;

    const nextSelection = { ...selection, tickets, items };
    const reconciliation = summarizeCheckoutReconciliation({ catalog, previousSelection: selection, nextSelection });
    const activeCouponCode = coupon?.code || null;
    setSelection(nextSelection);
    writeEventCart(slug, nextSelection);
    writeCheckoutRecovery(slug, { selection: nextSelection, orderPublicId: null, couponCode: activeCouponCode });
    setError(checkoutReconciliationMessage(reconciliation, money));
    trackCheckout("checkout_selection_reconciled", { label: "Seleção ajustada à disponibilidade atual", target: slug, metadata: { event_id: Number(catalog?.event?.id || 0), previous_ticket_quantity: (selection.tickets || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0), ticket_quantity: tickets.reduce((sum, item) => sum + Number(item.quantity || 0), 0), previous_item_quantity: (selection.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0), item_quantity: items.reduce((sum, item) => sum + Number(item.quantity || 0), 0), changed_lines: reconciliation.changed_lines, previous_gmv: reconciliation.previous_gmv, reconciled_gmv: reconciliation.reconciled_gmv, gmv_removed: reconciliation.gmv_removed, unpriced_removed_lines: reconciliation.unpriced_removed_lines } });
    if (activeCouponCode) revalidateCouponForSelection(nextSelection, "inventory_reconciliation");
  }, [catalog, result, selection, slug]);

  useEffect(() => {
    if (result) return undefined;
    let active = true;

    const refreshCatalog = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const freshCatalog = await commerceService.catalog(slug, { force: true });
        if (active) setCatalog(freshCatalog);
      } catch (_) {
        // Keep the last valid catalog. Submit performs a final inventory validation.
      }
    };

    const timer = window.setInterval(refreshCatalog, 30000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") refreshCatalog();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [result, slug]);

  const paymentAvailable = Boolean(catalog?.payment_config?.available);
  const methods = Array.isArray(catalog?.payment_config?.methods) ? catalog.payment_config.methods : [];
  const pixAvailable = paymentAvailable && methods.includes("pix");
  const cardAvailable = paymentAvailable && methods.includes("card") && Boolean(catalog?.payment_config?.public_key);
  const orderStatus = result?.order?.status || result?.payment?.status;
  const fulfillmentStatus = result?.order?.metadata?.fulfillment_status;
  const approved = orderStatus === "paid";
  const fulfilled = approved && fulfillmentStatus === "completed";
  const failed = failedStatuses.includes(orderStatus);

  useEffect(() => {
    if (!fulfilled) return;
    clearEventCart(slug);
  }, [fulfilled, slug]);
  const pixExpiration = pendingPixExpirationState(result?.order || {}, paymentNow);
  const pixExpired = isPendingPixExpired(result?.order || {}, paymentNow);
  const pixExpiresAtLabel = pixExpiration && !pixExpiration.expired
    ? new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(pixExpiration.expiresAtMs))
    : "";
  const paymentLocked = Boolean(result && !failed && !approved);
  const paymentPending = Boolean(paymentLocked && !pixExpired);
  const paymentReview = paymentReviewState(result || {});
  const paymentUnderReview = paymentPending && paymentReview.underReview;
  const paymentStatusDetail = String(paymentReview.detail || result?.payment?.status_detail || result?.payment?.provider_payload?.status_detail || result?.order?.status_detail || "").trim().toLowerCase();
  const failedPaymentGuidance = paymentFailureGuidance({ payment: result?.payment || {}, method, pixAvailable });

  useEffect(() => {
    if (method !== "pix" || !result?.order?.public_id || approved || failed) return undefined;
    const expiresAt = Date.parse(result?.order?.expires_at || "");
    if (!Number.isFinite(expiresAt)) return undefined;
    const updateNow = () => setPaymentNow(Date.now());
    updateNow();
    const delay = Math.max(0, expiresAt - Date.now());
    const expiryTimer = window.setTimeout(updateNow, Math.min(delay + 25, 2147483647));
    const interval = window.setInterval(updateNow, 15000);
    return () => { window.clearTimeout(expiryTimer); window.clearInterval(interval); };
  }, [approved, failed, method, result?.order?.expires_at, result?.order?.public_id]);

  useEffect(() => {
    if (!catalog?.event?.id || !selection || !lines.length || checkoutViewedRef.current) return;
    checkoutViewedRef.current = true; checkoutOpenedAtRef.current = Date.now();
    trackCheckout("checkout_opened", { label: "Checkout aberto", target: slug, metadata: { event_id: Number(catalog.event.id), amount: Number(total.toFixed(2)), ticket_quantity: lines.filter((line) => line.kind === "ticket").reduce((sum, line) => sum + line.quantity, 0), item_quantity: lines.filter((line) => line.kind === "item").reduce((sum, line) => sum + line.quantity, 0), available_methods: methods } });
  }, [catalog?.event?.id, lines, methods, selection, slug, total]);

  const trackPrePaymentAbandonment = useCallback((reason) => {
    const current = checkoutContextRef.current;
    if (!checkoutViewedRef.current || paymentAttemptedRef.current || abandonmentTrackedRef.current || current?.result || !current?.lines?.length) return;
    abandonmentTrackedRef.current = true;
    trackCheckout("checkout_abandoned_before_payment_attempt", { label: "Checkout abandonado antes da tentativa de pagamento", target: slug, metadata: { event_id: Number(current?.catalog?.event?.id || 0), amount: Number(Number(current?.total || 0).toFixed(2)), payment_method: current?.method || "unknown", ticket_quantity: current.lines.filter((line) => line.kind === "ticket").reduce((sum, line) => sum + Number(line.quantity || 0), 0), item_quantity: current.lines.filter((line) => line.kind === "item").reduce((sum, line) => sum + Number(line.quantity || 0), 0), elapsed_ms: Math.max(0, Date.now() - checkoutOpenedAtRef.current), reason } });
  }, [slug]);

  useEffect(() => { const handlePageHide = () => trackPrePaymentAbandonment("pagehide"); window.addEventListener("pagehide", handlePageHide); return () => window.removeEventListener("pagehide", handlePageHide); }, [trackPrePaymentAbandonment]);
  useEffect(() => {
    if (!availableAddOns.length || result || addOnOfferViewedRef.current) return;
    addOnOfferViewedRef.current = true;
    trackCheckout("checkout_addon_offer_viewed", { label: "Oferta opcional de adicionais exibida", target: slug, metadata: { event_id: Number(catalog?.event?.id || 0), current_amount: Number(total.toFixed(2)), ...summarizeCheckoutAddOnOffer(availableAddOns) } });
  }, [availableAddOns, catalog?.event?.id, result, slug, total]);
  useEffect(() => {
    const publicId = result?.order?.public_id; const pixCode = result?.payment?.qr_code;
    if (method !== "pix" || !publicId || !pixCode || approved || failed || pixReadyTrackedRef.current === publicId) return;
    pixReadyTrackedRef.current = publicId;
    trackCheckout("pix_payment_ready", { label: "PIX pronto para pagamento", target: slug, metadata: { event_id: Number(catalog?.event?.id || 0), amount: Number(result?.order?.total || payableTotal || 0), payment_method: "pix", outcome: "ready" } });
  }, [approved, catalog?.event?.id, failed, method, payableTotal, result?.order?.public_id, result?.order?.total, result?.payment?.qr_code, slug]);
  useEffect(() => {
    if (!result?.order?.public_id || !orderStatus) return;
    const statusKey = `${result.order.public_id}:${orderStatus}:${paymentStatusDetail}:${fulfillmentStatus || ""}`;
    if (trackedStatusRef.current === statusKey) return;
    trackedStatusRef.current = statusKey;
    const type = fulfilled ? "checkout_fulfilled" : approved ? "payment_approved" : failed ? "payment_failed" : paymentUnderReview ? "payment_review_started" : "payment_pending";
    trackCheckout(type, { label: fulfilled ? "Ingresso emitido" : approved ? "Pagamento aprovado" : failed ? "Pagamento não concluído" : paymentUnderReview ? "Pagamento em análise" : "Pagamento aguardando confirmação", target: slug, metadata: { event_id: Number(catalog?.event?.id || 0), amount: Number(result?.order?.total || payableTotal || 0), payment_method: method, order_status: orderStatus, status_detail: paymentStatusDetail || null, fulfillment_status: fulfillmentStatus || "pending", outcome: fulfilled || approved ? "success" : failed ? "error" : paymentUnderReview ? "review" : "pending" } });
  }, [approved, catalog?.event?.id, failed, fulfilled, fulfillmentStatus, method, orderStatus, payableTotal, paymentStatusDetail, paymentUnderReview, result?.order?.public_id, result?.order?.total, slug]);

  const requestPaymentSync = useCallback((publicId) => paymentSyncGateRef.current.run(publicId, () => commerceService.syncPayment(publicId)), []);
  const syncCurrentPayment = async ({ manual = false } = {}) => {
    const publicId = resultRef.current?.order?.public_id; if (!publicId) return null; if (manual) setSyncingNow(true);
    try {
      const order = await requestPaymentSync(publicId); const latestPayment = latestPaymentFromOrder(order) || resultRef.current?.payment;
      setResult((current) => ({ ...current, order, payment: latestPayment || current?.payment })); setError("");
      return order;
    } catch (err) { if (err?.status === 403 || err?.status === 404) { safeRemoveSessionItem(paymentStorageKey); clearCheckoutRecovery(slug); } if (err?.status && err.status !== 429) setError(err?.message || "Não foi possível atualizar o status do pagamento."); return null; }
    finally { if (manual) setSyncingNow(false); }
  };

  useEffect(() => {
    const publicId = result?.order?.public_id; const status = result?.order?.status || result?.payment?.status; const fulfillment = result?.order?.metadata?.fulfillment_status; const terminal = failedStatuses.includes(status) || pixExpired || (status === "paid" && fulfillment === "completed");
    if (!publicId || terminal) return undefined;
    let active = true; let syncing = false; let timer = null; let attempt = 0;
    const scheduleNext = ({ rateLimited = false } = {}) => { if (!active) return; window.clearTimeout(timer); timer = window.setTimeout(() => sync("timer"), getPaymentSyncDelay(attempt, { rateLimited })); };
    const sync = async (source = "timer") => {
      if (!active || syncing || document.visibilityState === "hidden") return;
      syncing = true; const startedAt = Date.now(); const currentAttempt = attempt + 1; let rateLimited = false;
      try {
        const order = await requestPaymentSync(publicId); if (!active) return; const latestPayment = latestPaymentFromOrder(order) || resultRef.current?.payment;
        setResult((current) => ({ ...current, order, payment: latestPayment || current?.payment })); setError("");
        trackCheckout("payment_sync_cycle", { label: "Status de pagamento sincronizado", target: slug, metadata: { source, attempt: currentAttempt, duration_ms: Date.now() - startedAt, order_status: order?.status || "unknown", fulfillment_status: order?.metadata?.fulfillment_status || "pending", outcome: "success" } });
      } catch (err) {
        rateLimited = err?.status === 429; if (err?.status === 403 || err?.status === 404) { safeRemoveSessionItem(paymentStorageKey); clearCheckoutRecovery(slug); active = false; } if (err?.status && err.status !== 429) setError(err?.message || "Não foi possível atualizar o status do pagamento.");
        trackCheckout("payment_sync_cycle", { label: rateLimited ? "Sincronização de pagamento limitada" : "Falha ao sincronizar pagamento", target: slug, metadata: { source, attempt: currentAttempt, duration_ms: Date.now() - startedAt, status: Number(err?.status || 0), outcome: rateLimited ? "rate_limited" : "error" } });
      } finally { attempt += 1; syncing = false; if (active) scheduleNext({ rateLimited }); }
    };
    const syncImmediately = (source) => { if (!active || document.visibilityState === "hidden") return; window.clearTimeout(timer); sync(source); };
    sync("initial"); const handleFocus = () => syncImmediately("focus"); const handleVisibility = () => { if (document.visibilityState === "visible") syncImmediately("visibility"); };
    window.addEventListener("focus", handleFocus); document.addEventListener("visibilitychange", handleVisibility);
    return () => { active = false; window.clearTimeout(timer); window.removeEventListener("focus", handleFocus); document.removeEventListener("visibilitychange", handleVisibility); };
  }, [pixExpired, result?.order?.public_id, result?.order?.status, result?.order?.metadata?.fulfillment_status, paymentStorageKey, requestPaymentSync, slug]);

  const clearAppliedCoupon = () => { if (result) return; setCoupon(null); setCouponError(""); };
  const applyCoupon = async () => {
    const normalized = String(couponCode || "").trim().toUpperCase();
    if (!normalized) { setCoupon(null); setCouponError("Digite o código do cupom."); return; }
    setApplyingCoupon(true); setCouponError("");
    try {
      const validated = await commerceService.validateCoupon({ event_id: Number(catalog?.event?.id || 0), coupon_code: normalized, tickets: (selection?.tickets || []).map((item) => ({ id: Number(item.id), quantity: Number(item.quantity) })), items: (selection?.items || []).map((item) => ({ id: Number(item.id), quantity: Number(item.quantity) })) });
      setCoupon(validated); setCouponCode(validated.code || normalized); setError("");
      writeCheckoutRecovery(slug, { selection, orderPublicId: null, couponCode: validated.code || normalized });
      trackCheckout("coupon_applied", { label: "Cupom promocional aplicado", target: slug, metadata: { event_id: Number(catalog?.event?.id || 0), coupon_code: validated.code || normalized, discount_amount: Number(validated.discount_amount || 0), previous_amount: Number(total.toFixed(2)), new_amount: Number(validated.total || 0) } });
    } catch (err) { setCoupon(null); setCouponError(err?.message || "Cupom inválido ou indisponível."); }
    finally { setApplyingCoupon(false); }
  };

  const addOptionalItem = (item) => {
    if (result || applyingCoupon || !item?.id) return;
    const nextSelection = { ...selection, items: [...(selection?.items || []), { id: Number(item.id), quantity: 1 }] };
    const activeCouponCode = coupon?.code || null;
    setSelection(nextSelection); writeEventCart(slug, nextSelection); writeCheckoutRecovery(slug, { selection: nextSelection, orderPublicId: null, couponCode: activeCouponCode });
    if (activeCouponCode) revalidateCouponForSelection(nextSelection, "addon_added");
    trackCheckout("checkout_addon_added", { label: "Adicional incluído no checkout", target: slug, metadata: { event_id: Number(catalog?.event?.id || 0), item_id: Number(item.id), item_name: item.name || "Item", addon_price: Number(item.price || 0), previous_amount: Number(total.toFixed(2)), new_amount: Number((total + Number(item.price || 0)).toFixed(2)) } });
  };
  const updateLineQuantity = (line, nextQuantity) => {
    if (result || applyingCoupon || !line?.id) return;
    const kind = line.kind === "ticket" ? "ticket" : "item";
    const collectionKey = kind === "ticket" ? "tickets" : "items";
    const limit = checkoutQuantityLimit(kind);
    const quantity = resolveCheckoutQuantity(line, Number(nextQuantity || 0), limit);
    const currentLines = selection?.[collectionKey] || [];
    const nextLines = quantity === 0
      ? currentLines.filter((entry) => Number(entry.id) !== Number(line.id))
      : currentLines.map((entry) => Number(entry.id) === Number(line.id) ? { ...entry, quantity } : entry);
    const nextSelection = { ...selection, [collectionKey]: nextLines };
    const activeCouponCode = coupon?.code || null;

    setSelection(nextSelection);
    writeEventCart(slug, nextSelection);
    writeCheckoutRecovery(slug, { selection: nextSelection, orderPublicId: null, couponCode: activeCouponCode });
    if (activeCouponCode) revalidateCouponForSelection(nextSelection, `${kind}_quantity_changed`);

    trackCheckout("checkout_line_quantity_changed", {
      label: quantity === 0
        ? (kind === "ticket" ? "Ingresso removido do checkout" : "Item removido do checkout")
        : (kind === "ticket" ? "Quantidade de ingresso alterada no checkout" : "Quantidade de item alterada no checkout"),
      target: slug,
      metadata: {
        event_id: Number(catalog?.event?.id || 0),
        item_type: kind,
        item_id: Number(line.id),
        item_name: line.name || (kind === "ticket" ? "Ingresso" : "Item"),
        previous_quantity: Number(line.quantity || 0),
        new_quantity: quantity,
        unit_price: Number(line.price || 0),
        previous_amount: Number(total.toFixed(2)),
        new_amount: Number((total + (quantity - Number(line.quantity || 0)) * Number(line.price || 0)).toFixed(2)),
      },
    });
  };

  const payload = (paymentMethod) => ({ event_id: catalog?.event?.id, payment_method: paymentMethod, coupon_code: coupon?.code || undefined, tickets: (selection?.tickets || []).map((item) => ({ id: Number(item.id), quantity: Number(item.quantity) })), items: (selection?.items || []).map((item) => ({ id: Number(item.id), quantity: Number(item.quantity) })) });
  const ensurePaymentAvailable = (requestedMethod) => { if (paymentAvailable && methods.includes(requestedMethod)) return true; setError(catalog?.payment_config?.message || "As vendas deste evento ainda não estão habilitadas."); return false; };
  const refreshAvailabilityAfterCheckoutConflict = async (err, paymentMethod) => {
    if (!isCheckoutInventoryConflict(err)) return false;
    const status = Number(err?.status || err?.response?.status || 0);
    try {
      const freshCatalog = await commerceService.catalog(slug, { force: true });
      const reconcile = (chosenItems = [], currentItems = [], limit) => chosenItems.map((chosen) => {
        const current = currentItems.find((entry) => Number(entry.id) === Number(chosen.id));
        if (!current || current.available === false || current.expired) return null;
        const quantity = resolveCheckoutQuantity(current, Math.max(1, Number(chosen.quantity || 1)), limit);
        if (quantity <= 0) return null;
        return { id: Number(chosen.id), quantity };
      }).filter(Boolean);
      const nextSelection = {
        ...selection,
        tickets: reconcile(selection?.tickets || [], freshCatalog?.tickets || [], checkoutQuantityLimit("ticket")),
        items: reconcile(selection?.items || [], freshCatalog?.items || [], checkoutQuantityLimit("item")),
      };
      const reconciliation = summarizeCheckoutReconciliation({ catalog: freshCatalog, previousSelection: selection, nextSelection });
      const activeCouponCode = coupon?.code || null;
      setCatalog(freshCatalog);
      setSelection(nextSelection);
      writeEventCart(slug, nextSelection);
      writeCheckoutRecovery(slug, { selection: nextSelection, orderPublicId: null, couponCode: activeCouponCode });
      setCouponError("");
      setError(`${checkoutReconciliationMessage(reconciliation, money)}${activeCouponCode ? " Seu cupom será revalidado automaticamente antes de uma nova tentativa." : " Revise o resumo antes de confirmar novamente."}`);
      trackCheckout("checkout_inventory_conflict_reconciled", { label: "Disponibilidade atualizada após conflito no checkout", target: slug, metadata: { event_id: Number(freshCatalog?.event?.id || catalog?.event?.id || 0), amount: Number(payableTotal.toFixed(2)), payment_method: paymentMethod, status, changed_lines: reconciliation.changed_lines, previous_gmv: reconciliation.previous_gmv, reconciled_gmv: reconciliation.reconciled_gmv, gmv_removed: reconciliation.gmv_removed, coupon_revalidation_requested: Boolean(activeCouponCode) } });
      if (activeCouponCode) await revalidateCouponForSelection(nextSelection, "payment_inventory_conflict");
      return true;
    } catch (_) { return false; }
  };
  const checkoutSubmissionErrorMessage = (err, fallback) => isCheckoutOperationInProgress(err)
    ? "Sua tentativa anterior ainda está sendo processada. Não inicie outra cobrança; tente novamente em instantes para retomar a mesma operação com segurança."
    : (err?.message || fallback);
  const chooseMethod = (nextMethod) => {
    if (nextMethod === method || paying || paymentSubmissionRef.current) return;
    if (paymentLocked) { trackCheckout("payment_method_change_blocked", { label: "Troca de método bloqueada enquanto a tentativa anterior precisa ser confirmada", target: slug, metadata: { event_id: Number(catalog?.event?.id || 0), amount: Number(result?.order?.total || payableTotal || 0), previous_payment_method: method, requested_payment_method: nextMethod, order_status: orderStatus || "pending", reason: pixExpired ? "pix_expired_requires_status_check" : paymentUnderReview ? "payment_under_review" : "payment_pending" } }); setError(pixExpired ? "Este PIX expirou. Confirme o status desta compra antes de escolher outra forma de pagamento." : paymentUnderReview ? "Seu pagamento está em análise de segurança. Não inicie outra cobrança; aguarde a decisão ou verifique o status desta mesma compra." : "Há um pagamento em andamento para esta compra. Aguarde a confirmação ou verifique o status antes de escolher outra forma de pagamento."); return; }
    setMethod(nextMethod); trackCheckout("payment_method_selected", { label: nextMethod === "pix" ? "PIX selecionado" : "Cartão selecionado", target: slug, metadata: { event_id: Number(catalog?.event?.id || 0), amount: Number(payableTotal.toFixed(2)), payment_method: nextMethod } });
    if (!approved) { setResult(null); safeRemoveSessionItem(paymentStorageKey); writeCheckoutRecovery(slug, { selection, orderPublicId: null, couponCode: coupon?.code || null }); }
  };
  const checkoutFree = async () => {
    if (paymentSubmissionRef.current || paying || applyingCoupon || !isFreeOrder) return;
    paymentSubmissionRef.current = true; paymentAttemptedRef.current = true;
    setMethod("free");
    setPaying(true); setError("");
    try {
      const checkoutResult = await commerceService.checkout(payload("free"));
      setResult(checkoutResult);
      safeSetSessionJson(paymentStorageKey, checkoutResult);
      trackCheckout("free_order_completed", { label: "Pedido gratuito concluído", target: slug, metadata: { event_id: Number(catalog?.event?.id || 0), order_public_id: checkoutResult?.order?.public_id || null, outcome: "success" } });
    } catch (err) {
      const reconciled = await refreshAvailabilityAfterCheckoutConflict(err, "free");
      if (!reconciled) setError(checkoutSubmissionErrorMessage(err, "Não foi possível concluir o pedido gratuito."));
    } finally {
      paymentSubmissionRef.current = false;
      setPaying(false);
    }
  };
  const checkoutPix = async () => {
    if (paymentSubmissionRef.current || paying || applyingCoupon || !ensurePaymentAvailable("pix")) return;
    paymentSubmissionRef.current = true; paymentAttemptedRef.current = true;
    trackCheckout("payment_attempted", { label: "PIX solicitado", target: slug, metadata: { event_id: Number(catalog?.event?.id || 0), amount: Number(payableTotal.toFixed(2)), discount_amount: discountAmount, coupon_code: coupon?.code || null, payment_method: "pix", checkout_elapsed_ms: Math.max(0, Date.now() - checkoutOpenedAtRef.current) } });
    setPaying(true); setError("");
    try { const checkoutResult = await commerceService.checkout(payload("pix")); setResult(checkoutResult); safeSetSessionJson(paymentStorageKey, checkoutResult); }
    catch (err) { const reconciled = await refreshAvailabilityAfterCheckoutConflict(err, "pix"); trackCheckout("payment_attempt_failed", { label: "Falha ao iniciar PIX", target: slug, metadata: { event_id: Number(catalog?.event?.id || 0), amount: Number(payableTotal.toFixed(2)), payment_method: "pix", outcome: "error", status: Number(err?.status || err?.response?.status || 0), inventory_reconciled: reconciled } }); if (!reconciled) setError(checkoutSubmissionErrorMessage(err, "Não foi possível gerar o PIX.")); }
    finally { paymentSubmissionRef.current = false; setPaying(false); }
  };
  const checkoutCard = async (cardData) => {
    if (paymentSubmissionRef.current || paying || applyingCoupon || !ensurePaymentAvailable("card")) return;
    paymentSubmissionRef.current = true; paymentAttemptedRef.current = true;
    trackCheckout("payment_attempted", { label: "Pagamento com cartão enviado", target: slug, metadata: { event_id: Number(catalog?.event?.id || 0), amount: Number(payableTotal.toFixed(2)), discount_amount: discountAmount, coupon_code: coupon?.code || null, payment_method: "card", checkout_elapsed_ms: Math.max(0, Date.now() - checkoutOpenedAtRef.current) } });
    setPaying(true); setError("");
    try { const checkoutResult = await commerceService.checkout({ ...payload("card"), ...cardData }); setResult(checkoutResult); safeSetSessionJson(paymentStorageKey, checkoutResult); }
    catch (err) { const reconciled = await refreshAvailabilityAfterCheckoutConflict(err, "card"); trackCheckout("payment_attempt_failed", { label: "Falha ao processar cartão", target: slug, metadata: { event_id: Number(catalog?.event?.id || 0), amount: Number(payableTotal.toFixed(2)), payment_method: "card", outcome: "error", status: Number(err?.status || err?.response?.status || 0), inventory_reconciled: reconciled } }); if (!reconciled) setError(checkoutSubmissionErrorMessage(err, "Não foi possível processar o cartão.")); }
    finally { paymentSubmissionRef.current = false; setPaying(false); }
  };
  const recoverFailedPayment = (nextMethod = method) => { trackCheckout("payment_recovery_selected", { label: nextMethod === method ? "Tentar pagamento novamente" : `Trocar para ${nextMethod === "pix" ? "PIX" : "cartão"}`, target: slug, metadata: { event_id: Number(catalog?.event?.id || 0), amount: Number(result?.order?.total || payableTotal || 0), previous_payment_method: method, payment_method: nextMethod, previous_status: orderStatus || "failed", failure_reason: failedPaymentGuidance.reason } }); setMethod(nextMethod); setResult(null); setError(""); safeRemoveSessionItem(paymentStorageKey); writeCheckoutRecovery(slug, { selection, orderPublicId: null, couponCode: coupon?.code || null }); };
  const restartExpiredPix = async () => {
    if (!pixExpired || syncingNow) return;
    trackCheckout("pix_expired_recovery_started", { label: "Recuperação de PIX expirado iniciada", target: slug, metadata: { event_id: Number(catalog?.event?.id || 0), amount: Number(result?.order?.total || payableTotal || 0), payment_method: "pix" } });
    const refreshedOrder = await syncCurrentPayment({ manual: true });
    if (!refreshedOrder) return;
    if (String(refreshedOrder?.status || "").toLowerCase() === "paid") return;
    if (!isPendingPixExpired(refreshedOrder, Date.now())) return;
    setResult(null); setError(""); setPixCopyStatus("idle");
    safeRemoveSessionItem(paymentStorageKey);
    writeCheckoutRecovery(slug, { selection, orderPublicId: null, couponCode: coupon?.code || null });
    trackCheckout("pix_expired_recovery_ready", { label: "Novo PIX liberado após confirmação do vencimento", target: slug, metadata: { event_id: Number(catalog?.event?.id || 0), amount: Number(refreshedOrder?.total || payableTotal || 0), payment_method: "pix", outcome: "ready" } });
  };
  const copyPix = async () => {
    const pixCode = result?.payment?.qr_code; if (!pixCode) return; const copied = await copyText(pixCode);
    if (!copied) { setPixCopyStatus("error"); setError("Não foi possível copiar automaticamente neste navegador. Toque e segure o código PIX exibido nesta tela para selecionar e copiar."); trackCheckout("pix_code_copy_failed", { label: "Falha ao copiar código PIX", target: slug, metadata: { event_id: Number(catalog?.event?.id || 0), amount: Number(result?.order?.total || payableTotal || 0), payment_method: "pix", outcome: "error" } }); return; }
    setPixCopyStatus("copied"); setError(""); trackCheckout("pix_code_copied", { label: "Código PIX copiado", target: slug, metadata: { event_id: Number(catalog?.event?.id || 0), amount: Number(result?.order?.total || payableTotal || 0), payment_method: "pix", outcome: "success" } }); window.setTimeout(() => setPixCopyStatus("idle"), 2500);
  };

  const focusPaymentSection = () => {
    trackCheckout("checkout_mobile_payment_cta_clicked", { label: method === "pix" ? "Atalho mobile para PIX" : "Atalho mobile para cartão", target: slug, metadata: { event_id: Number(catalog?.event?.id || 0), amount: Number(payableTotal.toFixed(2)), payment_method: method } });
    paymentSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => paymentSectionRef.current?.querySelector("button:not([disabled]), input:not([disabled])")?.focus({ preventScroll: true }), 350);
  };

  if (loading) return <ProcessingIndicatorComponent label="Preparando checkout seguro" />;
  if (!selection || !lines.length) return <div className="cut-checkout-page"><Container className="cut-checkout-container"><Alert variant="warning">Sua seleção de compra não foi encontrada.</Alert><Button onClick={() => navigate(`/event/${slug}`)}>Voltar ao evento</Button></Container></div>;

  return <div className="cut-checkout-page" data-telemetry-screen="Checkout">
    <header className="cut-checkout-topbar"><Container className="cut-checkout-topbar__inner"><Link to={`/event/${slug}`} className="cut-checkout-back" onClick={() => trackPrePaymentAbandonment("back_to_event")}><i className="fa-solid fa-arrow-left" /> Voltar ao evento</Link><div className="cut-checkout-brand"><span className="cut-checkout-brand__mark">C</span><div><strong>Cutinapp</strong><small>Checkout seguro</small></div></div><div className="cut-checkout-secure"><i className="fa-solid fa-lock" /> Ambiente protegido</div></Container></header>
    <Container className="cut-checkout-container">
      <div className="cut-checkout-heading"><span>Finalizar pedido</span><h1>{catalog?.event?.title || "Seu pedido"}</h1><p>{isFreeOrder ? "Revise seu pedido gratuito. Nenhuma forma de pagamento será necessária." : "Revise seu pedido e escolha uma forma de pagamento."}</p></div>
      <div className="cut-checkout-layout"><main className="cut-checkout-main">
        {error && <Alert variant="danger">{error}</Alert>}
        {!paymentAvailable && !result && !isFreeOrder && <Alert variant="warning">{catalog?.payment_config?.message || "As vendas deste evento ainda não estão habilitadas. Tente novamente mais tarde."}</Alert>}
        {fulfilled ? <section className="cut-checkout-success"><div className="cut-checkout-success__icon"><i className="fa-solid fa-check" /></div><span>{Number(result.order?.total || 0) <= 0 ? "Pedido confirmado" : "Pagamento aprovado"}</span><h2>Compra confirmada!</h2><p>{Number(result.order?.total || 0) <= 0 ? "Seu pedido gratuito foi concluído e seus ingressos já estão liberados." : "Seu pagamento foi reconhecido e seus ingressos já estão liberados."}</p><div className="cut-checkout-receipt"><div><span>Pedido</span><strong>#{result.order?.id}</strong></div><div><span>Total pago</span><strong>{money(result.order?.total)}</strong></div></div>{Number(result.order?.discount_amount || 0) > 0 && <Alert variant="success" className="mt-3 mb-3"><i className="fa-solid fa-tag me-2" />Cupom {result.order?.metadata?.coupon_code}: você economizou <strong>{money(result.order?.discount_amount)}</strong>.</Alert>}{(result.order?.items || []).map((item) => <div className="cut-checkout-purchased" key={item.id}><div><small>{item.type === "ticket" ? "INGRESSO" : "ITEM"}</small><strong>{item.name}</strong><span>{item.quantity} × {money(item.unit_price)}</span></div><i className="fa-solid fa-circle-check" /></div>)}<Button as={Link} to="/passes" className="cut-checkout-primary mt-3">Ver meus ingressos</Button></section> : <>
          {!isFreeOrder && <section className="cut-checkout-section" data-telemetry-context="Forma de pagamento"><div className="cut-checkout-section__head"><div className="cut-checkout-step">1</div><div><h2>Forma de pagamento</h2><p>{pixExpired ? "Este PIX expirou. Confirme o status desta compra para liberar uma nova tentativa com segurança." : paymentUnderReview ? "Seu pagamento está em análise de segurança. Esta forma de pagamento fica bloqueada até a decisão para evitar uma cobrança duplicada." : paymentPending ? "Há um pagamento em andamento. A forma de pagamento fica protegida até a confirmação ou falha desta tentativa." : "Escolha como deseja pagar."}</p></div></div><div className="cut-payment-methods">{pixAvailable && <button type="button" data-track="Selecionar PIX" className={method === "pix" ? "is-active" : ""} onClick={() => chooseMethod("pix")} disabled={paymentLocked && method !== "pix"} aria-disabled={paymentLocked && method !== "pix"}><i className="fa-brands fa-pix" /><div><strong>PIX</strong><span>Aprovação rápida</span></div><i className="fa-solid fa-circle-check" /></button>}{cardAvailable && <button type="button" data-track="Selecionar cartão" className={method === "card" ? "is-active" : ""} onClick={() => chooseMethod("card")} disabled={paymentLocked && method !== "card"} aria-disabled={paymentLocked && method !== "card"}><i className="fa-regular fa-credit-card" /><div><strong>Cartão de crédito</strong><span>Pagamento protegido</span></div><i className="fa-solid fa-circle-check" /></button>}</div></section>}
          {!result && availableAddOns.length > 0 && <section className="cut-checkout-section cut-checkout-addons" data-telemetry-context="Adicionais opcionais"><div className="cut-checkout-section__head"><div className="cut-checkout-step"><i className="fa-solid fa-plus" /></div><div><h2>Complete sua experiência</h2><p>Itens opcionais do evento. Adicione somente se fizer sentido para você.</p></div></div><div className="cut-checkout-addons__grid">{availableAddOns.map((item) => <div className="cut-checkout-addon" key={item.id}><div><small>Opcional</small><strong>{item.name}</strong><span>{money(item.price)}</span></div><Button type="button" variant="outline-light" onClick={() => addOptionalItem(item)} disabled={applyingCoupon} aria-label={`Adicionar ${item.name} por ${money(item.price)}`}><i className="fa-solid fa-plus me-2" />Adicionar</Button></div>)}</div></section>}
          {!result && <section className="cut-checkout-section cut-checkout-coupon" data-telemetry-context="Cupom promocional"><div className="cut-checkout-section__head"><div className="cut-checkout-step"><i className="fa-solid fa-tag" /></div><div><h2>Cupom de desconto</h2><p>Tem um código promocional do produtor? Aplique antes de pagar.</p></div></div><div className="cut-coupon-form"><input type="text" value={couponCode} onChange={(event) => { setCouponCode(event.target.value.toUpperCase()); if (coupon) clearAppliedCoupon(); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); applyCoupon(); } }} placeholder="EX.: CUTVIP20" maxLength={40} autoComplete="off" aria-label="Código do cupom" /><Button type="button" className="cut-checkout-primary" onClick={applyCoupon} disabled={applyingCoupon || !couponCode.trim()}>{applyingCoupon ? "Validando..." : coupon ? "Reaplicar" : "Aplicar cupom"}</Button></div>{couponError && <div className="cut-coupon-message is-error"><i className="fa-solid fa-circle-exclamation" />{couponError}</div>}{coupon && <div className="cut-coupon-message is-success"><i className="fa-solid fa-circle-check" /><span><strong>{coupon.code}</strong> aplicado. Você economiza {money(discountAmount)}.</span><button type="button" onClick={() => { setCoupon(null); setCouponCode(""); setCouponError(""); writeCheckoutRecovery(slug, { selection, orderPublicId: null }); }}>Remover</button></div>}</section>}
          <section ref={paymentSectionRef} className="cut-checkout-section" data-telemetry-context="Pagamento"><div className="cut-checkout-section__head"><div className="cut-checkout-step">2</div><div><h2>Pagamento</h2><p>Seus dados são processados em ambiente seguro.</p></div></div>{!result && <div className="cut-payment-total"><span>{coupon ? "Total com desconto" : "Total a pagar"}</span><strong>{money(payableTotal)}</strong></div>}{!result && isFreeOrder && <div className="cut-pix-start"><div className="cut-pix-start__icon"><i className="fa-solid fa-ticket" /></div><h3>Pedido gratuito</h3><p>Este ingresso custa R$ 0,00 e será emitido como qualquer outro ingresso, com QR Code e check-in normal, sem passar pelo gateway de pagamento.</p><Button data-track="Finalizar pedido gratuito" className="cut-checkout-primary" onClick={checkoutFree} disabled={paying || applyingCoupon}>{paying ? "Emitindo ingresso..." : "Finalizar pedido gratuito"}</Button></div>}{!result && method === "pix" && pixAvailable && <div className="cut-pix-start"><div className="cut-pix-start__icon"><i className="fa-brands fa-pix" /></div><h3>Pagamento via PIX</h3><p>Geraremos um QR Code exclusivo para esta compra. A confirmação aparecerá automaticamente nesta tela.</p><Button data-track="Gerar PIX" className="cut-checkout-primary" onClick={checkoutPix} disabled={paying || applyingCoupon}>{applyingCoupon ? "Revalidando cupom..." : paying ? "Gerando PIX seguro..." : "Gerar QR Code PIX"}</Button></div>}{!result && method === "card" && cardAvailable && <MercadoPagoCardForm publicKey={catalog?.payment_config?.public_key || ""} amount={payableTotal} email={user?.email || ""} disabled={paying || applyingCoupon} onSubmit={checkoutCard} />}{approved && !fulfilled && <div className="cut-payment-waiting"><div className="cut-payment-waiting__pulse"><i className="fa-solid fa-ticket" /></div><h3>Pagamento confirmado</h3><p>O dinheiro já foi reconhecido. Estamos finalizando a emissão do seu ingresso. Você não precisa pagar novamente.</p><Button className="cut-checkout-primary w-100" onClick={() => syncCurrentPayment({ manual: true })} disabled={syncingNow}>{syncingNow ? "Verificando..." : "Verificar emissão agora"}</Button><div className="cut-checkout-live"><span /><strong>Recuperação automática ativa</strong></div></div>}{pixExpired && <Alert variant="warning" className="mb-0" role="status" aria-live="polite"><strong>Este PIX expirou.</strong><div className="mt-1">Para proteger você contra cobrança duplicada, vamos confirmar o status desta mesma compra antes de liberar um novo QR Code.</div><Button className="cut-checkout-primary w-100 mt-3" onClick={restartExpiredPix} disabled={syncingNow}>{syncingNow ? "Confirmando pagamento anterior..." : "Gerar novo PIX com segurança"}</Button></Alert>}{result && !failed && !approved && !pixExpired && <div className="cut-payment-waiting"><div className="cut-payment-waiting__pulse"><i className="fa-solid fa-shield-halved" /></div><h3>{paymentUnderReview ? "Pagamento em análise" : "Aguardando confirmação"}</h3><p>{paymentUnderReview ? "Seu pagamento já foi enviado e está passando por uma análise de segurança. Não faça uma nova cobrança. Atualizaremos esta mesma compra automaticamente assim que houver uma decisão." : <>Assim que o Mercado Pago confirmar o pagamento, esta página será atualizada automaticamente. {method === "pix" ? "Se você já pagou, não gere outro PIX." : "Se você já enviou o pagamento, não envie novamente."}</>}</p>{method === "pix" && result.payment?.qr_code && <div className="cut-pix-mobile-first">{pixExpiresAtLabel && <><div className="cut-pix-amount" role="status" aria-live="polite" aria-label={`PIX válido até ${pixExpiresAtLabel}`}><span>PIX válido até</span><strong>{pixExpiresAtLabel}</strong></div><small className="text-start text-secondary">Depois desse horário, gere um novo código nesta mesma compra. Não é necessário refazer o pedido.</small></>}<div className="cut-pix-amount"><span>Valor do PIX</span><strong>{money(result?.order?.total || payableTotal)}</strong></div><p className="cut-pix-mobile-hint"><i className="fa-solid fa-mobile-screen-button" /> No celular, copie o código e pague no app do seu banco.</p><Button className="cut-checkout-primary w-100" onClick={copyPix} aria-live="polite"><i className={`fa-regular ${pixCopyStatus === "copied" ? "fa-circle-check" : "fa-copy"} me-2`} />{pixCopyStatus === "copied" ? "Código PIX copiado" : pixCopyStatus === "error" ? "Tentar copiar código PIX" : "Copiar código PIX"}</Button></div>}{method === "pix" && result.payment?.qr_code_image && <div className="cut-pix-qr"><img src={result.payment.qr_code_image} alt="QR Code PIX" /></div>}{method === "pix" && result.payment?.qr_code && <div className="cut-pix-code">{result.payment.qr_code}</div>}<Button className="cut-checkout-primary w-100 mt-3" onClick={() => syncCurrentPayment({ manual: true })} disabled={syncingNow}>{syncingNow ? "Verificando pagamento..." : paymentUnderReview ? "Verificar análise agora" : "Já paguei — verificar agora"}</Button><div className="cut-checkout-live"><span /><strong>{paymentUnderReview ? "Análise protegida — confirmação automática ativa" : "Confirmação automática ativa"}</strong></div></div>}{failed && <Alert variant="danger" className="mb-0" role="alert" aria-live="assertive"><strong>{failedPaymentGuidance.title}</strong><div>{failedPaymentGuidance.message}</div><div className="d-grid gap-2 mt-3">{failedPaymentGuidance.statusCheckOnly ? <Button variant="light" onClick={() => { trackCheckout("duplicate_payment_status_check", { label: "Status verificado após recusa por duplicidade", target: slug, metadata: { event_id: Number(catalog?.event?.id || 0), amount: Number(result?.order?.total || payableTotal || 0), payment_method: method, previous_status: orderStatus || "rejected" } }); syncCurrentPayment({ manual: true }); }} disabled={syncingNow}>{syncingNow ? "Verificando status..." : "Verificar status da compra"}</Button> : <>{method === "card" && pixAvailable && <Button variant="light" onClick={() => recoverFailedPayment("pix")}><i className="fa-brands fa-pix me-2" />Pagar esta compra com PIX</Button>}<Button variant="outline-light" onClick={() => recoverFailedPayment(method)}>{method === "card" && failedPaymentGuidance.retryAllowed === false ? "Usar outro cartão" : `Tentar novamente com ${method === "pix" ? "PIX" : "cartão"}`}</Button>{method === "pix" && cardAvailable && <Button variant="light" onClick={() => recoverFailedPayment("card")}><i className="fa-regular fa-credit-card me-2" />Tentar com cartão</Button>}</>}</div></Alert>}</section>
        </>}
        <div className="cut-checkout-trustbar"><div><i className="fa-solid fa-lock" /><span><strong>Conexão segura</strong>Dados criptografados</span></div><div><i className="fa-solid fa-shield-halved" /><span><strong>Mercado Pago </strong>Processamento protegido</span></div><div><i className="fa-solid fa-ticket" /><span><strong>Liberação automática</strong>Ingresso após aprovação</span></div></div>
      </main><aside className="cut-checkout-summary"><span className="cut-eyebrow">Resumo do pedido</span><h2>Sua compra</h2><div className="cut-checkout-summary__event"><i className="fa-regular fa-calendar-check" /><div><strong>{catalog?.event?.title}</strong><span>Compra pela Cutinapp</span></div></div><div className="cut-checkout-summary__lines">{lines.map((line) => <div key={`${line.kind}-${line.id}`}><div><small>{line.kind === "ticket" ? "Ingresso" : "Item"}</small><strong>{line.name}</strong>{!result ? <div className="cut-checkout-line-controls" aria-label={`Quantidade de ${line.name}`}><Button type="button" variant="outline-light" size="sm" onClick={() => updateLineQuantity(line, line.quantity - 1)} disabled={applyingCoupon} aria-label={`Diminuir quantidade de ${line.name}`}><i className="fa-solid fa-minus" /></Button><span aria-live="polite">{line.quantity}</span><Button type="button" variant="outline-light" size="sm" onClick={() => updateLineQuantity(line, line.quantity + 1)} disabled={applyingCoupon || line.quantity >= resolveCheckoutQuantity(line, checkoutQuantityLimit(line.kind), checkoutQuantityLimit(line.kind))} aria-label={`Aumentar quantidade de ${line.name}`}><i className="fa-solid fa-plus" /></Button><Button type="button" variant="link" size="sm" className="cut-checkout-line-remove" onClick={() => updateLineQuantity(line, 0)} disabled={applyingCoupon} aria-label={`Remover ${line.name} do carrinho`}><i className="fa-regular fa-trash-can" /></Button></div> : <span>Qtd. {line.quantity}</span>}</div><strong>{money(Number(line.price) * line.quantity)}</strong></div>)}</div>{coupon && !result && <div className="cut-checkout-summary__discount"><span><i className="fa-solid fa-tag" /> Cupom {coupon.code}</span><strong>- {money(discountAmount)}</strong></div>}<div className="cut-checkout-summary__total"><span>Total</span><strong>{money(result?.order?.total ?? payableTotal)}</strong></div><div className="cut-checkout-summary__security"><i className="fa-solid fa-shield-halved" /><span>{isFreeOrder ? "Pedido gratuito sem cobrança, com emissão normal do ingresso." : "Pagamento processado com segurança pelo Mercado Pago."}</span></div></aside></div>
    </Container>
    {!result && paymentAvailable && payableTotal > 0 && <div className="cut-checkout-mobile-paybar" role="region" aria-label="Atalho para pagamento"><div><small>{method === "pix" ? "PIX selecionado" : "Cartão selecionado"}</small><strong>{money(payableTotal)}</strong></div><Button type="button" className="cut-checkout-primary" onClick={focusPaymentSection} disabled={paying || applyingCoupon}>{applyingCoupon ? "Atualizando total..." : method === "pix" ? "Continuar com PIX" : "Ir para cartão"}</Button></div>}
  </div>;
}