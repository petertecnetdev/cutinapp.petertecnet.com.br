import React, { useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { Alert, Button, Form } from "react-bootstrap";
import MercadoPagoCardForm from "../payment/MercadoPagoCardForm";
import commerceService from "../../services/CommerceService";

const money = (value) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
const finalStatuses = ["paid", "refunded", "charged_back", "rejected", "cancelled"];

export default function EventCommercePanel({ slug, eventId, user, onLoginRequired }) {
  const [catalog, setCatalog] = useState({ tickets: [], items: [] });
  const [quantities, setQuantities] = useState({});
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [method, setMethod] = useState("pix");
  const resultRef = useRef(result);
  resultRef.current = result;

  useEffect(() => {
    let active = true;
    setLoading(true);
    commerceService.catalog(slug)
      .then((response) => active && setCatalog(response || { tickets: [], items: [] }))
      .catch((err) => active && setError(err?.message || "Não foi possível carregar os ingressos pagos."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [slug]);

  const pollingPublicId = result?.order?.public_id || "";
  useEffect(() => {
    if (!pollingPublicId) return undefined;

    let active = true;
    let attempts = 0;
    const maxAttempts = 30;

    const sync = async () => {
      attempts += 1;
      try {
        const order = await commerceService.syncPayment(pollingPublicId);
        if (!active) return true;
        const payments = Array.isArray(order?.payments) ? order.payments : [];
        const latestPayment = payments.length ? payments[payments.length - 1] : resultRef.current?.payment;
        setResult((current) => ({ ...current, order, payment: latestPayment || current?.payment }));
        return finalStatuses.includes(order?.status);
      } catch (_) {
        return false;
      }
    };

    const initialStatus = resultRef.current?.order?.status || resultRef.current?.payment?.status;
    if (finalStatuses.includes(initialStatus)) return undefined;

    const timer = window.setInterval(async () => {
      const finished = await sync();
      if (finished || attempts >= maxAttempts) window.clearInterval(timer);
    }, 4000);

    return () => { active = false; window.clearInterval(timer); };
  }, [pollingPublicId]);

  const selected = useMemo(() => {
    const tickets = (catalog.tickets || []).filter((item) => Number(quantities[`ticket:${item.id}`] || 0) > 0);
    const items = (catalog.items || []).filter((item) => Number(quantities[`item:${item.id}`] || 0) > 0);
    return { tickets, items };
  }, [catalog, quantities]);

  const total = useMemo(() => {
    const ticketTotal = selected.tickets.reduce((sum, item) => sum + Number(item.price) * Number(quantities[`ticket:${item.id}`] || 0), 0);
    const itemTotal = selected.items.reduce((sum, item) => sum + Number(item.price) * Number(quantities[`item:${item.id}`] || 0), 0);
    return ticketTotal + itemTotal;
  }, [selected, quantities]);

  const checkoutAvailable = catalog?.payment_config?.available ?? catalog?.payment_config?.connected ?? false;

  const setQuantity = (kind, id, value) => {
    const parsed = Math.max(0, Math.min(50, Number(value || 0)));
    setQuantities((current) => ({ ...current, [`${kind}:${id}`]: parsed }));
  };

  const selectPaymentMethod = (nextMethod) => {
    setMethod(nextMethod);
    setError("");
  };

  const changePaymentMethod = (nextMethod) => {
    if (result?.order?.status === "paid") return;
    setResult(null);
    setMethod(nextMethod);
    setError("");
  };

  const basePayload = (paymentMethod) => ({
    event_id: eventId,
    payment_method: paymentMethod,
    tickets: selected.tickets.map((item) => ({ id: item.id, quantity: Number(quantities[`ticket:${item.id}`]) })),
    items: selected.items.map((item) => ({ id: item.id, quantity: Number(quantities[`item:${item.id}`]) })),
  });

  const validatePurchase = () => {
    if (!user) { onLoginRequired?.(); return false; }
    if (!selected.tickets.length && !selected.items.length) { setError("Selecione ao menos um ingresso ou item."); return false; }
    if (!checkoutAvailable) { setError("Os pagamentos deste evento estão temporariamente indisponíveis."); return false; }
    return true;
  };

  const checkoutPix = async () => {
    if (!validatePurchase()) return;
    setPaying(true); setError(""); setResult(null);
    try {
      setResult(await commerceService.checkout(basePayload("pix")));
    } catch (err) {
      setError(err?.message || "Não foi possível iniciar o pagamento PIX.");
    } finally { setPaying(false); }
  };

  const checkoutCard = async (cardData) => {
    if (!validatePurchase()) return;
    setPaying(true); setError(""); setResult(null);
    try {
      setResult(await commerceService.checkout({ ...basePayload("card"), ...cardData }));
    } catch (err) {
      setError(err?.message || "Não foi possível processar o cartão.");
    } finally { setPaying(false); }
  };

  const copyPix = async () => {
    const code = result?.payment?.qr_code;
    if (code) await navigator.clipboard.writeText(code);
  };

  if (loading) return <p className="text-secondary mb-0">Carregando opções de compra...</p>;
  if (!(catalog.tickets || []).length && !(catalog.items || []).length) return null;

  const paymentStatus = result?.order?.status || result?.payment?.status;
  const approved = paymentStatus === "paid";
  const reversed = ["refunded", "charged_back"].includes(paymentStatus);
  const failed = ["rejected", "cancelled"].includes(paymentStatus);

  return <div className="cut-commerce-panel mt-4">
    <span className="cut-eyebrow">Comprar</span>
    <h3 className="cut-section-title mt-2">Ingressos e itens</h3>
    {error && <Alert variant="danger">{error}</Alert>}
    {!checkoutAvailable && <Alert variant="warning">Pagamentos temporariamente indisponíveis para este evento.</Alert>}

    {!result && <>
      {(catalog.tickets || []).map((ticket) => <div className="cut-ticket-option" key={`paid-ticket-${ticket.id}`}>
        <div><span className="cut-ticket-kicker">Ingresso</span><strong>{ticket.name}</strong><span>{money(ticket.price)}</span></div>
        <Form.Control type="number" min="0" max="20" value={quantities[`ticket:${ticket.id}`] || 0} onChange={(event) => setQuantity("ticket", ticket.id, event.target.value)} style={{ width: 82 }} />
      </div>)}
      {(catalog.items || []).map((item) => <div className="cut-ticket-option" key={`event-item-${item.id}`}>
        <div><span className="cut-ticket-kicker">Item do evento</span><strong>{item.name}</strong><span>{money(item.price)}</span>{item.description && <small>{item.description}</small>}</div>
        <Form.Control type="number" min="0" max="50" value={quantities[`item:${item.id}`] || 0} onChange={(event) => setQuantity("item", item.id, event.target.value)} style={{ width: 82 }} />
      </div>)}

      <div className="d-flex align-items-center justify-content-between mt-3"><strong>Total</strong><strong>{money(total)}</strong></div>
      <Form.Group className="mt-3">
        <Form.Label>Forma de pagamento</Form.Label>
        <div className="d-flex gap-2 flex-wrap">
          <Button type="button" variant={method === "pix" ? "primary" : "outline-primary"} onClick={() => selectPaymentMethod("pix")}>PIX</Button>
          <Button type="button" variant={method === "card" ? "primary" : "outline-primary"} onClick={() => selectPaymentMethod("card")}>Cartão</Button>
        </div>
      </Form.Group>

      {method === "pix" && <Button className="w-100 mt-3" onClick={checkoutPix} disabled={paying || total <= 0 || !checkoutAvailable}>
        {paying ? "Gerando PIX..." : user ? "Pagar com PIX" : "Entrar para comprar"}
      </Button>}

      {method === "card" && total > 0 && checkoutAvailable && user && <MercadoPagoCardForm
        publicKey={catalog?.payment_config?.public_key || ""}
        amount={total}
        email={user?.email || ""}
        disabled={paying}
        onSubmit={checkoutCard}
      />}
      {method === "card" && !user && <Button className="w-100 mt-3" onClick={() => onLoginRequired?.()}>Entrar para comprar</Button>}
    </>}

    {result && <Alert variant={approved ? "success" : failed || reversed ? "danger" : "info"} className="mt-3 mb-0">
      <strong>{approved ? "Pagamento aprovado e ingressos liberados." : reversed ? "Pagamento revertido." : failed ? "Pagamento não concluído." : "Pagamento em processamento."}</strong>
      {method === "pix" && !approved && !failed && !reversed && <div className="mt-2">Pague o PIX. A confirmação é atualizada automaticamente nesta tela.</div>}
      {method === "card" && !approved && !failed && !reversed && <div className="mt-2">O Mercado Pago está processando o cartão. A liberação acontece somente após a confirmação.</div>}
      {result.payment?.qr_code_image && <img src={result.payment.qr_code_image} alt="QR Code PIX" className="img-fluid bg-white rounded p-2 my-3" />}
      {result.payment?.qr_code && <><Form.Control as="textarea" rows={3} readOnly value={result.payment.qr_code} /><Button variant="outline-success" className="w-100 mt-2" onClick={copyPix}>Copiar PIX</Button></>}
      {result.payment?.ticket_url && <Button as="a" href={result.payment.ticket_url} target="_blank" rel="noreferrer" variant="outline-primary" className="w-100 mt-2">Abrir pagamento no Mercado Pago</Button>}

      {!approved && <div className="mt-3 pt-2 border-top border-secondary-subtle">
        <small className="d-block mb-2">Quer usar outra forma de pagamento?</small>
        <div className="d-flex gap-2 flex-wrap">
          {method !== "pix" && <Button type="button" variant="outline-primary" onClick={() => changePaymentMethod("pix")}>Trocar para PIX</Button>}
          {method !== "card" && <Button type="button" variant="outline-primary" onClick={() => changePaymentMethod("card")}>Trocar para cartão</Button>}
        </div>
      </div>}

      {(failed || reversed) && <Button variant="outline-light" className="w-100 mt-3" onClick={() => setResult(null)}>Tentar novamente</Button>}
    </Alert>}
  </div>;
}

EventCommercePanel.propTypes = {
  slug: PropTypes.string.isRequired,
  eventId: PropTypes.number.isRequired,
  user: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    email: PropTypes.string,
  }),
  onLoginRequired: PropTypes.func,
};

EventCommercePanel.defaultProps = { user: null, onLoginRequired: null };
