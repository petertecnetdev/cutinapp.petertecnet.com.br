import React, { useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { Alert, Button, Form } from "react-bootstrap";
import { useLocation, useNavigate } from "react-router-dom";
import commerceService from "../../services/CommerceService";
import { checkoutQuantityLimit, resolveCheckoutQuantity } from "../../utils/checkoutAddOns";
import { reconcileStoredSelection } from "../../utils/checkoutSelectionRecovery";
import { clearEventCart, readEventCart, writeEventCart } from "../../utils/eventCartStorage";
import { safeRemoveSessionItem } from "../../utils/safeStorage";

const money = (value) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
// Um preço ausente não equivale a ingresso gratuito. Zero só vale se explícito.
const hasKnownPrice = (value) => {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0;
  return typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value.trim()) && Number.isFinite(Number(value));
};
const isTrue = (value) => value === true || value === 1 || ["true", "1"].includes(String(value).toLowerCase());
const isPriceUnknown = (ticket) => [false, "false", 0, "0"].includes(ticket?.price_known);
const isInformationalTicket = (ticket) => isTrue(ticket?.informational_only) || isTrue(ticket?.curatorial_information_only);
const isSelectableTicket = (ticket) => Boolean(ticket)
  && !isInformationalTicket(ticket)
  && !isPriceUnknown(ticket)
  && hasKnownPrice(ticket.price)
  && ticket.available !== false
  && ticket.expired !== true;
const ticketPriceLabel = (ticket) => hasKnownPrice(ticket?.price) ? money(ticket.price) : "Preço não confirmado";

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
  if (item?.informational_only) return "Ficha informativa — vendas e emissão desabilitadas";
  if (item?.expired) return "Venda encerrada";
  if (soldOut) return "Esgotado";
  const rawStock = item?.remaining ?? item?.quantity;
  if (rawStock == null || rawStock === "") return "Disponível";
  const remaining = resolveCheckoutQuantity(item, limit, limit);
  return `${remaining} disponível${remaining === 1 ? "" : "is"}`;
};

