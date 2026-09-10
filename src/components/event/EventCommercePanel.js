import React, { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { Alert, Button, Form } from "react-bootstrap";
import { useLocation, useNavigate } from "react-router-dom";
import commerceService from "../../services/CommerceService";
import { checkoutQuantityLimit, resolveCheckoutQuantity } from "../../utils/checkoutAddOns";
import { reconcileStoredSelection } from "../../utils/checkoutSelectionRecovery";
import { safeGetSessionJson, safeRemoveSessionItem, safeSetSessionJson } from "../../utils/safeStorage";
import "../../styles/event-ticket-purchase.css";

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
  const [restoredSelection, setRestoredSelection] = useState(false);

  const applyCatalog = (response, targetSlug) => {
    const nextCatalog = response || { tickets: [], items: [], available_dates: [] };
    const restored = reconcileStoredSelection(nextCatalog, safeGetSessionJson(checkoutStorageKey(targetSlug)), eventId);
    setCatalog(nextCatalog);
    setQuantities(restored);

    const restoredQuantity = Object.values(restored).reduce((sum, quantity) => sum + Number(quantity || 0), 0);
    setRestoredSelection(restoredQuantity > 0);
    if (restoredQuantity > 0) {
      trackCommerce("event_purchase_selection_restored", {
        label: "Seleção válida restaurada no evento",
        target: targetSlug,
        metadata: { event_id: Number(nextCatalog?.event?.id || eventId), quantity: restoredQuantity },
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

  const selectedEntries = useMemo(() => [
    ...selected.tickets.map((item) => ({ kind: "ticket", item, quantity: Number(quantities[`ticket:${item.id}`] || 0) })),
    ...selected.items.map((item) => ({ kind: "item", item, quantity: Number(quantities[`item:${item.id}`] || 0) })),
  ], [selected, quantities]);

  const total = useMemo(() => selectedEntries.reduce(
    (sum, entry) => sum + (Number(entry.item.price || 0) * entry.quantity),
    0,
  ), [selectedEntries]);

  const selectedQuantity = useMemo(() => selectedEntries.reduce((sum, entry) => sum + entry.quantity, 0), [selectedEntries]);

  const salesClosed = Boolean(catalog?.sales_closed || catalog?.event?.sales_closed);
  const checkoutAvailable = !salesClosed && (catalog?.payment_config?.available ?? catalog?.payment_config?.connected ?? false);
  const activeEventId = Number(catalog?.event?.id || eventId);
  const activeSlug = catalog?.event?.slug || slug;
  const availableDates = catalog?.available_dates || [];

  const persistSelection = (nextQuantities) => {
    const tickets = (catalog.tickets || []).map((item) => ({ id: item.id, quantity: Number(nextQuantities[`ticket:${item.id}`] || 0) })).filter((item) => item.quantity > 0);
    const items = (catalog.items || []).map((item) => ({ id: item.id, quantity: Number(nextQuantities[`item:${item.id}`] || 0) })).filter((item) => item.quantity > 0);

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
    const configuredMax = checkoutQuantityLimit(kind);
    const max = availableMax === null ? configuredMax : Math.max(0, Math.min(configuredMax, Number(availableMax || 0)));
    const parsed = Math.max(0, Math.min(max, Number(value || 0)));
    const key = `${kind}:${id}`;
    setRestoredSelection(false);
    setQuantities((current) => {
      const next = { ...current, [key]: parsed };
      persistSelection(next);
      return next;
    });
    trackCommerce("event_purchase_quantity_changed", {
      label: kind === "ticket" ? "Quantidade de ingresso alterada" : "Quantidade de item alterada",
      target: activeSlug,
      metadata: { event_id: activeEventId, item_type: kind, item_id: Number(id), quantity: parsed },
    });
  };

  const QuantityStepper = ({ kind, id, value, max, label }) => {
    const quantity = Number(value || 0);
    return <div className="cut-ticket-shop__stepper" role="group" aria-label={`Quantidade de ${label}`}>
      <button type="button" onClick={() => setQuantity(kind, id, quantity - 1, max)} disabled={quantity <= 0} aria-label={`Remover uma unidade de ${label}`}><i className="fa-solid fa-minus" /></button>
      <output aria-live="polite">{quantity}</output>
      <button type="button" onClick={() => setQuantity(kind, id, quantity + 1, max)} disabled={quantity >= max} aria-label={`Adicionar uma unidade de ${label}`}><i className="fa-solid fa-plus" /></button>
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
        metadata: { event_id: activeEventId, amount: Number(total.toFixed(2)), quantity: selectedQuantity },
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

  const resumeRestoredCheckout = () => {
    trackCommerce("event_purchase_selection_resumed", {
      label: "Compra retomada após restaurar seleção",
      target: activeSlug,
      metadata: { event_id: activeEventId, amount: Number(total.toFixed(2)), quantity: selectedQuantity },
    });
    continueToCheckout();
  };

  if (loading) return <p className="text-secondary mb-0">Carregando opções de compra...</p>;
  if (salesClosed) return <Alert variant="secondary" className="mt-4 mb-0"><strong>Vendas encerradas.</strong><span className="d-block mt-1">Ingressos e itens antecipados não podem mais ser adquiridos para esta edição.</span></Alert>;
  if (!(catalog.tickets || []).length && !(catalog.items || []).length && availableDates.length <= 1) return null;

  return <div className="cut-commerce-panel mt-4">
    <div className="cut-ticket-shop__heading">
      <div>
        <span className="cut-eyebrow">Compra única</span>
        <h3 className="mt-2">Monte seu carrinho</h3>
        <p>Você pode comprar vários ingressos, misturar lotes diferentes e incluir itens do evento no mesmo pagamento.</p>
      </div>
    </div>

    {error && <Alert variant="danger" className="mb-0">{error}</Alert>}
    {!checkoutAvailable && <Alert variant="warning" className="mb-0">Pagamentos temporariamente indisponíveis para esta data.</Alert>}

    <div className="cut-ticket-shop__layout">
      <div className="cut-ticket-shop__catalog">
    {restoredSelection && selectedQuantity > 0 && checkoutAvailable && <Alert variant="success" className="mb-0">
      <div className="d-flex flex-column gap-2">
        <div><strong>Compra em andamento recuperada.</strong><span className="d-block small">{selectedQuantity} selecionado{selectedQuantity === 1 ? "" : "s"} · {money(total)}. Preço e disponibilidade serão revalidados antes do pagamento.</span></div>
        <Button type="button" variant="success" size="sm" onClick={resumeRestoredCheckout}>{user ? `Continuar compra · ${money(total)}` : "Entrar e continuar"}</Button>
      </div>
    </Alert>}

    {availableDates.length > 1 && <div>
      <Form.Label className="fw-semibold">Data do evento</Form.Label>
      <Form.Select value={activeSlug} onChange={(event) => handleDateChange(event.target.value)} aria-label="Escolha a data do evento">
        {availableDates.map((date) => <option key={date.event_id} value={date.slug}>{dateLabel(date.date || date.start_date)}</option>)}
      </Form.Select>
      <small className="text-secondary d-block mt-1">Ingressos e estoque são exclusivos da data selecionada.</small>
    </div>}

    {(catalog.tickets || []).length > 0 && <>
      <div className="cut-ticket-shop__heading mt-1">
        <div><span className="cut-eyebrow">Ingressos pagos</span><h3 className="mt-2">Escolha quantidade e tipo</h3><p>Use + e − em cada lote. Você pode selecionar mais de um tipo de ingresso na mesma compra.</p></div>
      </div>
      <div className="cut-ticket-shop__list">
      {(catalog.tickets || []).map((ticket) => {
        const maxQuantity = resolveCheckoutQuantity(ticket, checkoutQuantityLimit("ticket"), checkoutQuantityLimit("ticket"));
        const soldOut = maxQuantity <= 0;
        const quantity = Number(quantities[`ticket:${ticket.id}`] || 0);
        const subtotal = Number(ticket.price || 0) * quantity;
        return <div className={`cut-ticket-shop__option ${soldOut ? "cut-ticket-shop__option--sold-out" : ""}`} key={`paid-ticket-${ticket.id}`} aria-disabled={soldOut}>
          <div className="cut-ticket-shop__option-copy">
            <span className="cut-ticket-kicker">Ingresso · {dateLabel(catalog?.event?.start_date)}</span>
            <strong>{ticket.name}</strong>
            <span>{quantity > 0 ? `${quantity} × ${money(ticket.price)} · ${money(subtotal)}` : money(ticket.price)}</span>
            <small>{stockLabel(ticket, soldOut, checkoutQuantityLimit("ticket"))}</small>
          </div>
          {soldOut
            ? <span className="cut-ticket-shop__sold-badge">{ticket.expired ? "Encerrado" : "Esgotado"}</span>
            : <QuantityStepper kind="ticket" id={ticket.id} value={quantity} max={maxQuantity} label={ticket.name} />}
        </div>;
      })}
    </div>
    </>}

    {(catalog.items || []).length > 0 && <>
      <div className="cut-ticket-shop__heading mt-2">
        <div><span className="cut-eyebrow">Itens do estabelecimento</span><h3 className="mt-2">Itens disponíveis neste evento</h3><p>Adicione bebidas, combos, porções e outros itens liberados pelo estabelecimento para esta edição.</p></div>
      </div>
      <div className="cut-ticket-shop__list">
        {(catalog.items || []).map((item) => {
          const maxQuantity = resolveCheckoutQuantity(item, checkoutQuantityLimit("item"), checkoutQuantityLimit("item"));
          const soldOut = maxQuantity <= 0;
          const quantity = Number(quantities[`item:${item.id}`] || 0);
          const subtotal = Number(item.price || 0) * quantity;
          return <div className={`cut-ticket-shop__option ${soldOut ? "cut-ticket-shop__option--sold-out" : ""}`} key={`event-item-${item.id}`} aria-disabled={soldOut}>
            <div className="cut-ticket-shop__option-copy">
              <span className="cut-ticket-kicker">Retirada no evento</span>
              <strong>{item.name}</strong>
              <span>{quantity > 0 ? `${quantity} × ${money(item.price)} · ${money(subtotal)}` : money(item.price)}</span>
              {item.description && <small>{item.description}</small>}
              <small>{stockLabel(item, soldOut, checkoutQuantityLimit("item"))}</small>
            </div>
            {soldOut
              ? <span className="cut-ticket-shop__sold-badge">{item.expired ? "Encerrado" : "Esgotado"}</span>
              : <QuantityStepper kind="item" id={item.id} value={quantity} max={maxQuantity} label={item.name} />}
          </div>;
        })}
      </div>
    </>}

      </div>

      <aside className="cut-ticket-shop__summary" aria-label="Resumo da seleção">
      <div className="cut-ticket-shop__summary-head">
        <span className="cut-ticket-shop__summary-count">×{selectedQuantity || 0}</span>
        <small>{selectedQuantity > 0 ? "Itens no carrinho" : "Carrinho vazio"}</small>
      </div>

      {selectedEntries.length > 0
        ? <div className="cut-ticket-shop__summary-items">{selectedEntries.map((entry) => <div className="cut-ticket-shop__summary-item" key={`summary-${entry.kind}-${entry.item.id}`}>
          <div><strong>{entry.item.name}</strong><span>{entry.quantity} × {money(entry.item.price)}</span></div>
          <b>{money(Number(entry.item.price || 0) * entry.quantity)}</b>
        </div>)}</div>
        : <div className="cut-ticket-shop__summary-empty">Use os botões + para adicionar ingressos ou itens.</div>}

      <div className="cut-ticket-shop__summary-footer">
        <div className="cut-ticket-shop__summary-line"><span>Subtotal</span><strong>{money(total)}</strong></div>
        <div className="cut-ticket-shop__summary-line"><span>Taxas</span><span>Calculadas no checkout</span></div>
        <div className="cut-ticket-shop__summary-line cut-ticket-shop__summary-line--total"><span>Total dos itens</span><strong>{money(total)}</strong></div>
        <p className="cut-ticket-shop__summary-note">O valor final, incluindo eventuais taxas de processamento, é confirmado antes do pagamento.</p>
        <button type="button" className="cut-ticket-shop__checkout-btn" onClick={continueToCheckout} disabled={total <= 0 || !checkoutAvailable}>{user ? `Finalizar carrinho · ${money(total)}` : "Entrar e finalizar carrinho"}</button>
      </div>
      </aside>
    </div>

    {selectedQuantity > 0 && <small className="d-block text-success text-center"><i className="fa-solid fa-clock-rotate-left me-1" />Sua seleção fica salva neste navegador e será revalidada ao retornar.</small>}
    <div className="cut-ticket-shop__trust"><i className="fa-solid fa-shield-halved" /><span>Uma única compra, um único pagamento. Cada ingresso recebe QR de entrada e os itens antecipados ficam vinculados ao pedido para retirada no evento.</span></div>
  </div>;
}

EventCommercePanel.propTypes = {
  slug: PropTypes.string.isRequired,
  eventId: PropTypes.number.isRequired,
  user: PropTypes.shape({ id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]), email: PropTypes.string }),
  onLoginRequired: PropTypes.func,
};

EventCommercePanel.defaultProps = { user: null, onLoginRequired: null };
