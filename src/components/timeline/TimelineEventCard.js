import React from "react";
import PropTypes from "prop-types";
import { Badge, Button, Card } from "react-bootstrap";
import { storageUrl } from "../../config";

const imageUrl = (value) => !value ? "" : /^https?:/i.test(value) ? value : `${storageUrl}${String(value).replace(/^\//, "")}`;
const fmt = (value) => value ? new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(value)) : "";
const money = (value) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
const reasonLabel = { ticket: "Você tem ingresso", interest: "Você demonstrou interesse", production_follow: "Produção seguida", artist_follow: "Artista seguido", preferred_city: "Perto de você", discovery: "Descubra" };

export default function TimelineEventCard({ item, onOpen, onTicket, onInterested }) {
  const { event } = item;
  return <Card className="cut-feed-card cut-timeline-event-card">
    <div className="cut-timeline-event-card__media">
      {event.image ? <img src={imageUrl(event.image)} alt={event.title} loading="lazy" /> : <div className="cut-event-card__placeholder"><i className="fa-regular fa-calendar" /></div>}
      <div className="cut-timeline-event-card__badges"><Badge bg={event.is_featured ? "warning" : "dark"} text={event.is_featured ? "dark" : undefined}>{event.is_featured ? "Destaque" : reasonLabel[event.feed_reason] || "Evento"}</Badge>{event.passes_count > 0 && <Badge bg="success">{event.passes_count} ingresso(s)</Badge>}</div>
    </div>
    <Card.Body>
      <div className="cut-feed-source"><span>{event.production_name || "Cutinapp"}</span><small>{[event.city, event.uf].filter(Boolean).join(" - ")}</small></div>
      <h2>{event.title}</h2>
      <div className="cut-timeline-event-card__facts"><span><i className="fa-regular fa-calendar" /> {fmt(event.start_date)}</span>{event.venue && <span><i className="fa-solid fa-location-dot" /> {event.venue}</span>}{event.price_from !== null && <span><i className="fa-solid fa-ticket" /> A partir de {money(event.price_from)}</span>}</div>
      {event.description && <p className="cut-timeline-event-card__description">{event.description}</p>}
      <div className="cut-timeline-event-card__social"><span><i className="fa-regular fa-heart" /> {event.engagement_count || 0} interessados</span><span><i className="fa-solid fa-fire" /> {event.passes_count || 0} ingressos emitidos</span></div>
      <div className="cut-timeline-event-card__actions"><Button variant="outline-light" onClick={() => onInterested?.(event)} disabled={event.feed_reason === "interest" || event.feed_reason === "ticket"}>{event.feed_reason === "ticket" ? "Ingresso garantido" : event.feed_reason === "interest" ? "Tenho interesse" : "Tenho interesse"}</Button><Button variant="outline-light" onClick={() => onOpen?.(event)}>Ver evento</Button><Button onClick={() => onTicket?.(event)}>Ingressos</Button></div>
    </Card.Body>
  </Card>;
}

TimelineEventCard.propTypes = { item: PropTypes.shape({ event: PropTypes.object.isRequired }).isRequired, onOpen: PropTypes.func, onTicket: PropTypes.func, onInterested: PropTypes.func };
TimelineEventCard.defaultProps = { onOpen: undefined, onTicket: undefined, onInterested: undefined };