export default function EventCommercePanel({ slug, eventId, user, onLoginRequired }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [catalog, setCatalog] = useState({ tickets: [], items: [], available_dates: [] });
  const [quantities, setQuantities] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [restoredSelection, setRestoredSelection] = useState(false);
  const catalogRequestVersion = useRef(0);

  const applyCatalog = (response, targetSlug, { announceRestore = true } = {}) => {
    const nextCatalog = response || { tickets: [], items: [], available_dates: [] };
    const stored = readEventCart(targetSlug);
    const recovered = reconcileStoredSelection(nextCatalog, stored, Number(nextCatalog?.event?.id || eventId));
    const allowedTicketIds = new Set((nextCatalog.tickets || []).filter(isSelectableTicket).map((ticket) => String(ticket.id)));
    const restored = Object.fromEntries(Object.entries(recovered).filter(([key]) =>
      !key.startsWith("ticket:") || allowedTicketIds.has(key.slice("ticket:".length))
    ));
    // Um carrinho persistido pode ter sido criado antes de a ficha virar informativa.
    // Remover entradas inválidas também do armazenamento, não apenas da UI.
    if ((stored?.tickets || []).some((entry) => !allowedTicketIds.has(String(entry?.id)))) {
      const tickets = (nextCatalog.tickets || [])
        .filter((ticket) => allowedTicketIds.has(String(ticket.id)) && Number(restored[`ticket:${ticket.id}`] || 0) > 0)
        .map((ticket) => ({ id: ticket.id, quantity: restored[`ticket:${ticket.id}`] }));
      const items = (nextCatalog.items || [])
        .filter((item) => Number(restored[`item:${item.id}`] || 0) > 0)
        .map((item) => ({ id: item.id, quantity: restored[`item:${item.id}`] }));
      if (tickets.length || items.length) writeEventCart(targetSlug, {
        eventId: Number(nextCatalog?.event?.id || eventId),
        eventDate: nextCatalog?.event?.start_date || null,
        tickets,
        items,
      });
      else clearEventCart(targetSlug);
    }
    setCatalog(nextCatalog);
    setQuantities(restored);

    const restoredQuantity = Object.values(restored).reduce((sum, quantity) => sum + Number(quantity || 0), 0);
    setRestoredSelection(announceRestore && restoredQuantity > 0);
    if (announceRestore && restoredQuantity > 0) {
      trackCommerce("event_purchase_selection_restored", {
        label: "Seleção válida restaurada no evento",
        target: targetSlug,
        metadata: { event_id: Number(nextCatalog?.event?.id || eventId), quantity: restoredQuantity },
      });
    }
  };

  const loadCatalog = async (targetSlug) => {
    const version = ++catalogRequestVersion.current;
    setLoading(true);
    setError("");
    try {
      const response = await commerceService.catalog(targetSlug);
      if (version === catalogRequestVersion.current) applyCatalog(response, targetSlug);
    } catch (err) {
      if (version === catalogRequestVersion.current) setError(err?.message || "Não foi possível carregar as opções de compra.");
    } finally {
      if (version === catalogRequestVersion.current) setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    const version = ++catalogRequestVersion.current;
    setLoading(true);
    setError("");
    commerceService.catalog(slug)
      .then((response) => {
        if (!active || version !== catalogRequestVersion.current) return;
        applyCatalog(response, slug);
      })
      .catch((err) => active && version === catalogRequestVersion.current && setError(err?.message || "Não foi possível carregar as opções de compra."))
      .finally(() => active && version === catalogRequestVersion.current && setLoading(false));
    return () => { active = false; };
  }, [slug]);

  const selected = useMemo(() => {
    const tickets = (catalog.tickets || []).filter((item) => isSelectableTicket(item) && Number(quantities[`ticket:${item.id}`] || 0) > 0);
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
  const paymentConnected = catalog?.payment_config?.available ?? catalog?.payment_config?.connected ?? false;
  const requiresPayment = total > 0;
  const checkoutAvailable = !salesClosed && (!requiresPayment || paymentConnected);
  const activeEventId = Number(catalog?.event?.id || eventId);
  const activeSlug = catalog?.event?.slug || slug;
  const availableDates = catalog?.available_dates || [];

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (document.visibilityState === "hidden") return;
      const version = catalogRequestVersion.current;
      try {
        const response = await commerceService.catalog(activeSlug, { force: true });
        if (active && version === catalogRequestVersion.current) applyCatalog(response, activeSlug, { announceRestore: false });
      } catch (_) {
        // Keep the last valid catalog while connectivity is unstable.
      }
    };

    const timer = window.setInterval(refresh, 30000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [activeSlug, eventId]);

  const persistSelection = (nextQuantities) => {
    const tickets = (catalog.tickets || []).filter(isSelectableTicket).map((item) => ({ id: item.id, quantity: Number(nextQuantities[`ticket:${item.id}`] || 0) })).filter((item) => item.quantity > 0);
    const items = (catalog.items || []).map((item) => ({ id: item.id, quantity: Number(nextQuantities[`item:${item.id}`] || 0) })).filter((item) => item.quantity > 0);

    if (!tickets.length && !items.length) {
      clearEventCart(activeSlug);
      return;
    }

    writeEventCart(activeSlug, {
      eventId: activeEventId,
      eventDate: catalog?.event?.start_date || null,
      tickets,
      items,
    });
  };

  const setQuantity = (kind, id, value, availableMax = null) => {
    if (kind === "ticket" && !(catalog.tickets || []).some((ticket) => String(ticket.id) === String(id) && isSelectableTicket(ticket))) return;
    const configuredMax = checkoutQuantityLimit(kind);
    const max = availableMax === null ? configuredMax : Math.max(0, Math.min(configuredMax, Number(availableMax || 0)));
    const parsed = Math.max(0, Math.min(max, Number(value || 0)));
    const key = `${kind}:${id}`;
    setRestoredSelection(false);
    setError("");
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
    writeEventCart(activeSlug, checkout);

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
  if (error && !(catalog.tickets || []).length && !(catalog.items || []).length) return <Alert variant="danger" className="mb-0" data-pt-swal-ignore="true">
    <div className="d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-3">
      <span>{error}</span>
      <Button type="button" size="sm" variant="outline-light" onClick={() => loadCatalog(activeSlug)}>
        <i className="fa-solid fa-rotate-right me-2" />Tentar novamente
      </Button>
    </div>
  </Alert>;
  const curatorialTickets = (catalog.tickets || []).filter((ticket) => isInformationalTicket(ticket) || !hasKnownPrice(ticket.price) || isPriceUnknown(ticket));
  if (salesClosed) {
    if (curatorialTickets.length || ["unclaimed", "pending_claim"].includes(catalog?.event?.ownership_status)) {
      return <section className="mt-4" aria-label="Ingressos informativos">
        <Alert variant="secondary" className="mb-3">
          <strong>Ingressos informativos — vendas indisponíveis</strong>
          <span className="d-block mt-1">Estes valores foram divulgados publicamente. A produção ainda não habilitou vendas pela plataforma. Não é possível comprar, reservar ou emitir QR Code por aqui.</span>
        </Alert>
        {curatorialTickets.length > 0
          ? <div className="cut-ticket-shop__list">
            {curatorialTickets.map((ticket) => <div className="cut-ticket-shop__option" key={ticket.id}>
              <div className="cut-ticket-shop__option-copy">
                <span className="cut-ticket-kicker">Valor divulgado · sem venda</span>
                <strong>{ticket.name}</strong>
                <span>{ticketPriceLabel(ticket)}{Number(ticket.curatorial_bundle_size || 1) > 1 ? ` · pacote de ${ticket.curatorial_bundle_size} ingressos` : ""}</span>
                {ticket.curatorial_price_observed_at && <small>Valor observado em {String(ticket.curatorial_price_observed_at).slice(0, 10).split("-").reverse().join("/")}; sujeito a alteração.</small>}
              </div>
              <span className="cut-ticket-shop__sold-badge">Indisponível para compra</span>
            </div>)}
          </div>
          : <p className="text-secondary small">Tipos e preços ainda não foram confirmados pela curadoria.</p>}
      </section>;
    }
    return <Alert variant="secondary" className="mt-4 mb-0"><strong>Vendas encerradas.</strong><span className="d-block mt-1">Ingressos e itens antecipados não podem mais ser adquiridos para esta edição.</span></Alert>;
  }
  if (!(catalog.tickets || []).length && !(catalog.items || []).length && availableDates.length <= 1) return null;

  return <div className="cut-commerce-panel mt-4">

    {error && <Alert variant="danger" className="mb-0" data-pt-swal-ignore="true">{error}</Alert>}
    {requiresPayment && !paymentConnected && <Alert variant="warning" className="mb-0">Pagamentos temporariamente indisponíveis para esta data.</Alert>}

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
            <div><span className="cut-eyebrow">Ingressos</span><h3 className="mt-2">Escolha quantidade e tipo</h3><p>Ingressos gratuitos e pagos seguem o mesmo fluxo. Use + e − em cada lote e combine tipos diferentes no mesmo pedido.</p></div>
          </div>
          <div className="cut-ticket-shop__list">
            {(catalog.tickets || []).map((ticket) => {
              const maxQuantity = resolveCheckoutQuantity(ticket, checkoutQuantityLimit("ticket"), checkoutQuantityLimit("ticket"));
              const blocked = !isSelectableTicket(ticket);
              const soldOut = blocked || maxQuantity <= 0;
              const quantity = blocked ? 0 : Number(quantities[`ticket:${ticket.id}`] || 0);
              const subtotal = hasKnownPrice(ticket.price) ? Number(ticket.price) * quantity : 0;
              return <div className={`cut-ticket-shop__option ${soldOut ? "cut-ticket-shop__option--sold-out" : ""}`} key={`paid-ticket-${ticket.id}`} aria-disabled={soldOut}>
                <div className="cut-ticket-shop__option-copy">
                  <span className="cut-ticket-kicker">Ingresso · {dateLabel(catalog?.event?.start_date)}</span>
                  <strong>{ticket.name}</strong>
                  <span>{quantity > 0 ? `${quantity} × ${ticketPriceLabel(ticket)} · ${money(subtotal)}` : ticketPriceLabel(ticket)}</span>
                  <small>{stockLabel(ticket, soldOut, checkoutQuantityLimit("ticket"))}</small>
                </div>
                {soldOut
                  ? <span className="cut-ticket-shop__sold-badge">{isInformationalTicket(ticket) ? "Somente consulta" : !hasKnownPrice(ticket.price) || isPriceUnknown(ticket) ? "Preço não confirmado" : ticket.expired ? "Encerrado" : "Esgotado"}</span>
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
                  <button type="button" className="cut-ticket-shop__item-detail" onClick={() => navigate(`/event/${encodeURIComponent(activeSlug)}/item/${item.id}`)}>Ver detalhes do item <i className="fa-solid fa-arrow-right" /></button>
                </div>
                {soldOut
                  ? <span className="cut-ticket-shop__sold-badge">{item.expired ? "Encerrado" : "Esgotado"}</span>
                  : <QuantityStepper kind="item" id={item.id} value={quantity} max={maxQuantity} label={item.name} />}
              </div>;
            })}
          </div>
        </>}
      </div>

      <aside className="cut-ticket-shop__summary" aria-label="Resumo da compra">
        <div className="cut-ticket-shop__summary-head">
          <small>Resumo da compra</small>
        </div>

        {selectedEntries.length > 0 ? <div className="cut-ticket-shop__summary-items">
          {selectedEntries.map(({ kind, item, quantity }) => <div className="cut-ticket-shop__summary-item" key={`summary-${kind}-${item.id}`}>
            <div>
              <strong>{item.name}</strong>
              <span>{quantity} × {money(item.price)}</span>
            </div>
            <b>{money(Number(item.price || 0) * quantity)}</b>
          </div>)}
        </div> : <div className="cut-ticket-shop__summary-empty">Escolha seus ingressos usando os botões + e −.</div>}

        <div className="cut-ticket-shop__summary-footer">
          <div className="cut-ticket-shop__summary-line cut-ticket-shop__summary-line--total">
            <span>Total</span>
            <strong>{money(total)}</strong>
          </div>
          <button
            type="button"
            className="cut-ticket-shop__checkout-btn"
            onClick={continueToCheckout}
            disabled={selectedQuantity <= 0 || !checkoutAvailable}
            aria-label={`${user ? "Continuar para checkout" : "Entrar e continuar"} com ${selectedQuantity} item${selectedQuantity === 1 ? "" : "s"}, total ${money(total)}`}
          >
            {user ? "Comprar ingressos" : "Entrar e comprar"}
            <i className={`fa-solid ${user ? "fa-arrow-right" : "fa-right-to-bracket"} ms-2`} aria-hidden="true" />
          </button>
          <p className="cut-ticket-shop__summary-note">Preço e disponibilidade serão revalidados antes de qualquer cobrança.</p>
          <p className="cut-ticket-shop__summary-note">
            Ao prosseguir para a compra, você concorda com a <a href="https://fastix.com.br/purchase" target="_blank" rel="noopener noreferrer" className="text-decoration-underline">Política de Compra</a> e os <a href="https://fastix.com.br/terms" target="_blank" rel="noopener noreferrer" className="text-decoration-underline">Termos de Uso</a> da FasTix.
          </p>
        </div>
      </aside>
    </div>

    {selectedQuantity > 0 && <small className="d-block text-success text-center"><i className="fa-solid fa-clock-rotate-left me-1" />Sua seleção fica salva neste navegador e será revalidada ao retornar.</small>}
    <div className="cut-ticket-shop__trust"><i className="fa-solid fa-shield-halved" /><span>Um único pedido. Ingressos gratuitos entram normalmente com valor R$ 0,00; pedidos com valor usam o pagamento disponível. Cada ingresso recebe QR de entrada e check-in normal.</span></div>
  </div>;
}

EventCommercePanel.propTypes = {
  slug: PropTypes.string.isRequired,
  eventId: PropTypes.number.isRequired,
  user: PropTypes.shape({ id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]), email: PropTypes.string }),
  onLoginRequired: PropTypes.func,
};

EventCommercePanel.defaultProps = { user: null, onLoginRequired: null };
