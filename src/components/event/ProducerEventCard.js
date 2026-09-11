/* eslint-disable react/prop-types */
import React from "react";
import { Badge, Button, Form } from "react-bootstrap";
import {
  EventAgendaDays,
  EventAlertChips,
  EventHealthBadge,
  EventMetrics,
  EventPerformanceBadge,
} from "./EventManagerEnhancements";
import { storageUrl } from "../../config";
import { eventOperationalMetrics } from "../../utils/eventManagerInsights";

const mediaUrl = (path) => {
  if (!path) return "";
  const value = String(path);
  if (/^https?:\/\//i.test(value)) return value;
  return `${storageUrl}${value.replace(/^\//, "")}`;
};

const initials = (value, fallback = "EV") => String(value || "")
  .trim()
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part.charAt(0).toUpperCase())
  .join("") || fallback;

const formatDate = (value) => value
  ? new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
  : "Data não informada";

export default function ProducerEventCard({
  event,
  readiness,
  status,
  selected,
  pinned,
  viewMode = "visual",
  disabled = false,
  actions,
  onToggleSelected,
  onTogglePin,
  onQuickView,
  onEdit,
  onPrimaryAction,
  onDuplicate,
}) {
  const metrics = eventOperationalMetrics(event);
  const eventImage = event.image;
  const needsAttention = !event.is_cancelled && (readiness?.completed || 0) < 3;
  const compact = viewMode === "compact";

  return <article className={[
    "cut-producer-event-card",
    compact ? "is-compact" : "is-visual",
    needsAttention ? "is-attention" : "",
    selected ? "is-selected" : "",
    pinned ? "is-pinned" : "",
  ].filter(Boolean).join(" ")}>
    <div className="cut-producer-event-card__select">
      <Form.Check
        type="checkbox"
        checked={selected}
        onChange={() => onToggleSelected?.(event.id)}
        disabled={disabled}
        aria-label={`Selecionar ${event.title}`}
      />
    </div>

    <button type="button" className="cut-producer-event-card__media" onClick={() => onQuickView?.(event)} aria-label={`Ver resumo de ${event.title}`}>
      {eventImage
        ? <img src={mediaUrl(eventImage)} alt="" loading="lazy" />
        : <span>{initials(event.title)}</span>}
      <span className="cut-producer-event-card__media-overlay"><i className="fa-regular fa-eye" />Visão rápida</span>
    </button>

    <div className="cut-producer-event-card__main">
      <div className="cut-producer-event-card__eyebrow">
        <Badge bg={status.variant}>{status.label}</Badge>
        <EventPerformanceBadge event={event} />
        {pinned && <span className="cut-producer-event-card__pinned"><i className="fa-solid fa-thumbtack" />Fixado</span>}
      </div>

      <div className="cut-producer-event-card__title-row">
        <button type="button" className="cut-producer-event-card__title" onClick={() => onEdit?.(event)}>{event.title}</button>
        <button type="button" className={`cut-event-pin${pinned ? " is-active" : ""}`} onClick={() => onTogglePin?.(event.id)} aria-label={pinned ? "Desafixar evento" : "Fixar evento"} title={pinned ? "Desafixar evento" : "Fixar evento"}>
          <i className="fa-solid fa-thumbtack" />
        </button>
      </div>

      <div className="cut-producer-event-card__meta">
        <span><i className="fa-solid fa-building" />{event.production?.name || "Produção não informada"}</span>
        <span><i className="fa-regular fa-calendar" />{formatDate(event.start_date)}</span>
        <span><i className="fa-solid fa-location-dot" />{event.venue || event.address || event.city || "Local não informado"}</span>
      </div>

      <EventAlertChips event={event} />

      <div className="cut-producer-event-card__ops">
        <EventMetrics event={event} compact={compact} />
        <div className="cut-producer-event-card__health">
          <span>Saúde</span>
          <EventHealthBadge event={event} showLabel={!compact} />
        </div>
        <EventAgendaDays event={event} />
      </div>
    </div>

    <aside className="cut-producer-event-card__side">
      <div className="cut-producer-event-card__inventory" title="Ingressos emitidos e estoque restante">
        <span><i className="fa-solid fa-ticket" />Estoque</span>
        <strong>{metrics.passesIssued}{metrics.ticketCapacity ? ` / ${metrics.ticketCapacity}` : ""}</strong>
        <small>{metrics.ticketsRemaining} restante(s){metrics.ticketsReserved > 0 ? ` · ${metrics.ticketsReserved} reservado(s)` : ""}</small>
      </div>

      {!event.is_cancelled && readiness && <div className="cut-producer-event-card__next">
        <small>Próxima ação</small>
        <strong>{readiness.title}</strong>
        {!compact && <span>{readiness.label}</span>}
        <Button
          size="sm"
          variant={readiness.mode === "whatsapp" ? "success" : "light"}
          onClick={() => onPrimaryAction?.(event, readiness)}
          disabled={disabled}
        >
          <i className={`${readiness.icon} me-2`} />{readiness.action}
        </Button>
      </div>}

      <div className="cut-producer-event-card__quick-actions">
        <Button variant="outline-light" size="sm" onClick={() => onQuickView?.(event)} title="Visão rápida"><i className="fa-regular fa-eye" /></Button>
        <Button variant="outline-light" size="sm" onClick={() => onEdit?.(event)} title="Editar"><i className="fa-solid fa-pen" /></Button>
        <Button variant="outline-light" size="sm" onClick={() => onDuplicate?.(event)} title="Duplicar +7 dias"><i className="fa-regular fa-copy" /></Button>
        {actions}
      </div>
    </aside>
  </article>;
}
