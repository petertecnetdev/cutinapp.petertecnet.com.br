import React, { useContext, useEffect, useMemo, useState } from "react";
import { Alert, Button, Container, Spinner } from "react-bootstrap";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import { AuthContext } from "../../context/AuthContext";
import commerceService from "../../services/CommerceService";
import { storageUrl } from "../../config";
import { checkoutQuantityLimit, resolveCheckoutQuantity } from "../../utils/checkoutAddOns";
import { readEventCart, writeEventCart } from "../../utils/eventCartStorage";
import { safeRemoveSessionItem } from "../../utils/safeStorage";
import { trackTelemetry } from "../../utils/telemetry";
import "./EventItemCatalogPage.css";

const money = (value) => new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
}).format(Number(value || 0));

const resolveImageUrl = (value) => {
  if (!value) return "";
  const image = String(value);
  return /^https?:\/\//i.test(image) ? image : `${storageUrl}${image.replace(/^\/+/, "")}`;
};

const maxFor = (item) => resolveCheckoutQuantity(
  item,
  checkoutQuantityLimit("item"),
  checkoutQuantityLimit("item"),
);

export default function EventItemCatalogPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const [catalog, setCatalog] = useState(null);
  const [quantities, setQuantities] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    commerceService.catalog(slug, { force: true })
      .then((response) => {
        if (!active) return;
        setCatalog(response);
        const stored = readEventCart(slug);
        const restored = {};
        (response?.items || []).forEach((item) => {
          const storedItem = (stored?.items || []).find((row) => Number(row.id) === Number(item.id));
          if (!storedItem) return;
          restored[String(item.id)] = Math.max(0, Math.min(maxFor(item), Number(storedItem.quantity || 0)));
        });
        setQuantities(restored);
        trackTelemetry("event_item_catalog_viewed", {
          label: "Catálogo de itens do evento visualizado",
          target: String(slug || ""),
          metadata: {
            event_id: Number(response?.event?.id || 0),
            item_count: Array.isArray(response?.items) ? response.items.length : 0,
            source: "table_qr_catalog",
          },
        });
      })
      .catch((err) => {
        if (active) setError(err?.response?.data?.message || err?.message || "Não foi possível carregar o catálogo deste evento.");
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [slug]);

  const event = catalog?.event || null;
  const items = useMemo(() => (catalog?.items || []).filter((item) => item?.available !== false && item?.is_active !== false), [catalog]);
  const salesClosed = Boolean(catalog?.sales_closed || event?.sales_closed);
  const paymentConnected = catalog?.payment_config?.available ?? catalog?.payment_config?.connected ?? false;

  const selected = useMemo(() => items
    .map((item) => ({ item, quantity: Number(quantities[String(item.id)] || 0) }))
    .filter((entry) => entry.quantity > 0), [items, quantities]);

  const total = useMemo(() => selected.reduce(
    (sum, entry) => sum + (Number(entry.item.price || 0) * entry.quantity),
    0,
  ), [selected]);

  const selectedQuantity = useMemo(() => selected.reduce((sum, entry) => sum + entry.quantity, 0), [selected]);
  const requiresPayment = total > 0;
  const checkoutAvailable = !salesClosed && (!requiresPayment || paymentConnected);

  const persistSelection = (next) => {
    const selectedItems = items
      .map((item) => ({ id: item.id, quantity: Number(next[String(item.id)] || 0) }))
      .filter((item) => item.quantity > 0);
    writeEventCart(slug, {
      eventId: Number(event?.id || 0),
      eventDate: event?.start_date || null,
      tickets: [],
      items: selectedItems,
      source: "event_item_catalog",
    });
  };

  const setQuantity = (item, nextValue) => {
    const max = maxFor(item);
    const nextQuantity = Math.max(0, Math.min(max, Number(nextValue || 0)));
    setQuantities((current) => {
      const next = { ...current, [String(item.id)]: nextQuantity };
      persistSelection(next);
      return next;
    });
    trackTelemetry("event_item_catalog_quantity_changed", {
      label: "Quantidade de item alterada no catálogo",
      target: String(slug || ""),
      metadata: {
        event_id: Number(event?.id || 0),
        item_id: Number(item.id),
        quantity: nextQuantity,
        source: "table_qr_catalog",
      },
    });
  };

  const continueToCheckout = () => {
    if (!selected.length) {
      setError("Escolha pelo menos um item para continuar.");
      return;
    }
    if (!checkoutAvailable) {
      setError(salesClosed ? "As vendas deste evento já foram encerradas." : "Os pagamentos deste evento estão temporariamente indisponíveis.");
      return;
    }

    const checkout = {
      eventId: Number(event?.id || 0),
      eventDate: event?.start_date || null,
      tickets: [],
      items: selected.map(({ item, quantity }) => ({ id: item.id, quantity })),
      source: "event_item_catalog",
    };
    const checkoutPath = `/checkout/${slug}`;
    safeRemoveSessionItem(`cutinapp_payment_${slug}`);
    writeEventCart(slug, checkout);
    trackTelemetry("event_item_catalog_checkout_started", {
      label: "Checkout iniciado pelo catálogo de mesa",
      target: String(slug || ""),
      metadata: {
        event_id: Number(event?.id || 0),
        item_quantity: selectedQuantity,
        amount: Number(total.toFixed(2)),
        authenticated: Boolean(user),
        source: "table_qr_catalog",
      },
    });

    if (!user) {
      navigate("/login", { state: { from: checkoutPath } });
      return;
    }
    navigate(checkoutPath, { state: { checkout, from: `${location.pathname}${location.search}` } });
  };

  if (loading) return <div className="cut-app-page cut-event-item-catalog-page"><NavlogComponent /><Container className="cut-page-container py-5"><div className="cut-event-catalog-loading"><Spinner animation="border" size="sm" /><span>Carregando catálogo…</span></div></Container></div>;

  return <div className="cut-app-page cut-event-item-catalog-page">
    <NavlogComponent />
    <section className="cut-event-catalog-hero">
      <Container className="cut-page-container">
        <div className="cut-event-catalog-hero__content">
          <span className="cut-eyebrow">Catálogo do evento</span>
          <h1>{event?.title || "Itens do evento"}</h1>
          <p>Escolha seus itens, monte o pedido e finalize a compra pelo celular. Este catálogo mostra somente produtos e adicionais disponíveis no evento.</p>
          <div className="cut-event-catalog-hero__badges">
            {event?.production?.name && <span><i className="fa-solid fa-store" />{event.production.name}</span>}
            {(event?.venue || event?.city) && <span><i className="fa-solid fa-location-dot" />{event.venue || event.city}</span>}
            <span><i className="fa-solid fa-qrcode" />Catálogo da mesa</span>
          </div>
        </div>
      </Container>
    </section>

    <Container className="cut-page-container py-4 py-lg-5">
      {error && <Alert variant="danger" dismissible onClose={() => setError("")}>{error}</Alert>}
      {salesClosed && <Alert variant="secondary"><strong>Vendas encerradas.</strong> O catálogo permanece visível, mas não aceita novos pedidos.</Alert>}
      {requiresPayment && !paymentConnected && <Alert variant="warning">Os pagamentos estão temporariamente indisponíveis para este evento.</Alert>}

      {!event && <div className="cut-event-catalog-empty"><i className="fa-solid fa-circle-exclamation" /><h2>Catálogo indisponível</h2><p>{error || "Este evento não está disponível no momento."}</p></div>}

      {event && <>
        <header className="cut-event-catalog-section-head">
          <div><span className="cut-eyebrow">Disponíveis agora</span><h2>Escolha seus itens</h2></div>
          <span className="cut-event-catalog-count">{items.length} item{items.length === 1 ? "" : "s"}</span>
        </header>

        {items.length > 0 ? <div className="cut-event-catalog-grid">
          {items.map((item) => {
            const quantity = Number(quantities[String(item.id)] || 0);
            const max = maxFor(item);
            const soldOut = max <= 0;
            const image = resolveImageUrl(item?.image || item?.image_url || item?.photo || item?.cover);
            return <article className={`cut-event-catalog-card${quantity > 0 ? " is-selected" : ""}${soldOut ? " is-sold-out" : ""}`} key={item.id}>
              <Link to={`/event/${encodeURIComponent(slug)}/item/${encodeURIComponent(item.slug || item.id)}`} className="cut-event-catalog-card__media" aria-label={`Ver ${item.name} no evento ${event.title}`}>{image ? <img src={image} alt="" /> : <i className="fa-solid fa-box-open" aria-hidden="true" />}</Link>
              <div className="cut-event-catalog-card__body">
                <div className="cut-event-catalog-card__copy"><strong><Link to={`/event/${encodeURIComponent(slug)}/item/${encodeURIComponent(item.slug || item.id)}`}>{item.name}</Link></strong>{item.description && <p>{item.description}</p>}<span>{money(item.price)}</span><small>{soldOut ? "Esgotado" : `${max} disponível${max === 1 ? "" : "is"} para este pedido`}</small></div>
                <div className="cut-event-catalog-stepper" role="group" aria-label={`Quantidade de ${item.name}`}>
                  <button type="button" onClick={() => setQuantity(item, quantity - 1)} disabled={quantity <= 0} aria-label={`Remover uma unidade de ${item.name}`}><i className="fa-solid fa-minus" /></button>
                  <output aria-live="polite">{quantity}</output>
                  <button type="button" onClick={() => setQuantity(item, quantity + 1)} disabled={soldOut || quantity >= max} aria-label={`Adicionar uma unidade de ${item.name}`}><i className="fa-solid fa-plus" /></button>
                </div>
              </div>
            </article>;
          })}
        </div> : <div className="cut-event-catalog-empty"><i className="fa-solid fa-bag-shopping" /><h2>Nenhum item disponível agora</h2><p>A produção ainda não liberou itens para este evento.</p></div>}

        {items.length > 0 && <aside className="cut-event-catalog-cart" aria-label="Resumo do pedido">
          <div className="cut-event-catalog-cart__copy"><span>{selectedQuantity ? `${selectedQuantity} item${selectedQuantity === 1 ? "" : "s"} no pedido` : "Seu pedido"}</span><strong>{money(total)}</strong></div>
          <Button size="lg" onClick={continueToCheckout} disabled={!selected.length || !checkoutAvailable}><i className="fa-solid fa-cart-shopping me-2" />{user ? "Finalizar pedido" : "Entrar e finalizar"}</Button>
        </aside>}
      </>}
    </Container>
  </div>;
}
