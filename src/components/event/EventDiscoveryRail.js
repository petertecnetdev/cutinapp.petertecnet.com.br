import React, { useRef } from "react";
import PropTypes from "prop-types";
import { Link } from "react-router-dom";
import EventArtwork from "./EventArtwork";
import { storageUrl } from "../../config";
import { parsePortableEventDate } from "../../utils/chronologicalDiscovery";
import "./EventDiscoveryRail.css";

const eventStartValue = (event) => event?.starts_at || event?.start_at || event?.start_date || event?.date || event?.scheduled_at || null;
const eventStableKey = (event) => {
  if (event?.id) return `id:${event.id}`;
  if (event?.slug) return `slug:${event.slug}`;
  if (event?.uuid) return `uuid:${event.uuid}`;
  if (event?.public_id) return `public:${event.public_id}`;
  const fingerprint = [event?.title, eventStartValue(event), event?.venue, event?.city].map((value) => String(value || "").trim().toLowerCase()).filter(Boolean).join("|");
  return `fallback:${fingerprint || "event"}`;
};
const uniqueEvents = (events, maxItems) => { const seen = new Set(); const result = []; for (const event of Array.isArray(events) ? events : []) { const key = eventStableKey(event); if (seen.has(key)) continue; seen.add(key); result.push(event); if (result.length >= maxItems) break; } return result; };
const eventDateMeta = (event) => { const date = parsePortableEventDate(eventStartValue(event)); if (!date) return { label: "Data a confirmar", dateTime: null }; return { label: new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date), dateTime: date.toISOString() }; };
const categoryLabels = (event) => [event?.categories, event?.category, event?.event_category, event?.genres, event?.genre, event?.music_genre].flatMap((source) => (Array.isArray(source) ? source : source ? [source] : [])).map((value) => (typeof value === "string" ? value : value?.name || value?.title || value?.label)).map((value) => String(value || "").trim()).filter(Boolean).filter((value, index, items) => items.indexOf(value) === index).slice(0, 2);
const numericPrice = (value) => { if (typeof value === "number") return Number.isFinite(value) ? value : null; const raw = String(value ?? "").trim().replace(/[^\d,.-]/g, ""); if (!raw) return null; const comma = raw.lastIndexOf(","); const dot = raw.lastIndexOf("."); let normalized = raw; if (comma >= 0 && dot >= 0) { const decimal = comma > dot ? "," : "."; const grouping = decimal === "," ? /\./g : /,/g; normalized = raw.replace(grouping, "").replace(decimal, "."); } else if (comma >= 0) normalized = raw.replace(/\./g, "").replace(",", "."); else if ((raw.match(/\./g) || []).length > 1) normalized = raw.replace(/\./g, ""); const parsed = Number(normalized); return Number.isFinite(parsed) ? parsed : null; };
const eventPriceLabel = (event) => { if (event?.is_free === true || event?.free === true) return "Grátis"; const raw = [event?.min_price, event?.price_from, event?.lowest_price, event?.ticket_price, event?.price].find((value) => value !== null && value !== undefined && value !== ""); if (raw === undefined) return null; const numeric = numericPrice(raw); if (numeric === null || numeric < 0) return null; if (numeric === 0) return "Grátis"; return `A partir de ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(numeric)}`; };
const mediaUrl = (value) => { if (!value) return ""; const image = String(value); if (/^https?:\/\//i.test(image)) return image; return `${storageUrl}${image.replace(/^\/?storage\//, "").replace(/^\/+/, "")}`; };
const initials = (value) => String(value || "C").trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
const prefersReducedMotion = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function EventDiscoveryRail({ events, eyebrow, title, description, allTo, allLabel, productionOverride, emptyTitle, emptyText, maxItems, className }) {
  const railRef = useRef(null);
  const visibleEvents = uniqueEvents(events, maxItems);
  const scroll = (direction) => { const node = railRef.current; if (!node) return; node.scrollBy({ left: direction * Math.max(280, Math.round(node.clientWidth * 0.82)), behavior: prefersReducedMotion() ? "auto" : "smooth" }); };
  const onRailKeyDown = (event) => { if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return; event.preventDefault(); scroll(event.key === "ArrowLeft" ? -1 : 1); };

  return (
    <section className={["cut-event-discovery", className].filter(Boolean).join(" ")}>
      <div className="cut-event-discovery__head"><div><span>{eyebrow}</span><h2>{title}</h2>{description && <p>{description}</p>}</div><div className="cut-event-discovery__actions">{visibleEvents.length > 1 && <div className="cut-event-discovery__controls" aria-label={`Navegar em ${title}`}><button type="button" onClick={() => scroll(-1)} aria-label="Ver anteriores"><i className="fa-solid fa-chevron-left" /></button><button type="button" onClick={() => scroll(1)} aria-label="Ver próximos"><i className="fa-solid fa-chevron-right" /></button></div>}{allTo && <Link to={allTo}>{allLabel} <i className="fa-solid fa-arrow-right" /></Link>}</div></div>
      {visibleEvents.length === 0 ? <div className="cut-event-discovery__empty"><i className="fa-regular fa-calendar" /><strong>{emptyTitle}</strong><p>{emptyText}</p></div> : (
        <div className="cut-event-discovery__rail" ref={railRef} role="list" tabIndex={0} onKeyDown={onRailKeyDown} aria-label={`${title}. Use as setas esquerda e direita para navegar.`}>
          {visibleEvents.map((event, index) => { const production = event?.production || productionOverride || {}; const productionLogo = mediaUrl(production.logo || production.photo || production.image); const productionHref = production.slug ? `/production/${production.slug}/public` : "/productions"; const eventHref = event?.slug ? `/event/${event.slug}` : "/event"; const dateMeta = eventDateMeta(event); const categories = categoryLabels(event); const priceLabel = eventPriceLabel(event); return (
            <article className="cut-event-discovery__card" role="listitem" key={eventStableKey(event)}><Link to={eventHref} className="cut-event-discovery__mainLink" aria-label={`Ver evento ${event?.title || "Cutinapp"}`}><div className="cut-event-discovery__media"><EventArtwork image={event?.image} title={event?.title} alt={event?.title || "Evento Cutinapp"} loading={index === 0 ? "eager" : "lazy"} fetchPriority={index === 0 ? "high" : "auto"} decoding="async" />{dateMeta.dateTime ? <time dateTime={dateMeta.dateTime}>{dateMeta.label}</time> : <span>{dateMeta.label}</span>}</div><div className="cut-event-discovery__body"><h3>{event?.title || "Evento Cutinapp"}</h3><p><i className="fa-solid fa-location-dot" /> {event?.venue || event?.city || "Local a confirmar"}</p>{priceLabel && <p aria-label={`Preço ${priceLabel}`}><i className="fa-solid fa-ticket" /> {priceLabel}</p>}{categories.length > 0 && <div className="cut-event-discovery__categories" aria-label="Categorias e gêneros do evento">{categories.map((category) => <span key={category}>{category}</span>)}</div>}</div></Link>{production.name && <Link to={productionHref} className="cut-event-discovery__production" aria-label={`Ver produção ${production.name}`}><span className="cut-event-discovery__productionAvatar">{productionLogo ? <img src={productionLogo} alt="" loading="lazy" decoding="async" /> : initials(production.name)}</span><span className="cut-event-discovery__productionCopy"><small>Produção responsável</small><strong>{production.name}</strong></span><i className="fa-solid fa-chevron-right" /></Link>}</article>
          ); })}
        </div>
      )}
    </section>
  );
}
EventDiscoveryRail.propTypes = { events: PropTypes.arrayOf(PropTypes.object), eyebrow: PropTypes.node, title: PropTypes.string, description: PropTypes.node, allTo: PropTypes.string, allLabel: PropTypes.string, productionOverride: PropTypes.object, emptyTitle: PropTypes.string, emptyText: PropTypes.string, maxItems: PropTypes.number, className: PropTypes.string };
EventDiscoveryRail.defaultProps = { events: [], eyebrow: "Próximos eventos", title: "Eventos para descobrir", description: null, allTo: "/event", allLabel: "Todos os eventos", productionOverride: null, emptyTitle: "Nenhum evento por aqui ainda", emptyText: "Quando novos eventos forem publicados, eles aparecerão nesta faixa.", maxItems: 12, className: "" };
