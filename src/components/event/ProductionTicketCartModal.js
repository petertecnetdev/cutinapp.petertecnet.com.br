import React, { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { Alert, Button, Form, Modal, Spinner } from "react-bootstrap";
import commerceService from "../../services/CommerceService";
import cutinappService from "../../services/CutinappService";
import { checkoutQuantityLimit, resolveCheckoutQuantity } from "../../utils/checkoutAddOns";
import { addTicketsToCommerceCart } from "../../utils/commerceCart";
import "../../styles/event-ticket-purchase.css";

const money = (value) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));

const dateLabel = (value) => {
  if (!value) return "Data a definir";
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
};

const trackCart = (type, details = {}) => {
  try {
    window.PeterTecnetTelemetry?.track?.(type, details);
  } catch (_) {
    // Telemetria nunca bloqueia o carrinho.
  }
};

export default function ProductionTicketCartModal({ show, onHide, productionSlug, currentEvent, onAdded }) {
  const [production, setProduction] = useState(null);
  const [events, setEvents] = useState([]);
  const [selectedSlug, setSelectedSlug] = useState("");
  const [catalog, setCatalog] = useState(null);
  const [quantities, setQuantities] = useState({});
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  const lockedToCurrentEvent = Boolean(currentEvent?.slug);

  useEffect(() => {
    if (!show) return undefined;

    setError("");
    setCatalog(null);
    setQuantities({});

    // Na página de um evento, o contexto já define qual evento receberá o ingresso.
    // Não carregamos a agenda da produção nem exibimos seletor de evento.
    if (lockedToCurrentEvent) {
      setLoadingEvents(false);
      setProduction(currentEvent?.production || null);
      setEvents([currentEvent]);
      setSelectedSlug(currentEvent.slug);
      return undefined;
    }

    if (!productionSlug) {
      setLoadingEvents(false);
      setEvents([]);
      setSelectedSlug("");
      setError("Não foi possível identificar esta produção.");
      return undefined;
    }

    let active = true;
    setLoadingEvents(true);

    cutinappService.publicProduction(productionSlug)
      .then(async (response) => {
        if (!active) return;
        const production = response?.production || null;
        const productionId = Number(production?.id || 0);
        const sellableResponse = productionId > 0
          ? await cutinappService.publicEvents({ production_id: productionId, available: 1, view: "compact", per_page: 24, sort: "soonest" })
          : null;
        const sellableUpcoming = sellableResponse?.events?.data || [];
        if (!active) return;
        setProduction(production);
        setEvents(sellableUpcoming);
        setSelectedSlug(sellableUpcoming[0]?.slug || "");
      })
      .catch((err) => {
        if (active) setError(err?.message || "Não foi possível carregar os próximos eventos desta produção.");
      })
      .finally(() => active && setLoadingEvents(false));

    return () => { active = false; };
  }, [show, productionSlug, currentEvent, lockedToCurrentEvent]);

  useEffect(() => {
    if (!show || !selectedSlug) {
      setCatalog(null);
      setQuantities({});
      return undefined;
    }

    let active = true;
    setLoadingCatalog(true);
    setError("");
    setCatalog(null);
    setQuantities({});

    commerceService.catalog(selectedSlug)
      .then((response) => {
        if (!active) return;
        setCatalog(response || { tickets: [] });
      })
      .catch((err) => {
        if (active) setError(err?.message || "Não foi possível carregar os ingressos deste evento.");
      })
      .finally(() => active && setLoadingCatalog(false));

    return () => { active = false; };
  }, [show, selectedSlug]);

  const selectedEvent = useMemo(
    () => events.find((item) => item.slug === selectedSlug) || catalog?.event || currentEvent || null,
    [events, selectedSlug, catalog, currentEvent],
  );

  const ticketRows = useMemo(() => (catalog?.tickets || []).map((ticket) => {
    const maxQuantity = resolveCheckoutQuantity(ticket, checkoutQuantityLimit("ticket"), checkoutQuantityLimit("ticket"));
    return {
      ticket,
      maxQuantity,
      quantity: Number(quantities[ticket.id] || 0),
    };
  }), [catalog, quantities]);

  const selectedTickets = useMemo(() => ticketRows
    .filter(({ quantity, maxQuantity }) => quantity > 0 && maxQuantity > 0)
    .map(({ ticket, quantity, maxQuantity }) => ({ ...ticket, quantity, maxQuantity })), [ticketRows]);

  const selectedQuantity = useMemo(
    () => selectedTickets.reduce((sum, ticket) => sum + Number(ticket.quantity || 0), 0),
    [selectedTickets],
  );

  const subtotal = useMemo(
    () => selectedTickets.reduce((sum, ticket) => sum + (Number(ticket.price || 0) * Number(ticket.quantity || 0)), 0),
    [selectedTickets],
  );

  const setQuantity = (ticket, value) => {
    const max = resolveCheckoutQuantity(ticket, checkoutQuantityLimit("ticket"), checkoutQuantityLimit("ticket"));
    const next = Math.max(0, Math.min(max, Math.floor(Number(value || 0))));
    setQuantities((current) => ({ ...current, [ticket.id]: next }));
  };

  const addToCart = () => {
    if (!selectedEvent || !selectedTickets.length) {
      setError("Selecione ao menos um ingresso e a quantidade desejada.");
      return;
    }

    setAdding(true);
    setError("");
    try {
      const result = addTicketsToCommerceCart({
        event: catalog?.event || selectedEvent,
        production: production || currentEvent?.production,
        tickets: selectedTickets,
      });

      trackCart("production_ticket_added_to_cart", {
        label: "Ingresso de evento da produção adicionado ao carrinho",
        target: selectedEvent.slug,
        metadata: {
          event_id: Number(selectedEvent.id || catalog?.event?.id || 0),
          production_id: Number(production?.id || currentEvent?.production_id || currentEvent?.production?.id || 0),
          added_quantity: result.addedQuantity,
          cart_quantity: result.itemCount,
          amount: Number(subtotal.toFixed(2)),
          source: lockedToCurrentEvent ? "event_page" : "production_page",
        },
      });

      onAdded?.({
        event: catalog?.event || selectedEvent,
        quantity: result.addedQuantity,
        cartQuantity: result.itemCount,
        amount: subtotal,
      });
      onHide();
    } catch (err) {
      setError(err?.message || "Não foi possível adicionar os ingressos ao carrinho.");
    } finally {
      setAdding(false);
    }
  };

  const salesClosed = Boolean(catalog?.sales_closed || catalog?.event?.sales_closed);
  const modalTitle = lockedToCurrentEvent
    ? `Ingressos para ${currentEvent?.title || "este evento"}`
    : "Adquirir ingresso desta produção";

  return <Modal show={show} onHide={adding ? undefined : onHide} centered size="lg" scrollable>
    <Modal.Header closeButton={!adding}>
      <Modal.Title>{modalTitle}</Modal.Title>
    </Modal.Header>
    <Modal.Body>
      <p className="text-secondary">
        {lockedToCurrentEvent
          ? "Escolha o ingresso e informe a quantidade para adicionar ao carrinho. Nenhuma cobrança é feita nesta etapa."
          : "Escolha o evento, informe a quantidade e adicione os ingressos ao carrinho. Nenhuma cobrança é feita nesta etapa."}
      </p>

      {error && <Alert variant="danger">{error}</Alert>}

      {loadingEvents ? <div className="d-flex align-items-center gap-2 py-4"><Spinner size="sm" /><span>Carregando eventos da produção...</span></div> : <>
        {!lockedToCurrentEvent && (events.length > 0 ? <Form.Group className="mb-4">
          <Form.Label className="fw-semibold">Qual evento?</Form.Label>
          <Form.Select value={selectedSlug} onChange={(event) => setSelectedSlug(event.target.value)} disabled={adding || loadingCatalog}>
            {events.map((item) => <option key={item.id || item.slug} value={item.slug}>{item.title || item.name} · {dateLabel(item.start_date)}</option>)}
          </Form.Select>
        </Form.Group> : <Alert variant="secondary" className="mb-0">Esta produção não possui próximos eventos com ingressos disponíveis no momento.</Alert>)}

        {lockedToCurrentEvent && selectedEvent && <div className="cut-ticket-shop__summary mb-4" aria-label="Evento selecionado">
          <div className="cut-ticket-shop__summary-line"><span>Evento</span><strong>{selectedEvent.title || selectedEvent.name}</strong></div>
          <div className="cut-ticket-shop__summary-line"><span>Data</span><strong>{dateLabel(selectedEvent.start_date)}</strong></div>
        </div>}

        {selectedSlug && loadingCatalog && <div className="d-flex align-items-center gap-2 py-4"><Spinner size="sm" /><span>Carregando ingressos...</span></div>}

        {!loadingCatalog && catalog && <>
          {salesClosed && <Alert variant="secondary">As vendas deste evento já foram encerradas.</Alert>}
          {!salesClosed && ticketRows.length === 0 && <Alert variant="secondary">Este evento não possui ingressos disponíveis para compra.</Alert>}

          {!salesClosed && ticketRows.length > 0 && <div className="cut-ticket-shop__list">
            {ticketRows.map(({ ticket, maxQuantity, quantity }) => {
              const soldOut = maxQuantity <= 0;
              return <div className={`cut-ticket-shop__option ${soldOut ? "cut-ticket-shop__option--sold-out" : ""}`} key={`cart-ticket-${ticket.id}`}>
                <div className="cut-ticket-shop__option-copy">
                  <span className="cut-ticket-kicker">Ingresso</span>
                  <strong>{ticket.name}</strong>
                  <span>{money(ticket.price)}</span>
                  <small>{soldOut ? (ticket.expired ? "Venda encerrada" : "Esgotado") : `Até ${maxQuantity} por seleção`}</small>
                </div>
                {!soldOut && <div className="cut-ticket-shop__stepper" role="group" aria-label={`Quantidade de ${ticket.name}`}>
                  <button type="button" onClick={() => setQuantity(ticket, quantity - 1)} disabled={quantity <= 0 || adding} aria-label={`Remover uma unidade de ${ticket.name}`}><i className="fa-solid fa-minus" /></button>
                  <output aria-live="polite">{quantity}</output>
                  <button type="button" onClick={() => setQuantity(ticket, quantity + 1)} disabled={quantity >= maxQuantity || adding} aria-label={`Adicionar uma unidade de ${ticket.name}`}><i className="fa-solid fa-plus" /></button>
                </div>}
              </div>;
            })}
          </div>}
        </>}
      </>}

      {selectedQuantity > 0 && <div className="cut-ticket-shop__summary mt-4" aria-label="Resumo do carrinho">
        <div className="cut-ticket-shop__summary-line"><span>Ingressos</span><strong>{selectedQuantity}</strong></div>
        <div className="cut-ticket-shop__summary-line cut-ticket-shop__summary-line--total"><span>Subtotal</span><strong>{money(subtotal)}</strong></div>
        <p className="cut-ticket-shop__summary-note mb-0">Preço e disponibilidade serão revalidados no checkout. Os ingressos só são emitidos após a finalização da compra.</p>
      </div>}
    </Modal.Body>
    <Modal.Footer>
      <Button variant="outline-secondary" onClick={onHide} disabled={adding}>Cancelar</Button>
      <Button onClick={addToCart} disabled={adding || salesClosed || selectedQuantity <= 0 || loadingEvents || loadingCatalog}>
        {adding ? <><Spinner size="sm" className="me-2" />Adicionando...</> : <><i className="fa-solid fa-cart-plus me-2" />Adicionar {selectedQuantity || ""} ao carrinho</>}
      </Button>
    </Modal.Footer>
  </Modal>;
}

ProductionTicketCartModal.propTypes = {
  show: PropTypes.bool.isRequired,
  onHide: PropTypes.func.isRequired,
  productionSlug: PropTypes.string,
  currentEvent: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    slug: PropTypes.string,
    title: PropTypes.string,
    start_date: PropTypes.string,
    temporal_status: PropTypes.string,
    production_id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    production: PropTypes.object,
  }),
  onAdded: PropTypes.func,
};

ProductionTicketCartModal.defaultProps = {
  productionSlug: "",
  currentEvent: null,
  onAdded: null,
};
