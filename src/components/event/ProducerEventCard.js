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
import EventArtwork from "./EventArtwork";
import { storageUrl } from "../../config";
import {
  eventAlerts,
  eventHealth,
  eventOperationalMetrics,
  eventPerformance,
  moneyBR,
} from "../../utils/eventManagerInsights";
import { isEventPaymentReady, requiresPaymentSetup } from "../../utils/eventSalesReadiness";

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

const artistState = (artist) => {
  const status = String(artist?.pivot?.status || "").toLowerCase();
  if (["invited", "pending", "pending_acceptance"].includes(status)) return { label: "convite pendente", tone: "warning" };
  if (["declined", "rejected", "cancelled"].includes(status)) return { label: "não confirmado", tone: "danger" };
  return null;
};

const ArtistsInline = ({ event, onOpen, compact = false }) => {
  const artists = Array.isArray(event?.artists) ? event.artists : [];
  if (!artists.length) {
    return <span className="cut-event-artists-empty"><i className="fa-solid fa-user-plus" />Sem artista vinculado</span>;
  }

  const visible = artists.slice(0, compact ? 3 : 4);
  const remaining = Math.max(0, artists.length - visible.length);

  return <div className={`cut-event-artists-inline${compact ? " is-compact" : ""}`}>
    {visible.map((artist) => {
      const state = artistState(artist);
      return <button
        type="button"
        key={artist.id}
        className="cut-event-artist-chip"
        onClick={() => onOpen?.(artist)}
        title={state ? `${artist.stage_name || "Artista"} · ${state.label}` : artist.stage_name}
      >
        <span className="cut-event-artist-chip__avatar">
          {artist.photo
            ? <img src={mediaUrl(artist.photo)} alt="" loading="lazy" decoding="async" />
            : initials(artist.stage_name, "AR")}
        </span>
        <span className="cut-event-artist-chip__copy">
          <b>{artist.stage_name || "Artista"}</b>
          {state && <small className={`is-${state.tone}`}>{state.label}</small>}
        </span>
      </button>;
    })}
    {remaining > 0 && <span className="cut-event-artists-more">+{remaining}</span>}
  </div>;
};

