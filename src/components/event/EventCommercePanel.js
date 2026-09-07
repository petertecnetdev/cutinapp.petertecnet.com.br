import React, { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { Alert, Button, Form } from "react-bootstrap";
import { useLocation, useNavigate } from "react-router-dom";
import commerceService from "../../services/CommerceService";
import { resolveCheckoutQuantity } from "../../utils/checkoutAddOns";
import { reconcileStoredSelection } from "../../utils/checkoutSelectionRecovery";
import { safeGetSessionJson, safeRemoveSessionItem, safeSetSessionJson } from "../../utils/safeStorage";

const money = (value) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
const dateLabel = (value) => {
  if (!value) return "Data do evento";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }).format(date);
};

const trackCommerce = (type, details = {}) => {
  try {
    window.PeterTecnetTelemetry?.track?.(type, details);
  } catch (_) {
    // Telemetry must never interrupt ticket selection.
  }
};

const stockLabel = (item, soldOut, limit) => {
  if (item?.expired) return "Venda encerrada";
  if (soldOut) return "Esgotado";
  const rawStock = item?.remaining ?? item?.quantity;
  if (rawStock == null || rawStock === "") return "Disponível";
  const remaining = resolveCheckoutQuantity(item, limit, limit);
  return `${remaining} disponível${remaining === 1 ? "" : "is"}`;
};

const checkoutStorageKey = (slug) => `cutinapp_checkout_${slug}`;

