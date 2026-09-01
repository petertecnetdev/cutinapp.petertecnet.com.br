import React, { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { Alert, Button, Form } from "react-bootstrap";
import commerceService from "../../services/CommerceService";

const money = (value) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));

export default function EventCommercePanel({ slug, eventId, user, onLoginRequired }) {
  const [catalog, setCatalog] = useState({ tickets: [], items: [] });
  const [quantities, setQuantities] = useState({});
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    commerceService.catalog(slug)
      .then((response) => active && setCatalog(response || { tickets: [], items: [] }))
      .catch((err) => active && setError(err?.message || "Não foi possível carregar os ingressos pagos."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [slug]);

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

  const setQuantity = (kind, id, value) => {
    const parsed = Math.max(0, Math.min(50, Number(value || 0)));
    setQuantities((current) => ({ ...current, [`${kind}:${id}`]: parsed }));
  };

  const checkout = async () => {
    if (!user) return onLoginRequired?.();
    if (!selected.tickets.length && !selected.items.length) return setError("Selecione ao menos um ingresso ou item.");
    setPaying(true); setError(""); setResult(null);
    try {
      const response = await commerceService.checkout({
        event_id: eventId,
        payment_method: "pix",
        tickets: selected.tickets.map((item) => ({ id: item.id, quantity: Number(quantities[`ticket:${item.id}`]) })),
        items: selected.items.map((item) => ({ id: item.id, quantity: Number(quantities[`item:${item.id}`]) })),
      });
      setResult(response);
    } catch (err) {
      setError(err?.message || "Não foi possível iniciar o pagamento.");
    } finally { setPaying(false); }
  };

  const copyPix = async () => {
    const code = result?.payment?.qr_code;
    if (!code) return;
    await navigator.clipboard.writeText(code);
  };

  if (loading) return <p className="text-secondary mb-0">Carregando opções de compra...</p>;
  if (!(catalog.tickets || []).length && !(catalog.items || []).length) return null;

  return <div className="cut-commerce-panel mt-4">
    <span className="cut-eyebrow">Comprar</span>
    <h3 className="cut-section-title mt-2">Ingressos e itens</h3>
    {error && <Alert variant="danger">{error}</Alert>}
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
      <Button className="w-100 mt-3" onClick={checkout} disabled={paying || total <= 0}>{paying ? "Gerando PIX..." : user ? "Pagar com PIX" : "Entrar para comprar"}</Button>
    </>}
    {result && <Alert variant="success" className="mt-3 mb-0">
      <strong>Pedido criado.</strong><div className="mt-2">Pague o PIX para liberar automaticamente seus ingressos.</div>
      {result.payment?.qr_code_image && <img src={result.payment.qr_code_image} alt="QR Code PIX" className="img-fluid bg-white rounded p-2 my-3" />}
      {result.payment?.qr_code && <><Form.Control as="textarea" rows={3} readOnly value={result.payment.qr_code} /><Button variant="outline-success" className="w-100 mt-2" onClick={copyPix}>Copiar PIX</Button></>}
    </Alert>}
  </div>;
}

EventCommercePanel.propTypes = {
  slug: PropTypes.string.isRequired,
  eventId: PropTypes.number.isRequired,
  user: PropTypes.shape({ id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]) }),
  onLoginRequired: PropTypes.func,
};

EventCommercePanel.defaultProps = {
  user: null,
  onLoginRequired: null,
};