function ProducerEventCard({
  event,
  readiness,
  status,
  selected,
  pinned,
  viewMode = "compact",
  disabled = false,
  actions,
  onToggleSelected,
  onTogglePin,
  onQuickView,
  onEdit,
  onPrimaryAction,
  onDuplicate,
  onArtistOpen,
}) {
  const metrics = eventOperationalMetrics(event);
  const eventImage = event.image;
  const health = eventHealth(event);
  const performance = eventPerformance(event);
  const alerts = eventAlerts(event);
  const paymentBlocked = requiresPaymentSetup(event) && !isEventPaymentReady(event);
  const effectiveReadiness = paymentBlocked ? {
    ...readiness,
    completed: Math.min(Number(readiness?.completed || 0), 2),
    title: "Ativar recebimentos",
    label: event?.payment_readiness?.message || "Ative os recebimentos da produção antes de divulgar ingressos pagos.",
    action: "Configurar",
    icon: "fa-brands fa-pix",
    mode: "finance",
    route: `/producer/finance?production=${event?.production?.id || event?.production_id || ""}`,
  } : readiness;
  const readinessPending = !event.is_cancelled && !event.has_ended && Number(effectiveReadiness?.completed || 0) < 3;
  const issueCount = alerts.length + (readinessPending ? 1 : 0);
  const firstAlert = alerts[0] || null;
  const firstIssue = firstAlert?.title || (readinessPending ? effectiveReadiness?.title : "");
  const alertResolution = firstAlert && (firstAlert.route || firstAlert.mode) ? {
    completed: 0,
    title: firstAlert.title,
    label: firstAlert.detail,
    action: "Resolver",
    icon: firstAlert.icon,
    route: firstAlert.route || null,
    mode: firstAlert.mode || null,
  } : null;
  const nextAction = alertResolution || effectiveReadiness;
  const needsAttention = !event.is_cancelled && !event.has_ended
    && (readinessPending || health.score < 55 || performance.rank <= 3);
  const compact = viewMode === "compact";

  if (compact) {
    return <article className={[
      "cut-producer-event-card",
      "is-compact",
      "is-readable-card",
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
        <EventArtwork image={eventImage} title={event.title} alt="" loading="lazy" decoding="async" />
      </button>

      <div className="cut-producer-event-card__main">
        <div className="cut-producer-event-card__title-row">
          <button type="button" className="cut-producer-event-card__title" onClick={() => onQuickView?.(event)} title="Abrir Central do Evento">{event.title}</button>
          <button type="button" className={`cut-event-pin${pinned ? " is-active" : ""}`} onClick={() => onTogglePin?.(event.id)} aria-label={pinned ? "Desafixar evento" : "Fixar evento"} title={pinned ? "Desafixar evento" : "Fixar evento"}>
            <i className="fa-solid fa-thumbtack" />
          </button>
        </div>
        <div className="cut-producer-event-card__meta">
          <span className="cut-event-date"><i className="fa-regular fa-calendar" />{formatDate(event.start_date)}</span>
          <span><i className="fa-solid fa-building" />{event.production?.name || "Produção não informada"}</span>
          <span><i className="fa-solid fa-location-dot" />{event.venue || event.address || event.city || "Local não informado"}</span>
        </div>
      </div>

      {Array.isArray(event.artists) && event.artists.length > 0 && <div className="cut-producer-event-card__artists" data-label="Artistas">
        <small className="cut-event-field-label">Artistas</small>
        <ArtistsInline event={event} onOpen={onArtistOpen} compact />
      </div>}

      <div className="cut-producer-event-card__status" data-label="Status">
        <small className="cut-event-field-label">Status</small>
        <Badge bg={status.variant}>{status.label}</Badge>
      </div>

      <div className="cut-producer-event-card__sales" data-label="Vendas">
        <small className="cut-event-field-label">Ingressos e vendas</small>
        <strong>{metrics.ticketsSold.toLocaleString("pt-BR")} vendidos</strong>
        <span>{moneyBR(metrics.grossSales)}</span>
        <small>{metrics.ticketsRemaining.toLocaleString("pt-BR")} restante(s)</small>
      </div>

      <div className={`cut-producer-event-card__issues${issueCount ? " has-issues" : " is-ready"}`} data-label="Pendências">
        {issueCount ? <>
          <strong><i className="fa-solid fa-triangle-exclamation" />{issueCount} pendência{issueCount === 1 ? "" : "s"}</strong>
          <span title={firstIssue}>{firstIssue}</span>
          {nextAction && <Button size="sm" variant="outline-light" onClick={() => onPrimaryAction?.(event, nextAction)} disabled={disabled}>Resolver</Button>}
        </> : <>
          <strong><i className="fa-solid fa-circle-check" />Pronto</strong>
          <span>Sem bloqueios operacionais</span>
        </>}
      </div>

      <div className="cut-producer-event-card__quick-actions" data-label="Ações">
        <Button variant="outline-light" size="sm" onClick={() => onQuickView?.(event)} title="Central do Evento" aria-label={`Abrir central de ${event.title}`}><i className="fa-solid fa-gauge-high" /><span>Ver evento</span></Button>
        <Button variant="outline-light" size="sm" onClick={() => onEdit?.(event)} title="Editar" aria-label={`Editar ${event.title}`} disabled={disabled}><i className="fa-solid fa-pen" /><span>Editar</span></Button>
        {actions}
      </div>
    </article>;
  }

  return <article className={[
    "cut-producer-event-card",
    "is-visual",
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
      <EventArtwork image={eventImage} title={event.title} alt="" loading="lazy" decoding="async" />
      <span className="cut-producer-event-card__media-overlay"><i className="fa-regular fa-eye" />Visão rápida</span>
    </button>

    <div className="cut-producer-event-card__main">
      <div className="cut-producer-event-card__eyebrow">
        <Badge bg={status.variant}>{status.label}</Badge>
        <EventPerformanceBadge event={event} />
        {pinned && <span className="cut-producer-event-card__pinned"><i className="fa-solid fa-thumbtack" />Fixado</span>}
      </div>

      <div className="cut-producer-event-card__title-row">
        <button type="button" className="cut-producer-event-card__title" onClick={() => onQuickView?.(event)} title="Abrir Central do Evento">{event.title}</button>
        <button type="button" className={`cut-event-pin${pinned ? " is-active" : ""}`} onClick={() => onTogglePin?.(event.id)} aria-label={pinned ? "Desafixar evento" : "Fixar evento"} title={pinned ? "Desafixar evento" : "Fixar evento"}>
          <i className="fa-solid fa-thumbtack" />
        </button>
      </div>

      <div className="cut-producer-event-card__meta">
        <span><i className="fa-solid fa-building" />{event.production?.name || "Produção não informada"}</span>
        <span><i className="fa-regular fa-calendar" />{formatDate(event.start_date)}</span>
        <span><i className="fa-solid fa-location-dot" />{event.venue || event.address || event.city || "Local não informado"}</span>
      </div>

      <ArtistsInline event={event} onOpen={onArtistOpen} />
      <EventAlertChips event={event} />

      <div className="cut-producer-event-card__ops">
        <EventMetrics event={event} compact={false} />
        <div className="cut-producer-event-card__health">
          <span>Saúde</span>
          <EventHealthBadge event={event} showLabel />
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

      {!event.is_cancelled && nextAction && <div className="cut-producer-event-card__next">
        <small>Próxima ação</small>
        <strong>{nextAction.title}</strong>
        <span>{nextAction.label}</span>
        <Button
          size="sm"
          variant={nextAction.mode === "whatsapp" ? "success" : "light"}
          onClick={() => onPrimaryAction?.(event, nextAction)}
          disabled={disabled}
        >
          <i className={`${nextAction.icon} me-2`} />{nextAction.action}
        </Button>
      </div>}

      <div className="cut-producer-event-card__quick-actions">
        <Button variant="outline-light" size="sm" onClick={() => onQuickView?.(event)} title="Central do Evento"><i className="fa-solid fa-gauge-high" /></Button>
        <Button variant="outline-light" size="sm" onClick={() => onEdit?.(event)} title="Editar"><i className="fa-solid fa-pen" /></Button>
        <Button variant="outline-light" size="sm" onClick={() => onDuplicate?.(event)} title="Duplicar +7 dias"><i className="fa-regular fa-copy" /></Button>
        {actions}
      </div>
    </aside>
  </article>;
}


const sameProducerEventCard = (previous, next) => (
  previous.event === next.event
  && previous.selected === next.selected
  && previous.pinned === next.pinned
  && previous.viewMode === next.viewMode
  && previous.disabled === next.disabled
);

export default React.memo(ProducerEventCard, sameProducerEventCard);