export default function EventCommercePanel({ slug, eventId, user, onLoginRequired }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [catalog, setCatalog] = useState({ tickets: [], items: [], available_dates: [] });
  const [quantities, setQuantities] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const applyCatalog = (response, targetSlug) => {
    const nextCatalog = response || { tickets: [], items: [], available_dates: [] };
    const restored = reconcileStoredSelection(
      nextCatalog,
      safeGetSessionJson(checkoutStorageKey(targetSlug)),
      eventId,
    );
    setCatalog(nextCatalog);
    setQuantities(restored);

    const restoredQuantity = Object.values(restored).reduce((sum, quantity) => sum + Number(quantity || 0), 0);
    if (restoredQuantity > 0) {
      trackCommerce("event_purchase_selection_restored", {
        label: "Seleção válida restaurada no evento",
        target: targetSlug,
        metadata: {
          event_id: Number(nextCatalog?.event?.id || eventId),
          quantity: restoredQuantity,
        },
      });
    }
  };

  const loadCatalog = async (targetSlug) => {
    setLoading(true);
    setError("");
    try {
      const response = await commerceService.catalog(targetSlug);
      applyCatalog(response, targetSlug);
    } catch (err) {
      setError(err?.message || "Não foi possível carregar as opções de compra.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    commerceService.catalog(slug)
      .then((response) => {
        if (!active) return;
        applyCatalog(response, slug);
      })
      .catch((err) => active && setError(err?.message || "Não foi possível carregar as opções de compra."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [slug]);

  const selected = useMemo(() => {
    const tickets = (catalog.tickets || []).filter((item) => item.available !== false && Number(quantities[`ticket:${item.id}`] || 0) > 0);
    const items = (catalog.items || []).filter((item) => item.available !== false && Number(quantities[`item:${item.id}`] || 0) > 0);
    return { tickets, items };
  }, [catalog, quantities]);

  const total = useMemo(() => {
    const ticketTotal = selected.tickets.reduce((sum, item) => sum + Number(item.price) * Number(quantities[`ticket:${item.id}`] || 0), 0);
    const itemTotal = selected.items.reduce((sum, item) => sum + Number(item.price) * Number(quantities[`item:${item.id}`] || 0), 0);
    return ticketTotal + itemTotal;
  }, [selected, quantities]);

  const selectedQuantity = useMemo(() => (
    [...selected.tickets.map((item) => ({ kind: "ticket", item })), ...selected.items.map((item) => ({ kind: "item", item }))]
      .reduce((sum, entry) => sum + Number(quantities[`${entry.kind}:${entry.item.id}`] || 0), 0)
  ), [selected, quantities]);

  const salesClosed = Boolean(catalog?.sales_closed || catalog?.event?.sales_closed);
  const checkoutAvailable = !salesClosed && (catalog?.payment_config?.available ?? catalog?.payment_config?.connected ?? false);
  const activeEventId = Number(catalog?.event?.id || eventId);
  const activeSlug = catalog?.event?.slug || slug;
  const availableDates = catalog?.available_dates || [];

  const persistSelection = (nextQuantities) => {
    const tickets = (catalog.tickets || [])
      .map((item) => ({ id: item.id, quantity: Number(nextQuantities[`ticket:${item.id}`] || 0) }))
      .filter((item) => item.quantity > 0);
    const items = (catalog.items || [])
      .map((item) => ({ id: item.id, quantity: Number(nextQuantities[`item:${item.id}`] || 0) }))
      .filter((item) => item.quantity > 0);

    if (!tickets.length && !items.length) {
      safeRemoveSessionItem(checkoutStorageKey(activeSlug));
      return;
    }

    safeSetSessionJson(checkoutStorageKey(activeSlug), {
      eventId: activeEventId,
      eventDate: catalog?.event?.start_date || null,
      tickets,
      items,
    });
  };

  const setQuantity = (kind, id, value, availableMax = null) => {
    const configuredMax = kind === "ticket" ? 20 : 50;
    const max = availableMax === null ? configuredMax : Math.max(0, Math.min(configuredMax, Number(availableMax || 0)));
    const parsed = Math.max(0, Math.min(max, Number(value || 0)));
    const key = `${kind}:${id}`;
    setQuantities((current) => {
      const next = { ...current, [key]: parsed };
      persistSelection(next);
      return next;
    });
    trackCommerce("event_purchase_quantity_changed", {
      label: kind === "ticket" ? "Quantidade de ingresso alterada" : "Quantidade de item alterada",
      target: activeSlug,
      metadata: {
        event_id: activeEventId,
        item_type: kind,
        item_id: Number(id),
        quantity: parsed,
      },
    });
  };

  const QuantityStepper = ({ kind, id, value, max, label }) => {
    const quantity = Number(value || 0);
    return <div className="d-inline-flex align-items-center gap-2" role="group" aria-label={`Quantidade de ${label}`}>
      <Button type="button" variant="outline-secondary" className="rounded-circle p-0 d-inline-flex align-items-center justify-content-center" style={{ width: 42, height: 42 }} onClick={() => setQuantity(kind, id, quantity - 1, max)} disabled={quantity <= 0} aria-label={`Remover uma unidade de ${label}`}><i className="fa-solid fa-minus" /></Button>
      <output className="fw-bold text-center" style={{ minWidth: 28 }} aria-live="polite">{quantity}</output>
      <Button type="button" variant="outline-primary" className="rounded-circle p-0 d-inline-flex align-items-center justify-content-center" style={{ width: 42, height: 42 }} onClick={() => setQuantity(kind, id, quantity + 1, max)} disabled={quantity >= max} aria-label={`Adicionar uma unidade de ${label}`}><i className="fa-solid fa-plus" /></Button>
    </div>;
  };

  QuantityStepper.propTypes = {
    kind: PropTypes.oneOf(["ticket", "item"]).isRequired,
    id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
    value: PropTypes.number,
    max: PropTypes.number.isRequired,
    label: PropTypes.string.isRequired,
  };
  QuantityStepper.defaultProps = { value: 0 };

  const handleDateChange = (nextSlug) => {
    if (!nextSlug || nextSlug === activeSlug) return;
    loadCatalog(nextSlug);
  };

  const continueToCheckout = () => {
    if (salesClosed) {
      setError("As vendas deste evento já foram encerradas.");
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
      eventId: activeEventId,
      eventDate: catalog?.event?.start_date || null,
      tickets: selected.tickets.map((item) => ({ id: item.id, quantity: Number(quantities[`ticket:${item.id}`]) })),
      items: selected.items.map((item) => ({ id: item.id, quantity: Number(quantities[`item:${item.id}`]) })),
    };
    const checkoutPath = `/checkout/${activeSlug}`;

    safeRemoveSessionItem(`cutinapp_payment_${activeSlug}`);
    safeSetSessionJson(checkoutStorageKey(activeSlug), checkout);

    if (!user) {
      trackCommerce("event_purchase_login_required", {
        label: "Seleção preservada antes do login",
        target: activeSlug,
        metadata: {
          event_id: activeEventId,
          amount: Number(total.toFixed(2)),
          quantity: selectedQuantity,
        },
      });
      onLoginRequired?.(checkoutPath);
      return;
    }

    trackCommerce("event_purchase_checkout_started", {
      label: "Seleção enviada ao checkout",
      target: activeSlug,
      metadata: {
        event_id: activeEventId,
        amount: Number(total.toFixed(2)),
        quantity: selectedQuantity,
        ticket_quantity: selected.tickets.reduce((sum, item) => sum + Number(quantities[`ticket:${item.id}`] || 0), 0),
        item_quantity: selected.items.reduce((sum, item) => sum + Number(quantities[`item:${item.id}`] || 0), 0),
      },
    });

    navigate(checkoutPath, { state: { checkout, from: `${location.pathname}${location.search}` } });
  };

  if (loading) return <p className="text-secondary mb-0">Carregando opções de compra...</p>;
  if (salesClosed) return <Alert variant="secondary" className="mt-4 mb-0"><strong>Vendas encerradas.</strong><span className="d-block mt-1">Ingressos e itens antecipados não podem mais ser adquiridos para esta edição.</span></Alert>;
  if (!(catalog.tickets || []).length && !(catalog.items || []).length && availableDates.length <= 1) return null;

  return <div className="cut-commerce-panel mt-4">
    <span className="cut-eyebrow">Comprar</span>
    <h3 className="cut-section-title mt-2">Ingressos e itens antecipados</h3>
    <p className="text-secondary small">Escolha a data, seus ingressos e, se quiser, itens do estabelecimento para retirar no evento por QR Code.</p>
    {error && <Alert variant="danger">{error}</Alert>}
    {!checkoutAvailable && <Alert variant="warning">Pagamentos temporariamente indisponíveis para esta data.</Alert>}

    {availableDates.length > 1 && <div className="mb-3">
      <Form.Label className="fw-semibold">Para qual data você quer comprar?</Form.Label>
      <Form.Select value={activeSlug} onChange={(event) => handleDateChange(event.target.value)} aria-label="Escolha a data do evento">
        {availableDates.map((date) => <option key={date.event_id} value={date.slug}>{dateLabel(date.date || date.start_date)}</option>)}
      </Form.Select>
      <small className="text-secondary d-block mt-1">Ingressos e estoque abaixo são exclusivos da data selecionada.</small>
    </div>}

    {(catalog.tickets || []).map((ticket) => {
      const maxQuantity = resolveCheckoutQuantity(ticket, 20, 20);
      const soldOut = maxQuantity <= 0;
      return <div className={`cut-ticket-option ${soldOut ? "opacity-50" : ""}`} key={`paid-ticket-${ticket.id}`} aria-disabled={soldOut}><div><span className="cut-ticket-kicker">Ingresso · {dateLabel(catalog?.event?.start_date)}</span><strong>{ticket.name}</strong><span>{money(ticket.price)}</span><small className={soldOut ? "text-secondary" : "text-success"}>{stockLabel(ticket, soldOut, 20)}</small></div>{soldOut ? <Button variant="secondary" disabled>{ticket.expired ? "Encerrado" : "Esgotado"}</Button> : <QuantityStepper kind="ticket" id={ticket.id} value={Number(quantities[`ticket:${ticket.id}`] || 0)} max={maxQuantity} label={ticket.name} />}</div>;
    })}

    {(catalog.items || []).map((item) => {
      const maxQuantity = resolveCheckoutQuantity(item, 50, 50);
      const soldOut = maxQuantity <= 0;
      return <div className={`cut-ticket-option ${soldOut ? "opacity-50" : ""}`} key={`event-item-${item.id}`} aria-disabled={soldOut}><div><span className="cut-ticket-kicker">Retirada no evento</span><strong>{item.name}</strong><span>{money(item.price)}</span>{item.description && <small>{item.description}</small>}<small className={soldOut ? "text-secondary" : "text-success"}>{stockLabel(item, soldOut, 50)}</small></div>{soldOut ? <Button variant="secondary" disabled>{item.expired ? "Encerrado" : "Esgotado"}</Button> : <QuantityStepper kind="item" id={item.id} value={Number(quantities[`item:${item.id}`] || 0)} max={maxQuantity} label={item.name} />}</div>;
    })}

    <div className="d-flex align-items-center justify-content-between mt-3"><strong>{selectedQuantity > 0 ? `${selectedQuantity} selecionado${selectedQuantity === 1 ? "" : "s"}` : "Total"}</strong><strong>{money(total)}</strong></div>
    {selectedQuantity > 0 && <small className="d-block text-success mt-2 text-center"><i className="fa-solid fa-clock-rotate-left me-1" />Sua seleção fica salva neste navegador e será revalidada ao retornar.</small>}
    <Button className="w-100 mt-3" onClick={continueToCheckout} disabled={total <= 0 || !checkoutAvailable}><i className="fa-solid fa-lock me-2" />{user ? `Continuar · ${money(total)}` : "Entrar para comprar"}</Button>
    <small className="d-block text-secondary mt-2 text-center"><i className="fa-solid fa-shield-halved me-1" />Ingressos usam QR de entrada; itens antecipados usam QR de retirada.</small>
  </div>;
}

EventCommercePanel.propTypes = {
  slug: PropTypes.string.isRequired,
  eventId: PropTypes.number.isRequired,
  user: PropTypes.shape({ id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]), email: PropTypes.string }),
  onLoginRequired: PropTypes.func,
};

EventCommercePanel.defaultProps = { user: null, onLoginRequired: null };
