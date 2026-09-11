import React from "react";
import { Button, Offcanvas, ProgressBar } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import { storageUrl } from "../../config";
import {
  eventAlerts,
  eventHealth,
  eventOperationalMetrics,
  eventPerformance,
  moneyBR,
  weekdayShortLabel,
} from "../../utils/eventManagerInsights";

const imageUrl = (path) => {
  if (!path) return "";
  const value = String(path);
  if (/^https?:\/\//i.test(value)) return value;
  return `${storageUrl}${value.replace(/^\//, "")}`;
};

const initials = (value) => String(value || "EV")
  .trim()
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part.charAt(0).toUpperCase())
  .join("") || "EV";

const percent = (value) => `${Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

export function EventPerformanceBadge({ event }) {
  const performance = eventPerformance(event);
  return <span className={`cut-event-performance is-${performance.tone}`}><i className="fa-solid fa-chart-simple" />{performance.label}</span>;
}

export function EventHealthBadge({ event, showLabel = true }) {
  const health = eventHealth(event);
  return <span className={`cut-event-health is-${health.tone}`} title={`Saúde do evento: ${health.score}/100`}>
    <span className="cut-event-health__meter"><span style={{ width: `${health.score}%` }} /></span>
    <strong>{health.score}</strong>
    {showLabel && <small>{health.label}</small>}
  </span>;
}

export function EventAgendaDays({ event }) {
  const metrics = eventOperationalMetrics(event);
  if (!metrics.agendaDays.length) return <span className="cut-event-agenda-days is-empty"><i className="fa-regular fa-calendar" />Fora da agenda</span>;
  return <span className="cut-event-agenda-days"><i className="fa-solid fa-calendar-week" />{metrics.agendaDays.map((day) => <b key={day}>{weekdayShortLabel(day)}</b>)}</span>;
}

export function EventMetrics({ event, compact = false }) {
  const metrics = eventOperationalMetrics(event);
  return <div className={`cut-event-metrics${compact ? " is-compact" : ""}`}>
    <span title="Faturamento pago"><i className="fa-solid fa-brazilian-real-sign" /><b>{moneyBR(metrics.grossSales)}</b><small>faturado</small></span>
    <span title="Ingressos pagos"><i className="fa-solid fa-ticket" /><b>{metrics.ticketsSold}{metrics.ticketCapacity ? `/${metrics.ticketCapacity}` : ""}</b><small>vendidos</small></span>
    <span title="Visualizações e conversão"><i className="fa-regular fa-eye" /><b>{metrics.views}</b><small>{percent(metrics.conversionRate)} conv.</small></span>
    {!compact && <span title="Check-ins"><i className="fa-solid fa-qrcode" /><b>{metrics.checkedIn}</b><small>check-ins</small></span>}
  </div>;
}

export function EventAlertChips({ event }) {
  const alerts = eventAlerts(event);
  if (!alerts.length) return null;
  return <div className="cut-event-alert-chips">
    {alerts.map((alert) => <span key={alert.key} className={`is-${alert.tone}`} title={alert.detail}><i className={alert.icon} />{alert.title}</span>)}
  </div>;
}

export function EventQuickView({ event, show, onHide, onDuplicate, onAgenda }) {
  const navigate = useNavigate();
  if (!event) return null;

  const metrics = eventOperationalMetrics(event);
  const health = eventHealth(event);
  const performance = eventPerformance(event);
  const alerts = eventAlerts(event);
  const cover = event.image;

  return <Offcanvas show={show} onHide={onHide} placement="end" className="cut-event-quickview">
    <Offcanvas.Header closeButton>
      <Offcanvas.Title>Visão rápida</Offcanvas.Title>
    </Offcanvas.Header>
    <Offcanvas.Body>
      <div className="cut-event-quickview__cover">
        {cover ? <img src={imageUrl(cover)} alt="" /> : <span>{initials(event.title)}</span>}
        <div><EventPerformanceBadge event={event} /><EventHealthBadge event={event} /></div>
      </div>

      <div className="cut-event-quickview__heading">
        <small>{event.production?.name || "Produção"}</small>
        <h2>{event.title}</h2>
        <p><i className="fa-regular fa-calendar" /> {event.start_date ? new Date(event.start_date).toLocaleString("pt-BR") : "Data não informada"}</p>
        <p><i className="fa-solid fa-location-dot" /> {event.venue || event.address || event.city || "Local não informado"}</p>
      </div>

      <EventMetrics event={event} />
      <div className="cut-event-quickview__inventory">
        <div><span>Ocupação do estoque</span><strong>{percent(metrics.inventoryUtilizationRate)}</strong></div>
        <ProgressBar now={Math.min(100, metrics.inventoryUtilizationRate)} />
        <small>{metrics.ticketsRemaining} restante(s) · {metrics.passesIssued} emitido(s){metrics.ticketsReserved > 0 ? ` · ${metrics.ticketsReserved} reservado(s)` : ""}</small>
      </div>

      <div className="cut-event-quickview__health">
        <div><span>Saúde operacional</span><strong>{health.score}/100 · {health.label}</strong></div>
        <ProgressBar now={health.score} />
      </div>

      <EventAgendaDays event={event} />

      {alerts.length > 0 && <div className="cut-event-quickview__alerts">
        <h3>Pontos de atenção</h3>
        {alerts.map((alert) => <div key={alert.key} className={`is-${alert.tone}`}>
          <i className={alert.icon} />
          <div><strong>{alert.title}</strong><span>{alert.detail}</span></div>
        </div>)}
      </div>}

      <div className="cut-event-quickview__actions">
        <Button onClick={() => navigate(`/event/edit/${event.id}`)}><i className="fa-solid fa-pen me-2" />Editar</Button>
        <Button variant="outline-light" onClick={() => navigate(`/ticket/create?eventId=${event.id}`)}><i className="fa-solid fa-ticket me-2" />Ingressos</Button>
        <Button variant="outline-light" onClick={() => navigate(`/event/${event.id}/participants`)}><i className="fa-solid fa-users me-2" />Participantes</Button>
        {event.is_published && !event.is_cancelled && <Button variant="outline-light" onClick={() => navigate(`/checkin?eventId=${event.id}`)}><i className="fa-solid fa-qrcode me-2" />Portaria</Button>}
        {event.is_published && event.slug && <Button variant="outline-light" onClick={() => navigate(`/event/${event.slug}`)}><i className="fa-solid fa-arrow-up-right-from-square me-2" />Página pública</Button>}
        <Button variant="outline-light" onClick={() => { onDuplicate?.(event); onHide?.(); }}><i className="fa-regular fa-copy me-2" />Duplicar +7 dias</Button>
        {!event.is_cancelled && <Button variant="outline-light" onClick={() => { onAgenda?.(event); onHide?.(); }}><i className="fa-solid fa-calendar-week me-2" />Agenda semanal</Button>}
        <Button variant="outline-light" onClick={() => navigate("/producer/sales")}><i className="fa-solid fa-chart-line me-2" />Ver vendas</Button>
      </div>
    </Offcanvas.Body>
  </Offcanvas>;
}
