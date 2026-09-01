import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Container } from "react-bootstrap";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import MercadoPagoCardForm from "../../components/payment/MercadoPagoCardForm";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import { AuthContext } from "../../context/AuthContext";
import commerceService from "../../services/CommerceService";
import "./CheckoutPage.css";

const money = (value) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
const finalStatuses = ["paid", "refunded", "charged_back", "rejected", "cancelled"];
const PAYMENT_SYNC_INTERVAL_MS = 5000;

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
  const [error, setError] = useState("");
  const resultRef = useRef(result);
  resultRef.current = result;

  useEffect(() => {
    const storageKey = `cutinapp_checkout_${slug}`;
    const fromState = location.state?.checkout || null;
    if (fromState) sessionStorage.setItem(storageKey, JSON.stringify(fromState));
    let stored = fromState;
    if (!stored) {
      try { stored = JSON.parse(sessionStorage.getItem(storageKey) || "null"); } catch (_) { stored = null; }
    }
    setSelection(stored);

    commerceService.catalog(slug)
      .then((response) => {
        setCatalog(response);
        const methods = Array.isArray(response?.payment_config?.methods) ? response.payment_config.methods : [];
        if (methods.length && !methods.includes("pix")) setMethod(methods[0]);
      })
      .catch((err) => setError(err?.message || "Não foi possível preparar o checkout."))
      .finally(() => setLoading(false));
  }, [slug, location.state]);

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

  useEffect(() => {
    const publicId = result?.order?.public_id;
    if (!publicId || finalStatuses.includes(result?.order?.status)) return undefined;
    let active = true;
    let syncing = false;

    const sync = async () => {
      if (!active || syncing || document.visibilityState === "hidden") return;
      syncing = true;
      try {
        const order = await commerceService.syncPayment(publicId);
        if (!active) return;
        const payments = Array.isArray(order?.payments) ? order.payments : [];
        const latestPayment = payments.length ? payments[payments.length - 1] : resultRef.current?.payment;
        setResult((current) => ({ ...current, order, payment: latestPayment || current?.payment }));
      } catch (err) {
        if (err?.status && err.status !== 429) setError(err?.message || "Não foi possível atualizar o status do pagamento.");
      } finally {
        syncing = false;
      }
    };

    sync();
    const timer = window.setInterval(sync, PAYMENT_SYNC_INTERVAL_MS);
    const handleFocus = () => sync();
    const handleVisibility = () => { if (document.visibilityState === "visible") sync(); };
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [result?.order?.public_id, result?.order?.status]);

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

  const checkoutPix = async () => {
    if (!ensurePaymentAvailable("pix")) return;
    setPaying(true); setError("");
    try { setResult(await commerceService.checkout(payload("pix"))); }
    catch (err) { setError(err?.message || "Não foi possível gerar o PIX."); }
    finally { setPaying(false); }
  };

  const checkoutCard = async (cardData) => {
    if (!ensurePaymentAvailable("card")) return;
    setPaying(true); setError("");
    try { setResult(await commerceService.checkout({ ...payload("card"), ...cardData })); }
    catch (err) { setError(err?.message || "Não foi possível processar o cartão."); }
    finally { setPaying(false); }
  };

  const copyPix = async () => {
    if (result?.payment?.qr_code) await navigator.clipboard.writeText(result.payment.qr_code);
  };

  if (loading) return <ProcessingIndicatorComponent label="Preparando checkout seguro" />;
  if (!selection || !lines.length) return <div className="cut-checkout-page"><Container className="cut-checkout-container"><Alert variant="warning">Sua seleção de compra não foi encontrada.</Alert><Button onClick={() => navigate(`/event/${slug}`)}>Voltar ao evento</Button></Container></div>;

  const status = result?.order?.status || result?.payment?.status;
  const approved = status === "paid";
  const failed = ["rejected", "cancelled", "refunded", "charged_back"].includes(status);

  return <div className="cut-checkout-page">
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

          {approved ? <section className="cut-checkout-success">
            <div className="cut-checkout-success__icon"><i className="fa-solid fa-check" /></div>
            <span>Pagamento aprovado</span><h2>Compra confirmada!</h2>
            <p>Seu pagamento foi reconhecido e seus ingressos já estão liberados.</p>
            <div className="cut-checkout-receipt"><div><span>Pedido</span><strong>#{result.order?.id}</strong></div><div><span>Total pago</span><strong>{money(result.order?.total)}</strong></div></div>
            {(result.order?.items || []).map((item) => <div className="cut-checkout-purchased" key={item.id}><div><small>{item.type === "ticket" ? "INGRESSO" : "ITEM"}</small><strong>{item.name}</strong><span>{item.quantity} × {money(item.unit_price)}</span></div><i className="fa-solid fa-circle-check" /></div>)}
            <Button as={Link} to="/passes" className="cut-checkout-primary mt-3">Ver meus ingressos</Button>
          </section> : <>
            <section className="cut-checkout-section">
              <div className="cut-checkout-section__head"><div className="cut-checkout-step">1</div><div><h2>Forma de pagamento</h2><p>Escolha como deseja pagar.</p></div></div>
              <div className="cut-payment-methods">
                {pixAvailable && <button type="button" className={method === "pix" ? "is-active" : ""} onClick={() => { setMethod("pix"); setResult(null); }}><i className="fa-brands fa-pix" /><div><strong>PIX</strong><span>Aprovação rápida</span></div><i className="fa-solid fa-circle-check" /></button>}
                {cardAvailable && <button type="button" className={method === "card" ? "is-active" : ""} onClick={() => { setMethod("card"); setResult(null); }}><i className="fa-regular fa-credit-card" /><div><strong>Cartão de crédito</strong><span>Pagamento protegido</span></div><i className="fa-solid fa-circle-check" /></button>}
              </div>
            </section>

            <section className="cut-checkout-section">
              <div className="cut-checkout-section__head"><div className="cut-checkout-step">2</div><div><h2>Pagamento</h2><p>Seus dados são processados em ambiente seguro.</p></div></div>
              {!result && method === "pix" && pixAvailable && <div className="cut-pix-start"><div className="cut-pix-start__icon"><i className="fa-brands fa-pix" /></div><h3>Pagamento via PIX</h3><p>Geraremos um QR Code exclusivo para esta compra. A confirmação aparecerá automaticamente nesta tela.</p><div className="cut-payment-total"><span>Total a pagar</span><strong>{money(total)}</strong></div><Button className="cut-checkout-primary" onClick={checkoutPix} disabled={paying}>{paying ? "Gerando PIX seguro..." : "Gerar QR Code PIX"}</Button></div>}
              {!result && method === "card" && cardAvailable && <MercadoPagoCardForm publicKey={catalog?.payment_config?.public_key || ""} amount={total} email={user?.email || ""} disabled={paying} onSubmit={checkoutCard} />}
              {result && !failed && !approved && <div className="cut-payment-waiting"><div className="cut-payment-waiting__pulse"><i className="fa-solid fa-shield-halved" /></div><h3>Aguardando confirmação</h3><p>Assim que o Mercado Pago confirmar o pagamento, esta página será atualizada automaticamente.</p>{method === "pix" && result.payment?.qr_code_image && <div className="cut-pix-qr"><img src={result.payment.qr_code_image} alt="QR Code PIX" /></div>}{method === "pix" && result.payment?.qr_code && <><div className="cut-pix-code">{result.payment.qr_code}</div><Button variant="outline-light" className="w-100" onClick={copyPix}><i className="fa-regular fa-copy me-2" />Copiar código PIX</Button></>}<div className="cut-checkout-live"><span /><strong>Confirmação automática ativa</strong></div></div>}
              {failed && <Alert variant="danger" className="mb-0"><strong>Pagamento não concluído.</strong><div>Escolha outra forma de pagamento ou tente novamente.</div><Button variant="outline-light" className="mt-3" onClick={() => setResult(null)}>Tentar novamente</Button></Alert>}
            </section>
          </>}

          <div className="cut-checkout-trustbar"><div><i className="fa-solid fa-lock" /><span><strong>Conexão segura</strong>Dados criptografados</span></div><div><i className="fa-solid fa-shield-halved" /><span><strong>Mercado Pago</strong>Processamento protegido</span></div><div><i className="fa-solid fa-ticket" /><span><strong>Liberação automática</strong>Ingresso após aprovação</span></div></div>
        </main>
        <aside className="cut-checkout-summary"><span className="cut-eyebrow">Resumo do pedido</span><h2>Sua compra</h2><div className="cut-checkout-summary__event"><i className="fa-regular fa-calendar-check" /><div><strong>{catalog?.event?.title}</strong><span>Compra pela Cutinapp</span></div></div><div className="cut-checkout-summary__lines">{lines.map((line) => <div key={`${line.kind}-${line.id}`}><div><small>{line.kind === "ticket" ? "Ingresso" : "Item"}</small><strong>{line.name}</strong><span>Qtd. {line.quantity}</span></div><strong>{money(Number(line.price) * line.quantity)}</strong></div>)}</div><div className="cut-checkout-summary__total"><span>Total</span><strong>{money(total)}</strong></div><div className="cut-checkout-summary__security"><i className="fa-solid fa-shield-halved" /><span>Pagamento processado com segurança pelo Mercado Pago.</span></div></aside>
      </div>
    </Container>
  </div>;
}
