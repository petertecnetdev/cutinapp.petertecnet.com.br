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
import { paymentFailureGuidance } from "../../utils/paymentFailureGuidance";
import { rankCheckoutAddOns, resolveCheckoutQuantity, summarizeCheckoutAddOnOffer } from "../../utils/checkoutAddOns";
import { getPaymentSyncDelay } from "../../utils/paymentSyncSchedule";
import { createKeyedSingleFlight } from "../../utils/singleFlight";
import { safeGetSessionJson, safeRemoveSessionItem, safeSetSessionJson } from "../../utils/safeStorage";
import "./CheckoutPage.css";

const money = (value) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
const failedStatuses = ["refunded", "charged_back", "rejected", "cancelled"];

const trackCheckout = (type, details = {}) => {
  try {
    window.PeterTecnetTelemetry?.track?.(type, details);
  } catch (_) {
    // Telemetry must never interrupt checkout.
  }
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
  const [error, setError] = useState("");
  const [pixCopyStatus, setPixCopyStatus] = useState("idle");
  const resultRef = useRef(result);
  const trackedStatusRef = useRef("");
  const checkoutViewedRef = useRef(false);
  const addOnOfferViewedRef = useRef(false);
  const pixReadyTrackedRef = useRef("");
  const paymentSyncGateRef = useRef(createKeyedSingleFlight());
  resultRef.current = result;

  const checkoutStorageKey = `cutinapp_checkout_${slug}`;
  const paymentStorageKey = `cutinapp_payment_${slug}`;

  useEffect(() => {
    let active = true;
    const fromState = location.state?.checkout || null;
    const recovery = readCheckoutRecovery(slug);

    if (fromState) {
      safeSetSessionJson(checkoutStorageKey, fromState);
      safeRemoveSessionItem(paymentStorageKey);
      writeCheckoutRecovery(slug, { selection: fromState, orderPublicId: null });
      trackCheckout("checkout_fresh_selection_started", {
        label: "Nova seleção substituiu pagamento anterior da sessão",
        target: slug,
        metadata: {
          event_id: Number(fromState?.eventId || 0),
          ticket_quantity: (fromState?.tickets || []).reduce((sum, item) => sum + Number(item?.quantity || 0), 0),
          item_quantity: (fromState?.items || []).reduce((sum, item) => sum + Number(item?.quantity || 0), 0),
        },
      });
    }

    let stored = fromState;
    if (!stored) {
      stored = safeGetSessionJson(checkoutStorageKey);
    }
    if (!stored) stored = recovery?.selection || null;
    setSelection(stored);

    let hasSessionPayment = false;
    const storedPayment = fromState ? null : safeGetSessionJson(paymentStorageKey);
    if (storedPayment?.order?.public_id) {
      hasSessionPayment = true;
      setMethod(resolveCheckoutPaymentMethod(storedPayment));
      setResult(storedPayment);
    }

    if (!fromState && !hasSessionPayment && recovery?.orderPublicId) {
      commerceService.order(recovery.orderPublicId)
        .then((order) => {
          if (!active) return;
          const payments = Array.isArray(order?.payments) ? order.payments : [];
          const latestPayment = payments.length ? payments[payments.length - 1] : null;
          setMethod(resolveCheckoutPaymentMethod({ order, payment: latestPayment }));
          setResult({ order, payment: latestPayment });
          trackCheckout("checkout_recovered", {
            label: "Checkout recuperado após reabrir",
            target: slug,
            metadata: {
              order_status: order?.status || "unknown",
              fulfillment_status: order?.metadata?.fulfillment_status || "pending",
            },
          });
        })
        .catch((err) => {
          if (err?.status === 403 || err?.status === 404) clearCheckoutRecovery(slug);
        });
    }

    commerceService.catalog(slug)
      .then((response) => {
        if (!active) return;
        setCatalog(response);
        const methods = Array.isArray(response?.payment_config?.methods) ? response.payment_config.methods : [];
        if (methods.length && !methods.includes("pix")) setMethod(methods[0]);
      })
      .catch((err) => active && setError(err?.message || "Não foi possível preparar o checkout."))
      .finally(() => active && setLoading(false));

    return () => { active = false; };
  }, [slug, location.state, checkoutStorageKey, paymentStorageKey]);

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
  const availableAddOns = useMemo(() => {
    if (!catalog || !selection) return [];
    const selectedIds = new Set((selection.items || []).map((item) => Number(item.id)));
    return rankCheckoutAddOns(catalog.items || [], selectedIds, 3);
  }, [catalog, selection]);
  useEffect(() => {
    if (!catalog || !selection || result) return;

    const reconcile = (chosenItems = [], currentItems = [], limit = 20) => chosenItems
      .map((chosen) => {
        const current = currentItems.find((entry) => Number(entry.id) === Number(chosen.id));
        if (!current || current.available === false || current.expired) return null;
        const quantity = resolveCheckoutQuantity(current, Math.max(1, Number(chosen.quantity || 1)), limit);
        if (quantity <= 0) return null;
        return { id: Number(chosen.id), quantity };
      })
      .filter(Boolean);

    const tickets = reconcile(selection.tickets || [], catalog.tickets || [], 20);
    const items = reconcile(selection.items || [], catalog.items || [], 10);
    const previous = JSON.stringify({ tickets: selection.tickets || [], items: selection.items || [] });
    const nextComparable = JSON.stringify({ tickets, items });
    if (previous === nextComparable) return;

    const nextSelection = { ...selection, tickets, items };
    setSelection(nextSelection);
    safeSetSessionJson(checkoutStorageKey, nextSelection);
    writeCheckoutRecovery(slug, { selection: nextSelection, orderPublicId: null });
    setError("Sua seleção foi atualizada para a disponibilidade atual do evento. Revise o resumo antes de pagar.");
    trackCheckout("checkout_selection_reconciled", {
      label: "Seleção ajustada à disponibilidade atual",
      target: slug,
      metadata: {
        event_id: Number(catalog?.event?.id || 0),
        previous_ticket_quantity: (selection.tickets || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0),
        ticket_quantity: tickets.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
        previous_item_quantity: (selection.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0),
        item_quantity: items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
      },
    });
  }, [catalog, checkoutStorageKey, result, selection, slug]);

  const paymentAvailable = Boolean(catalog?.payment_config?.available);
  const methods = Array.isArray(catalog?.payment_config?.methods) ? catalog.payment_config.methods : [];
  const pixAvailable = paymentAvailable && methods.includes("pix");
  const cardAvailable = paymentAvailable && methods.includes("card") && Boolean(catalog?.payment_config?.public_key);

  const orderStatus = result?.order?.status || result?.payment?.status;
  const fulfillmentStatus = result?.order?.metadata?.fulfillment_status;
  const approved = orderStatus === "paid";
  const fulfilled = approved && fulfillmentStatus === "completed";
  const failed = failedStatuses.includes(orderStatus);
  const paymentPending = Boolean(result && !failed && !approved);
  const failedPaymentGuidance = paymentFailureGuidance({
    payment: result?.payment || {},
    method,
    pixAvailable,
  });

  useEffect(() => {
    if (!catalog?.event?.id || !selection || !lines.length || checkoutViewedRef.current) return;
    checkoutViewedRef.current = true;
    trackCheckout("checkout_opened", {
      label: "Checkout aberto",
      target: slug,
      metadata: {
        event_id: Number(catalog.event.id),
        amount: Number(total.toFixed(2)),
        ticket_quantity: lines.filter((line) => line.kind === "ticket").reduce((sum, line) => sum + line.quantity, 0),
        item_quantity: lines.filter((line) => line.kind === "item").reduce((sum, line) => sum + line.quantity, 0),
        available_methods: methods,
      },
    });
  }, [catalog?.event?.id, lines, methods, selection, slug, total]);

  useEffect(() => {
    if (!availableAddOns.length || result || addOnOfferViewedRef.current) return;
    addOnOfferViewedRef.current = true;
    trackCheckout("checkout_addon_offer_viewed", {
      label: "Oferta opcional de adicionais exibida",
      target: slug,
      metadata: {
        event_id: Number(catalog?.event?.id || 0),
        current_amount: Number(total.toFixed(2)),
        ...summarizeCheckoutAddOnOffer(availableAddOns),
      },
    });
  }, [availableAddOns, catalog?.event?.id, result, slug, total]);

  useEffect(() => {
    const publicId = result?.order?.public_id;
    const pixCode = result?.payment?.qr_code;
    if (method !== "pix" || !publicId || !pixCode || approved || failed) return;
    if (pixReadyTrackedRef.current === publicId) return;
    pixReadyTrackedRef.current = publicId;
    trackCheckout("pix_payment_ready", {
      label: "PIX pronto para pagamento",
      target: slug,
      metadata: {
        event_id: Number(catalog?.event?.id || 0),
        amount: Number(result?.order?.total || total || 0),
        payment_method: "pix",
        outcome: "ready",
      },
    });
  }, [approved, catalog?.event?.id, failed, method, result?.order?.public_id, result?.order?.total, result?.payment?.qr_code, slug, total]);

  useEffect(() => {
    if (!result?.order?.public_id || !orderStatus) return;
    const statusKey = `${result.order.public_id}:${orderStatus}:${fulfillmentStatus || ""}`;
    if (trackedStatusRef.current === statusKey) return;
    trackedStatusRef.current = statusKey;
    const type = fulfilled ? "checkout_fulfilled" : approved ? "payment_approved" : failed ? "payment_failed" : "payment_pending";
    trackCheckout(type, {
      label: fulfilled ? "Ingresso emitido" : approved ? "Pagamento aprovado" : failed ? "Pagamento não concluído" : "Pagamento aguardando confirmação",
      target: slug,
      metadata: {
        event_id: Number(catalog?.event?.id || 0),
        amount: Number(result?.order?.total || total || 0),
        payment_method: method,
        order_status: orderStatus,
        fulfillment_status: fulfillmentStatus || "pending",
        outcome: fulfilled || approved ? "success" : failed ? "error" : "pending",
      },
    });
  }, [approved, catalog?.event?.id, failed, fulfilled, fulfillmentStatus, method, orderStatus, result?.order?.public_id, result?.order?.total, slug, total]);

  const requestPaymentSync = useCallback((publicId) => (
    paymentSyncGateRef.current.run(publicId, () => commerceService.syncPayment(publicId))
  ), []);

  const syncCurrentPayment = async ({ manual = false } = {}) => {
    const publicId = resultRef.current?.order?.public_id;
    if (!publicId) return;
    if (manual) setSyncingNow(true);
    try {
      const order = await requestPaymentSync(publicId);
      const payments = Array.isArray(order?.payments) ? order.payments : [];
      const latestPayment = payments.length ? payments[payments.length - 1] : resultRef.current?.payment;
      setResult((current) => ({ ...current, order, payment: latestPayment || current?.payment }));
      setError("");
    } catch (err) {
      if (err?.status === 403 || err?.status === 404) {
        safeRemoveSessionItem(paymentStorageKey);
        clearCheckoutRecovery(slug);
      }
      if (err?.status && err.status !== 429) setError(err?.message || "Não foi possível atualizar o status do pagamento.");
    } finally {
      if (manual) setSyncingNow(false);
    }
  };

  useEffect(() => {
    const publicId = result?.order?.public_id;
    const status = result?.order?.status || result?.payment?.status;
    const fulfillment = result?.order?.metadata?.fulfillment_status;
    const terminal = failedStatuses.includes(status) || (status === "paid" && fulfillment === "completed");
    if (!publicId || terminal) return undefined;
    let active = true;
    let syncing = false;
    let timer = null;
    let attempt = 0;

    const scheduleNext = ({ rateLimited = false } = {}) => {
      if (!active) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => sync("timer"), getPaymentSyncDelay(attempt, { rateLimited }));
    };

    const sync = async (source = "timer") => {
      if (!active || syncing || document.visibilityState === "hidden") return;
      syncing = true;
      const startedAt = Date.now();
      const currentAttempt = attempt + 1;
      let rateLimited = false;
      try {
        const order = await requestPaymentSync(publicId);
        if (!active) return;
        const payments = Array.isArray(order?.payments) ? order.payments : [];
        const latestPayment = payments.length ? payments[payments.length - 1] : resultRef.current?.payment;
        setResult((current) => ({ ...current, order, payment: latestPayment || current?.payment }));
        setError("");
        trackCheckout("payment_sync_cycle", {
          label: "Status de pagamento sincronizado",
          target: slug,
          metadata: {
            source,
            attempt: currentAttempt,
            duration_ms: Date.now() - startedAt,
            order_status: order?.status || "unknown",
            fulfillment_status: order?.metadata?.fulfillment_status || "pending",
            outcome: "success",
          },
        });
      } catch (err) {
        rateLimited = err?.status === 429;
        if (err?.status === 403 || err?.status === 404) {
          safeRemoveSessionItem(paymentStorageKey);
          clearCheckoutRecovery(slug);
          active = false;
        }
        if (err?.status && err.status !== 429) setError(err?.message || "Não foi possível atualizar o status do pagamento.");
        trackCheckout("payment_sync_cycle", {
          label: rateLimited ? "Sincronização de pagamento limitada" : "Falha ao sincronizar pagamento",
          target: slug,
          metadata: {
            source,
            attempt: currentAttempt,
            duration_ms: Date.now() - startedAt,
            status: Number(err?.status || 0),
            outcome: rateLimited ? "rate_limited" : "error",
          },
        });
      } finally {
        attempt += 1;
        syncing = false;
        if (active) scheduleNext({ rateLimited });
      }
    };

    const syncImmediately = (source) => {
      if (!active || document.visibilityState === "hidden") return;
      window.clearTimeout(timer);
      sync(source);
    };

    sync("initial");
    const handleFocus = () => syncImmediately("focus");
    const handleVisibility = () => { if (document.visibilityState === "visible") syncImmediately("visibility"); };
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      active = false;
      window.clearTimeout(timer);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [result?.order?.public_id, result?.order?.status, result?.order?.metadata?.fulfillment_status, paymentStorageKey, requestPaymentSync, slug]);

  const addOptionalItem = (item) => {
    if (result || !item?.id) return;
    const nextSelection = {
      ...selection,
      items: [...(selection?.items || []), { id: Number(item.id), quantity: 1 }],
    };
    setSelection(nextSelection);
    safeSetSessionJson(checkoutStorageKey, nextSelection);
    writeCheckoutRecovery(slug, { selection: nextSelection, orderPublicId: null });
    trackCheckout("checkout_addon_added", {
      label: "Adicional incluído no checkout",
      target: slug,
      metadata: {
        event_id: Number(catalog?.event?.id || 0),
        item_id: Number(item.id),
        item_name: item.name || "Item",
        addon_price: Number(item.price || 0),
        previous_amount: Number(total.toFixed(2)),
        new_amount: Number((total + Number(item.price || 0)).toFixed(2)),
      },
    });
  };

  const updateItemQuantity = (item, nextQuantity) => {
    if (result || !item?.id) return;
    const quantity = resolveCheckoutQuantity(item, Number(nextQuantity || 0), 10);
    const currentItems = selection?.items || [];
    const nextItems = quantity === 0
      ? currentItems.filter((entry) => Number(entry.id) !== Number(item.id))
      : currentItems.map((entry) => Number(entry.id) === Number(item.id) ? { ...entry, quantity } : entry);
    const nextSelection = { ...selection, items: nextItems };
    setSelection(nextSelection);
    safeSetSessionJson(checkoutStorageKey, nextSelection);
    writeCheckoutRecovery(slug, { selection: nextSelection, orderPublicId: null });
    trackCheckout("checkout_item_quantity_changed", {
      label: quantity === 0 ? "Item removido do checkout" : "Quantidade de item alterada no checkout",
      target: slug,
      metadata: {
        event_id: Number(catalog?.event?.id || 0),
        item_id: Number(item.id),
        item_name: item.name || "Item",
        previous_quantity: Number(item.quantity || 0),
        new_quantity: quantity,
        unit_price: Number(item.price || 0),
        previous_amount: Number(total.toFixed(2)),
        new_amount: Number((total + (quantity - Number(item.quantity || 0)) * Number(item.price || 0)).toFixed(2)),
      },
    });
  };

  const payload = (paymentMethod) => ({
    event_id: catalog?.event?.id,
    payment_method: paymentMethod,
    tickets: (selection?.tickets || []).map((item) => ({ id: Number(item.id), quantity: Number(item.quantity) })),
    items: (selection?.items || []).map((item) => ({ id: Number(item.id), quantity: Number(item.quantity) })),
  });

  const ensurePaymentAvailable = (requestedMethod) => {
    if (paymentAvailable && methods.includes(requestedMethod)) return true;
    setError(catalog?.payment_config?.message || "As vendas deste evento ainda não estão habilitadas.");
    return false;
  };

  const refreshAvailabilityAfterCheckoutConflict = async (err, paymentMethod) => {
    const status = Number(err?.status || err?.response?.status || 0);
    if (![409, 422].includes(status)) return false;
    try {
      const freshCatalog = await commerceService.catalog(slug, { force: true });
      setCatalog(freshCatalog);
      setError("A disponibilidade mudou enquanto você finalizava a compra. Atualizamos sua seleção; revise o resumo e confirme o pagamento novamente.");
      trackCheckout("checkout_inventory_conflict_reconciled", {
        label: "Disponibilidade atualizada após conflito no checkout",
        target: slug,
        metadata: {
          event_id: Number(freshCatalog?.event?.id || catalog?.event?.id || 0),
          amount: Number(total.toFixed(2)),
          payment_method: paymentMethod,
          status,
        },
      });
      return true;
    } catch (_) {
      return false;
    }
  };

  const chooseMethod = (nextMethod) => {
    if (nextMethod === method) return;
    if (paymentPending) {
      trackCheckout("payment_method_change_blocked", {
        label: "Troca de método bloqueada durante pagamento pendente",
        target: slug,
        metadata: {
          event_id: Number(catalog?.event?.id || 0),
          amount: Number(result?.order?.total || total || 0),
          previous_payment_method: method,
          requested_payment_method: nextMethod,
          order_status: orderStatus || "pending",
        },
      });
      setError("Há um pagamento em andamento para esta compra. Aguarde a confirmação ou verifique o status antes de escolher outra forma de pagamento.");
      return;
    }
    setMethod(nextMethod);
    trackCheckout("payment_method_selected", {
      label: nextMethod === "pix" ? "PIX selecionado" : "Cartão selecionado",
      target: slug,
      metadata: { event_id: Number(catalog?.event?.id || 0), amount: Number(total.toFixed(2)), payment_method: nextMethod },
    });
    if (!approved) {
      setResult(null);
      safeRemoveSessionItem(paymentStorageKey);
      writeCheckoutRecovery(slug, { selection, orderPublicId: null });
    }
  };

  const checkoutPix = async () => {
    if (!ensurePaymentAvailable("pix")) return;
    trackCheckout("payment_attempted", { label: "PIX solicitado", target: slug, metadata: { event_id: Number(catalog?.event?.id || 0), amount: Number(total.toFixed(2)), payment_method: "pix" } });
    setPaying(true); setError("");
    try {
      const checkoutResult = await commerceService.checkout(payload("pix"));
      setResult(checkoutResult);
      safeSetSessionJson(paymentStorageKey, checkoutResult);
    } catch (err) {
      const reconciled = await refreshAvailabilityAfterCheckoutConflict(err, "pix");
      trackCheckout("payment_attempt_failed", { label: "Falha ao iniciar PIX", target: slug, metadata: { event_id: Number(catalog?.event?.id || 0), amount: Number(total.toFixed(2)), payment_method: "pix", outcome: "error", status: Number(err?.status || err?.response?.status || 0), inventory_reconciled: reconciled } });
      if (!reconciled) setError(err?.message || "Não foi possível gerar o PIX.");
    }
    finally { setPaying(false); }
  };

  const checkoutCard = async (cardData) => {
    if (!ensurePaymentAvailable("card")) return;
    trackCheckout("payment_attempted", { label: "Pagamento com cartão enviado", target: slug, metadata: { event_id: Number(catalog?.event?.id || 0), amount: Number(total.toFixed(2)), payment_method: "card" } });
    setPaying(true); setError("");
    try {
      const checkoutResult = await commerceService.checkout({ ...payload("card"), ...cardData });
      setResult(checkoutResult);
      safeSetSessionJson(paymentStorageKey, checkoutResult);
    } catch (err) {
      const reconciled = await refreshAvailabilityAfterCheckoutConflict(err, "card");
      trackCheckout("payment_attempt_failed", { label: "Falha ao processar cartão", target: slug, metadata: { event_id: Number(catalog?.event?.id || 0), amount: Number(total.toFixed(2)), payment_method: "card", outcome: "error", status: Number(err?.status || err?.response?.status || 0), inventory_reconciled: reconciled } });
      if (!reconciled) setError(err?.message || "Não foi possível processar o cartão.");
    }
    finally { setPaying(false); }
  };

  const recoverFailedPayment = (nextMethod = method) => {
    trackCheckout("payment_recovery_selected", {
      label: nextMethod === method ? "Tentar pagamento novamente" : `Trocar para ${nextMethod === "pix" ? "PIX" : "cartão"}`,
      target: slug,
      metadata: {
        event_id: Number(catalog?.event?.id || 0),
        amount: Number(result?.order?.total || total || 0),
        previous_payment_method: method,
        payment_method: nextMethod,
        previous_status: orderStatus || "failed",
        failure_reason: failedPaymentGuidance.reason,
      },
    });
    setMethod(nextMethod);
    setResult(null);
    setError("");
    safeRemoveSessionItem(paymentStorageKey);
    writeCheckoutRecovery(slug, { selection, orderPublicId: null });
  };

  const copyPix = async () => {
    const pixCode = result?.payment?.qr_code;
    if (!pixCode) return;

    const copied = await copyText(pixCode);
    if (!copied) {
      setPixCopyStatus("error");
      setError("Não foi possível copiar automaticamente neste navegador. Toque e segure o código PIX exibido nesta tela para selecionar e copiar.");
      trackCheckout("pix_code_copy_failed", {
        label: "Falha ao copiar código PIX",
        target: slug,
        metadata: {
          event_id: Number(catalog?.event?.id || 0),
          amount: Number(result?.order?.total || total || 0),
          payment_method: "pix",
          outcome: "error",
        },
      });
      return;
    }

    setPixCopyStatus("copied");
    setError("");
    trackCheckout("pix_code_copied", {
      label: "Código PIX copiado",
      target: slug,
      metadata: {
        event_id: Number(catalog?.event?.id || 0),
        amount: Number(result?.order?.total || total || 0),
        payment_method: "pix",
        outcome: "success",
      },
    });
    window.setTimeout(() => setPixCopyStatus("idle"), 2500);
  };

  if (loading) return <ProcessingIndicatorComponent label="Preparando checkout seguro" />;
  if (!selection || !lines.length) return <div className="cut-checkout-page"><Container className="cut-checkout-container"><Alert variant="warning">Sua seleção de compra não foi encontrada.</Alert><Button onClick={() => navigate(`/event/${slug}`)}>Voltar ao evento</Button></Container></div>;

  return <div className="cut-checkout-page" data-telemetry-screen="Checkout">
    <header className="cut-checkout-topbar">
      <Container className="cut-checkout-topbar__inner">
        <Link to={`/event/${slug}`} className="cut-checkout-back"><i className="fa-solid fa-arrow-left" /> Voltar ao evento</Link>
        <div className="cut-checkout-brand"><span className="cut-checkout-brand__mark">C</span><div><strong>Cutinapp</strong><small>Checkout seguro</small></div></div>
        <div className="cut-checkout-secure"><i className="fa-solid fa-lock" /> Ambiente protegido</div>
      </Container>
    </header>

    <Container className="cut-checkout-container">
      <div className="cut-checkout-heading"><span>Finalizar compra</span><h1>{catalog?.event?.title || "Seu pedido"}</h1><p>Revise seu pedido e escolha uma forma de pagamento.</p></div>
      <div className="cut-checkout-layout">
        <main className="cut-checkout-main">
          {error && <Alert variant="danger">{error}</Alert>}
          {!paymentAvailable && !result && <Alert variant="warning">{catalog?.payment_config?.message || "As vendas deste evento ainda não estão habilitadas. Tente novamente mais tarde."}</Alert>}

          {fulfilled ? <section className="cut-checkout-success">
            <div className="cut-checkout-success__icon"><i className="fa-solid fa-check" /></div>
            <span>Pagamento aprovado</span><h2>Compra confirmada!</h2>
            <p>Seu pagamento foi reconhecido e seus ingressos já estão liberados.</p>
            <div className="cut-checkout-receipt"><div><span>Pedido</span><strong>#{result.order?.id}</strong></div><div><span>Total pago</span><strong>{money(result.order?.total)}</strong></div></div>
            {(result.order?.items || []).map((item) => <div className="cut-checkout-purchased" key={item.id}><div><small>{item.type === "ticket" ? "INGRESSO" : "ITEM"}</small><strong>{item.name}</strong><span>{item.quantity} × {money(item.unit_price)}</span></div><i className="fa-solid fa-circle-check" /></div>)}
            <Button as={Link} to="/passes" className="cut-checkout-primary mt-3">Ver meus ingressos</Button>
          </section> : <>
            <section className="cut-checkout-section" data-telemetry-context="Forma de pagamento">
              <div className="cut-checkout-section__head"><div className="cut-checkout-step">1</div><div><h2>Forma de pagamento</h2><p>{paymentPending ? "Há um pagamento em andamento. A forma de pagamento fica protegida até a confirmação ou falha desta tentativa." : "Escolha como deseja pagar."}</p></div></div>
              <div className="cut-payment-methods">
                {pixAvailable && <button type="button" data-track="Selecionar PIX" className={method === "pix" ? "is-active" : ""} onClick={() => chooseMethod("pix")} disabled={paymentPending && method !== "pix"} aria-disabled={paymentPending && method !== "pix"}><i className="fa-brands fa-pix" /><div><strong>PIX</strong><span>Aprovação rápida</span></div><i className="fa-solid fa-circle-check" /></button>}
                {cardAvailable && <button type="button" data-track="Selecionar cartão" className={method === "card" ? "is-active" : ""} onClick={() => chooseMethod("card")} disabled={paymentPending && method !== "card"} aria-disabled={paymentPending && method !== "card"}><i className="fa-regular fa-credit-card" /><div><strong>Cartão de crédito</strong><span>Pagamento protegido</span></div><i className="fa-solid fa-circle-check" /></button>}
              </div>
            </section>

            {!result && availableAddOns.length > 0 && <section className="cut-checkout-section cut-checkout-addons" data-telemetry-context="Adicionais opcionais">
              <div className="cut-checkout-section__head"><div className="cut-checkout-step"><i className="fa-solid fa-plus" /></div><div><h2>Complete sua experiência</h2><p>Itens opcionais do evento. Adicione somente se fizer sentido para você.</p></div></div>
              <div className="cut-checkout-addons__grid">
                {availableAddOns.map((item) => <div className="cut-checkout-addon" key={item.id}><div><small>Opcional</small><strong>{item.name}</strong><span>{money(item.price)}</span></div><Button type="button" variant="outline-light" onClick={() => addOptionalItem(item)} aria-label={`Adicionar ${item.name} por ${money(item.price)}`}><i className="fa-solid fa-plus me-2" />Adicionar</Button></div>)}
              </div>
            </section>}

            <section className="cut-checkout-section" data-telemetry-context="Pagamento">
              <div className="cut-checkout-section__head"><div className="cut-checkout-step">2</div><div><h2>Pagamento</h2><p>Seus dados são processados em ambiente seguro.</p></div></div>
              {!result && <div className="cut-payment-total"><span>Total a pagar</span><strong>{money(total)}</strong></div>}
              {!result && method === "pix" && pixAvailable && <div className="cut-pix-start"><div className="cut-pix-start__icon"><i className="fa-brands fa-pix" /></div><h3>Pagamento via PIX</h3><p>Geraremos um QR Code exclusivo para esta compra. A confirmação aparecerá automaticamente nesta tela.</p><Button data-track="Gerar PIX" className="cut-checkout-primary" onClick={checkoutPix} disabled={paying}>{paying ? "Gerando PIX seguro..." : "Gerar QR Code PIX"}</Button></div>}
              {!result && method === "card" && cardAvailable && <MercadoPagoCardForm publicKey={catalog?.payment_config?.public_key || ""} amount={total} email={user?.email || ""} disabled={paying} onSubmit={checkoutCard} />}
              {approved && !fulfilled && <div className="cut-payment-waiting"><div className="cut-payment-waiting__pulse"><i className="fa-solid fa-ticket" /></div><h3>Pagamento confirmado</h3><p>O dinheiro já foi reconhecido. Estamos finalizando a emissão do seu ingresso. Você não precisa pagar novamente.</p><Button className="cut-checkout-primary w-100" onClick={() => syncCurrentPayment({ manual: true })} disabled={syncingNow}>{syncingNow ? "Verificando..." : "Verificar emissão agora"}</Button><div className="cut-checkout-live"><span /><strong>Recuperação automática ativa</strong></div></div>}
              {result && !failed && !approved && <div className="cut-payment-waiting"><div className="cut-payment-waiting__pulse"><i className="fa-solid fa-shield-halved" /></div><h3>Aguardando confirmação</h3><p>Assim que o Mercado Pago confirmar o pagamento, esta página será atualizada automaticamente. {method === "pix" ? "Se você já pagou, não gere outro PIX." : "Se você já enviou o pagamento, não envie novamente."}</p>{method === "pix" && result.payment?.qr_code && <div className="cut-pix-mobile-first"><div className="cut-pix-amount"><span>Valor do PIX</span><strong>{money(result?.order?.total || total)}</strong></div><p className="cut-pix-mobile-hint"><i className="fa-solid fa-mobile-screen-button" /> No celular, copie o código e pague no app do seu banco.</p><Button className="cut-checkout-primary w-100" onClick={copyPix} aria-live="polite"><i className={`fa-regular ${pixCopyStatus === "copied" ? "fa-circle-check" : "fa-copy"} me-2`} />{pixCopyStatus === "copied" ? "Código PIX copiado" : pixCopyStatus === "error" ? "Tentar copiar código PIX" : "Copiar código PIX"}</Button></div>}{method === "pix" && result.payment?.qr_code_image && <div className="cut-pix-qr"><img src={result.payment.qr_code_image} alt="QR Code PIX" /></div>}{method === "pix" && result.payment?.qr_code && <div className="cut-pix-code">{result.payment.qr_code}</div>}<Button className="cut-checkout-primary w-100 mt-3" onClick={() => syncCurrentPayment({ manual: true })} disabled={syncingNow}>{syncingNow ? "Verificando pagamento..." : "Já paguei — verificar agora"}</Button><div className="cut-checkout-live"><span /><strong>Confirmação automática ativa</strong></div></div>}
              {failed && <Alert variant="danger" className="mb-0" role="alert" aria-live="assertive"><strong>{failedPaymentGuidance.title}</strong><div>{failedPaymentGuidance.message}</div><div className="d-grid gap-2 mt-3">{method === "card" && pixAvailable && <Button variant="light" onClick={() => recoverFailedPayment("pix")}><i className="fa-brands fa-pix me-2" />Pagar esta compra com PIX</Button>}<Button variant="outline-light" onClick={() => recoverFailedPayment(method)}>Tentar novamente com {method === "pix" ? "PIX" : "cartão"}</Button>{method === "pix" && cardAvailable && <Button variant="light" onClick={() => recoverFailedPayment("card")}><i className="fa-regular fa-credit-card me-2" />Tentar com cartão</Button>}</div></Alert>}
            </section>
          </>}

          <div className="cut-checkout-trustbar"><div><i className="fa-solid fa-lock" /><span><strong>Conexão segura</strong>Dados criptografados</span></div><div><i className="fa-solid fa-shield-halved" /><span><strong>Mercado Pago </strong>Processamento protegido</span></div><div><i className="fa-solid fa-ticket" /><span><strong>Liberação automática</strong>Ingresso após aprovação</span></div></div>
        </main>
        <aside className="cut-checkout-summary"><span className="cut-eyebrow">Resumo do pedido</span><h2>Sua compra</h2><div className="cut-checkout-summary__event"><i className="fa-regular fa-calendar-check" /><div><strong>{catalog?.event?.title}</strong><span>Compra pela Cutinapp</span></div></div><div className="cut-checkout-summary__lines">{lines.map((line) => <div key={`${line.kind}-${line.id}`}><div><small>{line.kind === "ticket" ? "Ingresso" : "Item"}</small><strong>{line.name}</strong>{!result && line.kind === "item" ? <div className="d-flex flex-row align-items-center gap-2 mt-2" aria-label={`Quantidade de ${line.name}`}><Button type="button" variant="outline-light" size="sm" onClick={() => updateItemQuantity(line, line.quantity - 1)} aria-label={`Diminuir quantidade de ${line.name}`}><i className="fa-solid fa-minus" /></Button><span aria-live="polite">{line.quantity}</span><Button type="button" variant="outline-light" size="sm" onClick={() => updateItemQuantity(line, line.quantity + 1)} disabled={line.quantity >= 10} aria-label={`Aumentar quantidade de ${line.name}`}><i className="fa-solid fa-plus" /></Button></div> : <span>Qtd. {line.quantity}</span>}</div><strong>{money(Number(line.price) * line.quantity)}</strong></div>)}</div><div className="cut-checkout-summary__total"><span>Total</span><strong>{money(total)}</strong></div><div className="cut-checkout-summary__security"><i className="fa-solid fa-shield-halved" /><span>Pagamento processado com segurança pelo Mercado Pago.</span></div></aside>
      </div>
    </Container>
  </div>;
}