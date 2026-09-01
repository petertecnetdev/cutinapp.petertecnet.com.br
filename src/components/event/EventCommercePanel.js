import React, { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { Alert, Button, Form } from "react-bootstrap";
import { useLocation, useNavigate } from "react-router-dom";
import commerceService from "../../services/CommerceService";

const money = (value) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));

export default function EventCommercePanel({ slug, eventId, user, onLoginRequired }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [catalog, setCatalog] = useState({ tickets: [], items: [] });
  const [quantities, setQuantities] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  const checkoutAvailable = catalog?.payment_config?.available ?? catalog?.payment_config?.connected ?? false;

  const setQuantity = (kind, id, value) => {
    const max = kind === "ticket" ? 20 : 50;
    const parsed = Math.max(0, Math.min(max, Number(value || 0)));
    setQuantities((current) => ({ ...current, [`${kind}:${id}`]: parsed }));
  };

  const continueToCheckout = () => {
    if (!user) {
      onLoginRequired?.();
      return;
    }
    if (!selected.tickets.length && !selected.items.length) {
      setError("Selecione ao menos um ingresso ou item.");
      return;
    }
    if (!checkoutAvailable) {
      setError("Os pagamentos deste evento estão temporariamente indisponíveis.");
      return;
    }

    const checkout = {
      eventId,
      tickets: selected.tickets.map((item) => ({ id: item.id, quantity: Number(quantities[`ticket:${item.id}`]) })),
      items: selected.items.map((item) => ({ id: item.id, quantity: Number(quantities[`item:${item.id}`]) })),
    };
    sessionStorage.setItem(`cutinapp_checkout_${slug}`, JSON.stringify(checkout));
    navigate(`/checkout/${slug}`, { state: { checkout, from: `${location.pathname}${location.search}` } });
  };

  if (loading) return <p className="text-secondary mb-0">Carregando opções de compra...</p>;
  if (!(catalog.tickets || []).length && !(catalog.items || []).length) return null;

  return <div className="cut-commerce-panel mt-4">
    <span className="cut-eyebrow">Comprar</span>
    <h3 className="cut-section-title mt-2">Ingressos e itens</h3>
    <p className="text-secondary small">Escolha o que deseja comprar. O pagamento será concluído em nosso checkout seguro.</p>
    {error && <Alert variant="danger">{error}</Alert>}
    {!checkoutAvailable && <Alert variant="warning">Pagamentos temporariamente indisponíveis para este evento.</Alert>}

    {(catalog.tickets || []).map((ticket) => <div className="cut-ticket-option" key={`paid-ticket-${ticket.id}`}>
      <div><span className="cut-ticket-kicker">Ingresso</span><strong>{ticket.name}</strong><span>{money(ticket.price)}</span></div>
      <Form.Control type="number" min="0" max="20" value={quantities[`ticket:${ticket.id}`] || 0} onChange={(event) => setQuantity("ticket", ticket.id, event.target.value)} style={{ width: 82 }} />
    </div>)}

    {(catalog.items || []).map((item) => <div className="cut-ticket-option" key={`event-item-${item.id}`}>
      <div><span className="cut-ticket-kicker">Item do evento</span><strong>{item.name}</strong><span>{money(item.price)}</span>{item.description && <small>{item.description}</small>}</div>
      <Form.Control type="number" min="0" max="50" value={quantities[`item:${item.id}`] || 0} onChange={(event) => setQuantity("item", item.id, event.target.value)} style={{ width: 82 }} />
    </div>)}

    <div className="d-flex align-items-center justify-content-between mt-3"><strong>Total</strong><strong>{money(total)}</strong></div>
    <Button className="w-100 mt-3" onClick={continueToCheckout} disabled={total <= 0 || !checkoutAvailable}>
      <i className="fa-solid fa-lock me-2" />{user ? "Continuar para pagamento" : "Entrar para comprar"}
    </Button>
    <small className="d-block text-secondary mt-2 text-center"><i className="fa-solid fa-shield-halved me-1" />Checkout protegido pelo Mercado Pago</small>
  </div>;
}

EventCommercePanel.propTypes = {
  slug: PropTypes.string.isRequired,
  eventId: PropTypes.number.isRequired,
  user: PropTypes.shape({ id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]), email: PropTypes.string }),
  onLoginRequired: PropTypes.func,
};

EventCommercePanel.defaultProps = { user: null, onLoginRequired: null };
