import React, { useRef } from "react";
import PropTypes from "prop-types";
import { Link } from "react-router-dom";
import EventArtwork from "./EventArtwork";
import { storageUrl } from "../../config";
import { parsePortableEventDate } from "../../utils/chronologicalDiscovery";
import "./EventDiscoveryRail.css";

const eventStartValue = (event) => event?.starts_at
  || event?.start_at
  || event?.start_date
  || event?.date
  || event?.scheduled_at
  || null;

const eventStableKey = (event) => event?.id
  || event?.slug
  || [event?.title, eventStartValue(event), event?.venue, event?.city]
    .map((value) => String(value || "").trim().toLowerCase())
    .join("|");

const eventDateMeta = (event) => {
  const date = parsePortableEventDate(eventStartValue(event));
  if (!date) return { label: "Data a confirmar", dateTime: null };
  return {
    label: new Intl.DateTimeFormat("pt-BR", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date),
    dateTime: date.toISOString(),
  };
};

const mediaUrl = (value) => {
  if (!value) return "";
  const image = String(value);
  if (/^https?:\/\//i.test(image)) return image;
  return `${storageUrl}${image.replace(/^\/?storage\//, "").replace(/^\/+/, "")}`;
};

const initials = (value) => String(value || "C")
  .trim()
  .split(/\s+/)
  .slice(0, 2)
  .map((part) => part[0])
  .join("")
  .toUpperCase();

export default function EventDiscoveryRail({
  events,
  eyebrow,
  title,
  description,
  allTo,
  allLabel,
  productionOverride,
  emptyTitle,
  emptyText,
  maxItems,
  className,
}) {
  const railRef = useRef(null);
  const visibleEvents = (Array.isArray(events) ? events : []).slice(0, maxItems);

  const scroll = (direction) => {
    const node = railRef.current;
    if (!node) return;
    node.scrollBy({
      left: direction * Math.max(280, Math.round(node.clientWidth * 0.82)),
      behavior: "smooth",
    });
  };

  return (
    <section className={["cut-event-discovery", className].filter(Boolean).join(" ")}>
      <div className="cut-event-discovery__head">
        <div>
          <span>{eyebrow}</span>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>

        <div className="cut-event-discovery__actions">
          {visibleEvents.length > 1 && (
            <div className="cut-event-discovery__controls" aria-label={`Navegar em ${title}`}>
              <button type="button" onClick={() => scroll(-1)} aria-label="Ver anteriores">
                <i className="fa-solid fa-chevron-left" />
              </button>
              <button type="button" onClick={() => scroll(1)} aria-label="Ver próximos">
                <i className="fa-solid fa-chevron-right" />
              </button>
            </div>
          )}
          {allTo && (
            <Link to={allTo}>
              {allLabel} <i className="fa-solid fa-arrow-right" />
            </Link>
          )}
        </div>
      </div>

      {visibleEvents.length === 0 ? (
        <div className="cut-event-discovery__empty">
          <i className="fa-regular fa-calendar" />
          <strong>{emptyTitle}</strong>
          <p>{emptyText}</p>
        </div>
      ) : (
        <div className="cut-event-discovery__rail" ref={railRef} aria-label={title}>
          {visibleEvents.map((event, index) => {
            const production = event?.production || productionOverride || {};
            const productionLogo = mediaUrl(production.logo || production.photo || production.image);
            const productionHref = production.slug ? `/production/${production.slug}/public` : "/productions";
            const eventHref = event?.slug ? `/event/${event.slug}` : "/event";
            const dateMeta = eventDateMeta(event);

            return (
              <article className="cut-event-discovery__card" key={eventStableKey(event)}>
                <Link to={eventHref} className="cut-event-discovery__mainLink" aria-label={`Ver evento ${event?.title || "Cutinapp"}`}>
                  <div className="cut-event-discovery__media">
                    <EventArtwork
                      image={event?.image}
                      title={event?.title}
                      alt={event?.title || "Evento Cutinapp"}
                      loading={index === 0 ? "eager" : "lazy"}
                      fetchPriority={index === 0 ? "high" : "auto"}
                      decoding="async"
                    />
                    {dateMeta.dateTime
                      ? <time dateTime={dateMeta.dateTime}>{dateMeta.label}</time>
                      : <span>{dateMeta.label}</span>}
                  </div>

                  <div className="cut-event-discovery__body">
                    <h3>{event?.title || "Evento Cutinapp"}</h3>
                    <p><i className="fa-solid fa-location-dot" /> {event?.venue || event?.city || "Local a confirmar"}</p>
                  </div>
                </Link>

                {production.name && (
                  <Link to={productionHref} className="cut-event-discovery__production" aria-label={`Ver produção ${production.name}`}>
                    <span className="cut-event-discovery__productionAvatar">
                      {productionLogo
                        ? <img src={productionLogo} alt="" loading="lazy" decoding="async" />
                        : initials(production.name)}
                    </span>
                    <span className="cut-event-discovery__productionCopy">
                      <small>Produção responsável</small>
                      <strong>{production.name}</strong>
                    </span>
                    <i className="fa-solid fa-chevron-right" />
                  </Link>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

EventDiscoveryRail.propTypes = {
  events: PropTypes.arrayOf(PropTypes.object),
  eyebrow: PropTypes.node,
  title: PropTypes.string,
  description: PropTypes.node,
  allTo: PropTypes.string,
  allLabel: PropTypes.string,
  productionOverride: PropTypes.object,
  emptyTitle: PropTypes.string,
  emptyText: PropTypes.string,
  maxItems: PropTypes.number,
  className: PropTypes.string,
};

EventDiscoveryRail.defaultProps = {
  events: [],
  eyebrow: "Próximos eventos",
  title: "Eventos para descobrir",
  description: null,
  allTo: "/event",
  allLabel: "Todos os eventos",
  productionOverride: null,
  emptyTitle: "Nenhum evento por aqui ainda",
  emptyText: "Quando novos eventos forem publicados, eles aparecerão nesta faixa.",
  maxItems: 12,
  className: "",
};
