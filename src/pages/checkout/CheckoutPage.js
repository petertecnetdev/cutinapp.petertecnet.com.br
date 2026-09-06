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
import { getPaymentSyncDelay } from "../../utils/paymentSyncSchedule";
import { createKeyedSingleFlight } from "../../utils/singleFlight";
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
  const paymentSyncGateRef = useRef(createKeyedSingleFlight());
  resultRef.current = result;

  const checkoutStorageKey = `cutinapp_checkout_${slug}`;
  const paymentStorageKey = `cutinapp_payment_${slug}`;

  useEffect(() => {
    let active = true;
    const fromState = location.state?.checkout || null;
    const recovery = readCheckoutRecovery(slug);

    if (fromState) {
      try { sessionStorage.setItem(checkoutStorageKey, JSON.stringify(fromState)); } catch (_) { /* Durable fallback below. */ }
      writeCheckoutRecovery(slug, { selection: fromState, orderPublicId: null });
    }

    let stored = fromState;
    if (!stored) {
      try { stored = JSON.parse(sessionStorage.getItem(checkoutStorageKey) || "null"); } catch (_) { stored = null; }
    }
    if (!stored) stored = recovery?.selection || null;
    setSelection(stored);

    let hasSessionPayment = false;
    try {
      const storedPayment = JSON.parse(sessionStorage.getItem(paymentStorageKey) || "null");
      if (storedPayment?.order?.public_id) {
        hasSessionPayment = true;
        setMethod(resolveCheckoutPaymentMethod(storedPayment));
        setResult(storedPayment);
      }
    } catch (_) {
      try { sessionStorage.removeItem(paymentStorageKey); } catch (_) { /* Ignore unavailable storage. */ }
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
      try { sessionStorage.setItem(paymentStorageKey, JSON.stringify(result)); } catch (_) { /* Durable recovery remains available. */ }
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
  const paymentAvailable = Boolean(catalog?.payment_config?.available);
  const methods = Array.isArray(catalog?.payment_config?.methods) ? catalog.payment_config.methods : [];
  const pixAvailable = paymentAvailable && methods.includes("pix");
  const cardAvailable = paymentAvailable && methods.includes("card") && Boolean(catalog?.payment_config?.public_key);

  const orderStatus = result?.order?.status || result?.payment?.status;
  const fulfillmentStatus = result?.order?.metadata?.fulfillment_status;
  const approved = orderStatus === "paid";
  const fulfilled = approved && fulfillmentStatus === "completed";
  const failed = failedStatuses.includes(orderStatus);
  const failedPaymentGuidance = method === "card"
    ? {
        title: "O cartão não concluiu o pagamento",
        message: "Você pode revisar os dados e tentar novamente ou usar PIX para concluir sem refazer sua seleção.",
      }
    : {
        title: "O PIX não foi concluído",
        message: "Gere um novo PIX para esta mesma compra. Sua seleção continua preservada.",
      };

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
        try { sessionStorage.removeItem(paymentStorageKey); } catch (_) { /* Ignore unavailable session storage. */ }
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
          try { sessionStorage.removeItem(paymentStorageKey); } catch (_) { /* Ignore unavailable session storage. */ }
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

  const chooseMethod = (nextMethod) => {
    if (nextMethod === method) return;
    setMethod(nextMethod);
    trackCheckout("payment_method_selected", {
      label: nextMethod === "pix" ? "PIX selecionado" : "Cartão selecionado",
      target: slug,
      metadata: { event_id: Number(catalog?.event?.id || 0), amount: Number(total.toFixed(2)), payment_method: nextMethod },
    });
    if (!approved) {
      setResult(null);
      try { sessionStorage.removeItem(paymentStorageKey); } catch (_) { /* Ignore unavailable session storage. */ }
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
      try { sessionStorage.setItem(paymentStorageKey, JSON.stringify(checkoutResult)); } catch (_) { /* Durable recovery effect will persist the order reference. */ }
    } catch (err) {
      trackCheckout("payment_attempt_failed", { label: "Falha ao iniciar PIX", target: slug, metadata: { event_id: Number(catalog?.event?.id || 0), amount: Number(total.toFixed(2)), payment_method: "pix", outcome: "error", status: Number(err?.status || 0) } });
      setError(err?.message || "Não foi possível gerar o PIX.");
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
      try { sessionStorage.setItem(paymentStorageKey, JSON.stringify(checkoutResult)); } catch (_) { /* Durable recovery effect will persist the order reference. */ }
    } catch (err) {
      trackCheckout("payment_attempt_failed", { label: "Falha ao processar cartão", target: slug, metadata: { event_id: Number(catalog?.event?.id || 0), amount: Number(total.toFixed(2)), payment_method: "card", outcome: "error", status: Number(err?.status || 0) } });
      setError(err?.message || "Não foi possível processar o cartão.");
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
      },
    });
    setMethod(nextMethod);
    setResult(null);
    setError("");
    try { sessionStorage.removeItem(paymentStorageKey); } catch (_) { /* Ignore unavailable session storage. */ }
    writeCheckoutRecovery(slug, { selection, orderPublicId: null });
  };

  const copyPix = async () => {
    const pixCode = result?.payment?.qr_code;
    if (!pixCode) return;

    try {
      const copied = await copyText(pixCode);
      if (!copied) throw new Error("clipboard_unavailable");
      setPixCopyStatus("copied");
      setError("");
      trackCheckout("pix_code_copied", {
        label: "Código PIX copiado",
        target: slug,
        metadata: {
          event_id: Number(catalog?.event?.id || 0),
          amount: Number(result?.order?.total || total || 0),
          payment_method: "pix",
        },
      });
      window.setTimeout(() => setPixCopyStatus("idle"), 2500);
    } catch (_) {
      setPixCopyStatus("error");
      setError("Não foi possível copiar automaticamente. Toque e segure o código PIX acima para copiar.");
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
    }
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
              <div className="cut-checkout-section__head"><div className="cut-checkout-step">1</div><div><h2>Forma de pagamento</h2><p>Escolha como deseja pagar.</p></div></div>
              <div className="cut-payment-methods">
                {pixAvailable && <button type="button" data-track="Selecionar PIX" className={method === "pix" ? "is-active" : ""} onClick={() => chooseMethod("pix")}><i className="fa-brands fa-pix" /><div><strong>PIX</strong><span>Aprovação rápida</span></div><i className="fa-solid fa-circle-check" /></button>}
                {cardAvailable && <button type="button" data-track="Selecionar cartão" className={method === "card" ? "is-active" : ""} onClick={() => chooseMethod("card")}><i className="fa-regular fa-credit-card" /><div><strong>Cartão de crédito</strong><span>Pagamento protegido</span></div><i className="fa-solid fa-circle-check" /></button>}
              </div>
            </section>

            <section className="cut-checkout-section" data-telemetry-context="Pagamento">
              <div className="cut-checkout-section__head"><div className="cut-checkout-step">2</div><div><h2>Pagamento</h2><p>Seus dados são processados em ambiente seguro.</p></div></div>
              {!result && <div className="cut-payment-total"><span>Total a pagar</span><strong>{money(total)}</strong></div>}
              {!result && method === "pix" && pixAvailable && <div className="cut-pix-start"><div className="cut-pix-start__icon"><i className="fa-brands fa-pix" /></div><h3>Pagamento via PIX</h3><p>Geraremos um QR Code exclusivo para esta compra. A confirmação aparecerá automaticamente nesta tela.</p><Button data-track="Gerar PIX" className="cut-checkout-primary" onClick={checkoutPix} disabled={paying}>{paying ? "Gerando PIX seguro..." : "Gerar QR Code PIX"}</Button></div>}
              {!result && method === "card" && cardAvailable && <MercadoPagoCardForm publicKey={catalog?.payment_config?.public_key || ""} amount={total} email={user?.email || ""} disabled={paying} onSubmit={checkoutCard} />}
              {approved && !fulfilled && <div className="cut-payment-waiting"><div className="cut-payment-waiting__pulse"><i className="fa-solid fa-ticket" /></div><h3>Pagamento confirmado</h3><p>O dinheiro já foi reconhecido. Estamos finalizando a emissão do seu ingresso. Você não precisa pagar novamente.</p><Button className="cut-checkout-primary w-100" onClick={() => syncCurrentPayment({ manual: true })} disabled={syncingNow}>{syncingNow ? "Verificando..." : "Verificar emissão agora"}</Button><div className="cut-checkout-live"><span /><strong>Recuperação automática ativa</strong></div></div>}
              {result && !failed && !approved && <div className="cut-payment-waiting"><div className="cut-payment-waiting__pulse"><i className="fa-solid fa-shield-halved" /></div><h3>Aguardando confirmação</h3><p>Assim que o Mercado Pago confirmar o pagamento, esta página será atualizada automaticamente. {method === "pix" ? "Se você já pagou, não gere outro PIX." : "Se você já enviou o pagamento, não envie novamente."}</p>{method === "pix" && result.payment?.qr_code_image && <div className="cut-pix-qr"><img src={result.payment.qr_code_image} alt="QR Code PIX" /></div>}{method === "pix" && result.payment?.qr_code && <><div className="cut-pix-code">{result.payment.qr_code}</div><Button variant="outline-light" className="w-100" onClick={copyPix} aria-live="polite"><i className={`fa-regular ${pixCopyStatus === "copied" ? "fa-circle-check" : "fa-copy"} me-2`} />{pixCopyStatus === "copied" ? "Código PIX copiado" : pixCopyStatus === "error" ? "Tentar copiar novamente" : "Copiar código PIX"}</Button></>}<Button className="cut-checkout-primary w-100 mt-3" onClick={() => syncCurrentPayment({ manual: true })} disabled={syncingNow}>{syncingNow ? "Verificando pagamento..." : "Já paguei — verificar agora"}</Button><div className="cut-checkout-live"><span /><strong>Confirmação automática ativa</strong></div></div>}
              {failed && <Alert variant="danger" className="mb-0" role="alert" aria-live="assertive"><strong>{failedPaymentGuidance.title}</strong><div>{failedPaymentGuidance.message}</div><div className="d-grid gap-2 mt-3">{method === "card" && pixAvailable && <Button variant="light" onClick={() => recoverFailedPayment("pix")}><i className="fa-brands fa-pix me-2" />Pagar esta compra com PIX</Button>}<Button variant="outline-light" onClick={() => recoverFailedPayment(method)}>Tentar novamente com {method === "pix" ? "PIX" : "cartão"}</Button>{method === "pix" && cardAvailable && <Button variant="light" onClick={() => recoverFailedPayment("card")}><i className="fa-regular fa-credit-card me-2" />Tentar com cartão</Button>}</div></Alert>}
            </section>
          </>}

          <div className="cut-checkout-trustbar"><div><i className="fa-solid fa-lock" /><span><strong>Conexão segura</strong>Dados criptografados</span></div><div><i className="fa-solid fa-shield-halved" /><span><strong>Mercado Pago</strong>Processamento protegido</span></div><div><i className="fa-solid fa-ticket" /><span><strong>Liberação automática</strong>Ingresso após aprovação</span></div></div>
        </main>
        <aside className="cut-checkout-summary"><span className="cut-eyebrow">Resumo do pedido</span><h2>Sua compra</h2><div className="cut-checkout-summary__event"><i className="fa-regular fa-calendar-check" /><div><strong>{catalog?.event?.title}</strong><span>Compra pela Cutinapp</span></div></div><div className="cut-checkout-summary__lines">{lines.map((line) => <div key={`${line.kind}-${line.id}`}><div><small>{line.kind === "ticket" ? "Ingresso" : "Item"}</small><strong>{line.name}</strong><span>Qtd. {line.quantity}</span></div><strong>{money(Number(line.price) * line.quantity)}</strong></div>)}</div><div className="cut-checkout-summary__total"><span>Total</span><strong>{money(total)}</strong></div><div className="cut-checkout-summary__security"><i className="fa-solid fa-shield-halved" /><span>Pagamento processado com segurança pelo Mercado Pago.</span></div></aside>
      </div>
    </Container>
  </div>;
}
