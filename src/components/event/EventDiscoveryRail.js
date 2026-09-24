import React, { useRef } from "react";
import PropTypes from "prop-types";
import { Link } from "react-router-dom";
import EventArtwork from "./EventArtwork";
import { storageUrl } from "../../config";
import { chronologicalBucketFor, parsePortableEventDate } from "../../utils/chronologicalDiscovery";
import "./EventDiscoveryRail.css";

const eventStartValue = (event) => event?.starts_at || event?.start_at || event?.start_date || event?.date || event?.scheduled_at || null;
const scalarIdentityPart = (value) => {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).trim();
};
const stableIdentityPart = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value).trim().toLowerCase();
  if (typeof value === "object") {
    const scalar = value.id || value.uuid || value.slug || value.public_id || value.name || value.title || value.label || value.city || value.state || value.uf;
    return stableIdentityPart(scalar);
  }
  return "";
};
const eventStableKey = (event) => {
  const id = scalarIdentityPart(event?.id);
  const slug = scalarIdentityPart(event?.slug);
  const uuid = scalarIdentityPart(event?.uuid);
  const publicId = scalarIdentityPart(event?.public_id);
  if (id) return `id:${id}`;
  if (slug) return `slug:${slug}`;
  if (uuid) return `uuid:${uuid}`;
  if (publicId) return `public:${publicId}`;
  const fingerprint = [event?.title, eventStartValue(event), event?.venue || event?.place || event?.location, event?.city || event?.address?.city, event?.production, event?.establishment, event?.organization]
    .map(stableIdentityPart)
    .filter(Boolean)
    .join("|");
  return `fallback:${fingerprint || "event"}`;
};
const eventTimestamp = (event) => parsePortableEventDate(eventStartValue(event))?.getTime() ?? Number.POSITIVE_INFINITY;
const uniqueEvents = (events, maxItems) => {
  const seen = new Set();
  const result = [];
  const ordered = (Array.isArray(events) ? events : [])
    .map((event, sourceIndex) => ({ event, sourceIndex, timestamp: eventTimestamp(event) }))
    .sort((a, b) => (a.timestamp - b.timestamp) || (a.sourceIndex - b.sourceIndex));
  for (const { event } of ordered) {
    const key = eventStableKey(event);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(event);
    if (result.length >= maxItems) break;
  }
  return result;
};
const eventDateMeta = (event) => {
  const date = parsePortableEventDate(eventStartValue(event));
  if (!date) return { label: "Data a confirmar", dateTime: null };
  const bucket = chronologicalBucketFor(date);
  const clock = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(date);
  const calendar = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short" }).format(date);
  const relative = bucket.key === "today" || bucket.key === "tomorrow" ? bucket.title : bucket.key === "next-week" ? "Próxima semana" : calendar;
  return { label: `${relative} · ${clock}`, dateTime: date.toISOString() };
};
const categoryLabels = (event) => [event?.categories, event?.category, event?.event_category, event?.genres, event?.genre, event?.music_genre].flatMap((source) => (Array.isArray(source) ? source : source ? [source] : [])).map((value) => (typeof value === "string" ? value : value?.name || value?.title || value?.label)).map((value) => String(value || "").trim()).filter(Boolean).filter((value, index, items) => items.indexOf(value) === index).slice(0, 2);
const numericPrice = (value) => { if (typeof value === "number") return Number.isFinite(value) ? value : null; const raw = String(value ?? "").trim().replace(/[^\d,.-]/g, ""); if (!raw) return null; const comma = raw.lastIndexOf(","); const dot = raw.lastIndexOf("."); let normalized = raw; if (comma >= 0 && dot >= 0) { const decimal = comma > dot ? "," : "."; const grouping = decimal === "," ? /\./g : /,/g; normalized = raw.replace(grouping, "").replace(decimal, "."); } else if (comma >= 0) normalized = raw.replace(/\./g, "").replace(",", "."); else if ((raw.match(/\./g) || []).length > 1) normalized = raw.replace(/\./g, ""); const parsed = Number(normalized); return Number.isFinite(parsed) ? parsed : null; };
const eventPriceLabel = (event) => { if (event?.ticket_availability_status === "free_available" || event?.is_free === true || event?.free === true) return "Grátis"; const raw = [event?.starting_price, event?.min_price, event?.price_from, event?.lowest_price, event?.ticket_price, event?.price].find((value) => value !== null && value !== undefined && value !== ""); if (raw === undefined) return null; const numeric = numericPrice(raw); if (numeric === null || numeric < 0) return null; if (numeric === 0) return "Grátis"; return `A partir de ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(numeric)}`; };
const locationPart = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (typeof value === "object") return String(value.name || value.title || value.label || value.city || value.state || value.uf || "").trim();
  return "";
};
const eventLocationLabel = (event) => {
  const venue = event?.venue || event?.place || event?.location;
  const establishment = event?.establishment || event?.venue?.establishment;
  const city = event?.city || event?.address?.city || event?.location?.city || event?.venue?.city;
  const state = event?.state || event?.uf || event?.address?.state || event?.location?.state || event?.venue?.state;
  const values = [venue, establishment, city, state]
    .map(locationPart)
    .filter(Boolean)
    .filter((value, index, items) => items.findIndex((item) => item.toLocaleLowerCase("pt-BR") === value.toLocaleLowerCase("pt-BR")) === index);
  return values.slice(0, 3).join(" · ") || "Local a confirmar";
};
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
      <div className="cut-event-discovery__head"><div><span>{eyebrow}</span><h2>{title}</h2>{description && <p>{description}</p>}</div><div className="cut-event-discovery__actions">{visibleEvents.length > 1 && <div className="cut-event-discovery__controls" role="group" aria-label={`Navegar em ${title}`}><button type="button" onClick={() => scroll(-1)} aria-label="Ver anteriores"><i className="fa-solid fa-chevron-left" /></button><button type="button" onClick={() => scroll(1)} aria-label="Ver próximos"><i className="fa-solid fa-chevron-right" /></button></div>}{allTo && <Link to={allTo}>{allLabel} <i className="fa-solid fa-arrow-right" /></Link>}</div></div>
      {visibleEvents.length === 0 ? <div className="cut-event-discovery__empty"><i className="fa-regular fa-calendar" /><strong>{emptyTitle}</strong><p>{emptyText}</p></div> : (
        <div className="cut-event-discovery__rail" ref={railRef} role="list" tabIndex={0} onKeyDown={onRailKeyDown} aria-label={`${title}. Use as setas esquerda e direita para navegar.`}>
          {visibleEvents.map((event) => { const production = event?.production || event?.establishment || event?.organization || productionOverride || {}; const productionLogo = mediaUrl(production.logo || production.photo || production.image); const productionSlug = scalarIdentityPart(production.slug); const productionHref = productionSlug ? `/production/${encodeURIComponent(productionSlug)}/public` : "/productions"; const eventSlug = scalarIdentityPart(event?.slug); const eventHref = eventSlug ? `/event/${encodeURIComponent(eventSlug)}` : "/event"; const dateMeta = eventDateMeta(event); const categories = categoryLabels(event); const priceLabel = eventPriceLabel(event); const locationLabel = eventLocationLabel(event); return (
            <article className="cut-event-discovery__card" role="listitem" key={eventStableKey(event)}><Link to={eventHref} className="cut-event-discovery__mainLink" aria-label={`Ver evento ${event?.title || "Cutinapp"}`}><div className="cut-event-discovery__media"><EventArtwork image={event?.image} title={event?.title} alt={event?.title || "Evento Cutinapp"} loading="lazy" fetchPriority="low" decoding="async" />{dateMeta.dateTime ? <time dateTime={dateMeta.dateTime}>{dateMeta.label}</time> : <span>{dateMeta.label}</span>}</div><div className="cut-event-discovery__body"><h3>{event?.title || "Evento Cutinapp"}</h3><p title={locationLabel}><i className="fa-solid fa-location-dot" /><span>{locationLabel}</span></p>{priceLabel && <p aria-label={`Preço ${priceLabel}`}><i className="fa-solid fa-ticket" /><span>{priceLabel}</span></p>}{categories.length > 0 && <div className="cut-event-discovery__categories" aria-label="Categorias e gêneros do evento">{categories.map((category) => <span key={category}>{category}</span>)}</div>}</div></Link>{production.name && <Link to={productionHref} className="cut-event-discovery__production" aria-label={`Ver produção ${production.name}`}><span className="cut-event-discovery__productionAvatar">{productionLogo ? <img src={productionLogo} alt="" loading="lazy" decoding="async" /> : initials(production.name)}</span><span className="cut-event-discovery__productionCopy"><small>Produção responsável</small><strong>{production.name}</strong></span><i className="fa-solid fa-chevron-right" /></Link>}</article>
          ); })}
        </div>
      )}
    </section>
  );
}
EventDiscoveryRail.propTypes = { events: PropTypes.arrayOf(PropTypes.object), eyebrow: PropTypes.node, title: PropTypes.string, description: PropTypes.node, allTo: PropTypes.string, allLabel: PropTypes.string, productionOverride: PropTypes.object, emptyTitle: PropTypes.string, emptyText: PropTypes.string, maxItems: PropTypes.number, className: PropTypes.string };
EventDiscoveryRail.defaultProps = { events: [], eyebrow: "Próximos eventos", title: "Eventos para descobrir", description: null, allTo: "/event", allLabel: "Todos os eventos", productionOverride: null, emptyTitle: "Nenhum evento por aqui ainda", emptyText: "Quando novos eventos forem publicados, eles aparecerão nesta faixa.", maxItems: 12, className: "" };
