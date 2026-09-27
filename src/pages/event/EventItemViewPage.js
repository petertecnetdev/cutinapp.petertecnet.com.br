import React, { useEffect, useMemo, useState } from "react";
import { Alert, Button, Container } from "react-bootstrap";
import { Link, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import SeoHead from "../../components/SeoHead";
import EventDiscoveryRail from "../../components/event/EventDiscoveryRail";
import ItemDiscoveryRail from "../../components/event/ItemDiscoveryRail";
import commerceService from "../../services/CommerceService";
import { storageUrl } from "../../config";
import { trackTelemetry } from "../../utils/telemetry";
import "./EventItemViewPage.css";

const resolveLocale = (...sources) => sources.find((value) => typeof value === "string" && value.trim()) || undefined;
const resolveCurrency = (...sources) => {
  const value = sources.find((candidate) => typeof candidate === "string" && /^[A-Za-z]{3}$/.test(candidate.trim()));
  return value ? value.trim().toUpperCase() : null;
};
const money = (value, currency, locale) => {
  const amount = Number(value || 0);
  if (!currency) return new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`;
  }
};

const mediaUrl = (value) => {
  if (!value) return "";
  const image = String(value);
  if (/^https?:\/\//i.test(image)) return image;
  return `${storageUrl}${image.replace(/^\/?storage\//, "").replace(/^\/+/, "")}`;
};

const effectivePrice = (item) => (
  item?.promotion_enabled && Number(item?.promotion_price) >= 0
    ? Number(item.promotion_price)
    : Number(item?.price || 0)
);

export default function EventItemViewPage() {
  const { slug, itemId } = useParams();
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    commerceService.itemDetail(slug, itemId)
      .then((data) => {
        if (!active) return;
        setPayload(data);
        trackTelemetry("event_item_viewed", {
          label: "Item público visualizado",
          target: String(itemId || ""),
          metadata: {
            event_id: Number(data?.event?.id || 0),
            item_id: Number(data?.item?.id || itemId || 0),
            source_item_id: Number(data?.item?.source_item_id || 0),
            production_id: Number(data?.production?.id || 0),
          },
        });
      })
      .catch((err) => {
        if (!active) return;
        setError(err?.response?.data?.message || err?.message || "Não foi possível carregar este item.");
      })
      .finally(() => active && setLoading(false));

    return () => { active = false; };
  }, [slug, itemId]);

  const item = payload?.item || null;
  const event = payload?.event || null;
  const production = payload?.production || event?.production || null;
  const image = useMemo(() => mediaUrl(item?.image_url || item?.image), [item]);
  const price = effectivePrice(item);
  const currency = resolveCurrency(item?.currency, event?.currency, production?.currency, payload?.currency);
  const locale = resolveLocale(item?.locale, event?.locale, production?.locale, payload?.locale);
  const remaining = Number(item?.remaining ?? item?.quantity ?? 0);
  const available = item?.available !== false && !event?.sales_closed && remaining > 0;
  const registeredEvents = payload?.registered_events || [];
  const otherItems = payload?.other_items || [];
  const otherEvents = payload?.other_events || [];

  const seoDescription = item?.short_description || item?.description
    || (event?.title ? `${item?.name || "Item"} disponível no evento ${event.title} pela Cutinapp.` : "Veja detalhes e eventos onde este item está disponível na Cutinapp.");

  const productSchema = item && event ? {
    "@context": "https://schema.org",
    "@type": "Product",
    name: item.name,
    description: seoDescription,
    image: image || undefined,
    sku: item.sku || undefined,
    brand: production?.name ? { "@type": "Brand", name: production.name } : undefined,
    offers: currency ? {
      "@type": "Offer",
      priceCurrency: currency,
      price: Number(price || 0).toFixed(2),
      availability: available ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url: `https://cutinapp.petertecnet.com.br/event/${encodeURIComponent(slug)}/item/${item.id}`,
    } : undefined,
  } : null;

  if (loading) {
    return (
      <div className="cut-app-page cut-item-view-page">
        <NavlogComponent />
        <Container className="cut-page-container py-5">
          <ProcessingIndicatorComponent fullscreen={false} label="Abrindo item" />
        </Container>
      </div>
    );
  }

  return (
    <div className="cut-app-page cut-item-view-page">
      <NavlogComponent />
      {item && (
        <SeoHead
          title={`${item.name} | ${event?.title || production?.name || "Cutinapp"}`}
          description={seoDescription}
          canonical={`/event/${encodeURIComponent(slug)}/item/${item.id}`}
          image={image}
          type="product"
          jsonLd={productSchema}
          scriptId="event-item"
        />
      )}

      <Container className="cut-page-container py-4 py-lg-5">
        {error && !item && (
          <Alert variant="danger" className="cut-item-view__error">
            <strong>Item indisponível.</strong>
            <span>{error}</span>
            <Button as={Link} to={event?.slug ? `/event/${event.slug}` : `/event/${slug}`} variant="outline-light">
              Voltar ao evento
            </Button>
          </Alert>
        )}

        {item && event && (
          <>
            <nav className="cut-item-view__breadcrumbs" aria-label="Navegação estrutural">
              <Link to="/event">Eventos</Link>
              <i className="fa-solid fa-chevron-right" aria-hidden="true" />
              <Link to={`/event/${event.slug}`}>{event.title}</Link>
              <i className="fa-solid fa-chevron-right" aria-hidden="true" />
              <span>{item.name}</span>
            </nav>

            <section className="cut-item-view__hero">
              <div className="cut-item-view__visual">
                <div className="cut-item-view__ambient" style={image ? { backgroundImage: `url(${JSON.stringify(image)})` } : undefined} aria-hidden="true" />
                <div className="cut-item-view__media">
                  {image
                    ? <img src={image} alt={item.name} decoding="async" fetchPriority="high" />
                    : <span><i className="fa-solid fa-box-open" aria-hidden="true" /></span>}
                </div>
              </div>

              <div className="cut-item-view__content">
                <div className="cut-item-view__badges">
                  <span>Item do evento</span>
                  {(item.category || item.type) && <span>{item.category || item.type}</span>}
                  {item.promotion_enabled && Number(item.promotion_price) >= 0 && <span className="is-highlight">Oferta</span>}
                </div>

                <h1>{item.name}</h1>
                {(item.short_description || item.description) && (
                  <p className="cut-item-view__description">{item.short_description || item.description}</p>
                )}

                <div className="cut-item-view__priceBlock">
                  {item.promotion_enabled && Number(item.promotion_price) >= 0 && Number(item.price) > price && (
                    <del>{money(item.price, currency, locale)}</del>
                  )}
                  <strong>{money(price, currency, locale)}</strong>
                  {!currency && <small>Moeda informada no fluxo de compra</small>}
                  <span className={available ? "is-available" : "is-unavailable"}>
                    <i className={`fa-solid ${available ? "fa-circle-check" : "fa-circle-xmark"}`} />
                    {available ? `${remaining} disponível${remaining === 1 ? "" : "is"} neste evento` : "Indisponível neste evento"}
                  </span>
                </div>

                <div className="cut-item-view__actions">
                  <Button
                    as={Link}
                    to={`/event/${event.slug}#ingressos`}
                    size="lg"
                    disabled={!available}
                    onClick={() => trackTelemetry("event_item_purchase_intent", {
                      label: "Intenção de compra pela view do item",
                      target: String(item.id),
                      metadata: { event_id: Number(event.id), item_id: Number(item.id) },
                    })}
                  >
                    <i className="fa-solid fa-cart-shopping me-2" />
                    {available ? "Comprar neste evento" : "Venda indisponível"}
                  </Button>
                  <Button as={Link} to={`/event/${event.slug}/catalogo`} size="lg" variant="outline-light">
                    Ver catálogo do evento
                  </Button>
                </div>

                <div className="cut-item-view__facts">
                  <span><i className="fa-solid fa-calendar-day" /><small>Evento</small><strong>{event.title}</strong></span>
                  <span><i className="fa-solid fa-location-dot" /><small>Local</small><strong>{event.venue || event.city || "A confirmar"}</strong></span>
                  <span><i className="fa-solid fa-box" /><small>Entrega</small><strong>Retirada no evento</strong></span>
                </div>

                {production?.name && (
                  <Link to={`/production/${production.slug}/public`} className="cut-item-view__production">
                    <span className="cut-item-view__productionLogo">
                      {production.logo
                        ? <img src={mediaUrl(production.logo)} alt="" loading="lazy" decoding="async" />
                        : String(production.name).slice(0, 2).toUpperCase()}
                    </span>
                    <span>
                      <small>Produção responsável</small>
                      <strong>{production.name}</strong>
                      <em>{[production.city, production.uf].filter(Boolean).join(" · ") || "Ver perfil da produção"}</em>
                    </span>
                    <i className="fa-solid fa-arrow-up-right-from-square" />
                  </Link>
                )}
              </div>
            </section>

            <ItemDiscoveryRail
              items={otherItems}
              eventSlug={event.slug}
              eyebrow="Continue navegando"
              title="Outros itens deste evento"
              description="Mais opções da mesma edição, carregadas em uma faixa leve para você comparar sem perder o contexto."
              maxItems={10}
            />

            <EventDiscoveryRail
              events={registeredEvents}
              eyebrow="Onde encontrar"
              title="Eventos com este item"
              description="Edições publicadas em que este mesmo item está cadastrado."
              allTo="/event"
              allLabel="Explorar eventos"
              maxItems={8}
              className="cut-item-view__eventsRail"
            />

            <EventDiscoveryRail
              events={otherEvents}
              eyebrow="Da mesma produção"
              title="Outros eventos"
              description="Próximas experiências da produção responsável por este item."
              allTo={production?.slug ? `/production/${production.slug}/public` : "/event"}
              allLabel={production?.slug ? "Ver produção" : "Ver eventos"}
              maxItems={8}
              className="cut-item-view__eventsRail"
            />
          </>
        )}
      </Container>
    </div>
  );
}
