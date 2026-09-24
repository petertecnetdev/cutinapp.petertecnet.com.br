import React from "react";
import PropTypes from "prop-types";
import { Button } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import EventArtwork from "../event/EventArtwork";

const eventStart = (event) => event?.start_date || event?.starts_at || event?.start_at || event?.date || null;

const formatDate = (value) => {
  if (!value) return "Data a definir";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data a definir";
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(date);
};

const parsePrice = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = String(value ?? "").trim().replace(/[^\d,.-]/g, "");
  if (!raw) return null;
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const priceLabel = (event) => {
  if (event?.is_free === true || event?.free === true || event?.ticket_availability_status === "free_available") return "Entrada gratuita";
  const value = [
    event?.starting_price,
    event?.min_price,
    event?.price_from,
    event?.lowest_price,
    event?.ticket_price,
    event?.price,
  ].find((candidate) => candidate !== null && candidate !== undefined && candidate !== "");
  const numeric = parsePrice(value);
  if (numeric === null || numeric < 0) return "";
  if (numeric === 0) return "Entrada gratuita";
  return "Ingressos a partir de " + new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(numeric);
};

const locationLabel = (event, production) => {
  const venue = typeof event?.venue === "string" ? event.venue : event?.venue?.name;
  return venue || event?.place || event?.location?.name || event?.city || production?.city || "Local a definir";
};

const hasTickets = (event) => {
  const status = String(event?.ticket_availability_status || "").toLowerCase();
  return Boolean(
    event?.tickets_count ||
    event?.ticket_count ||
    event?.has_tickets ||
    status.includes("available") ||
    status.includes("sellable")
  );
};

export default function ProductionNextEventHero({
  event,
  production,
  allTo,
  emptyTitle,
  emptyText,
}) {
  const navigate = useNavigate();

  if (!event) {
    return (
      <section className="cut-production-next-event cut-production-next-event--empty" aria-label="Próximo evento">
        <div>
          <span className="cut-eyebrow">Próximo evento</span>
          <h2>{emptyTitle}</h2>
          <p>{emptyText}</p>
        </div>
        {allTo && <Button variant="outline-light" onClick={() => navigate(allTo)}>Ver agenda</Button>}
      </section>
    );
  }

  const slug = event?.slug;
  const price = priceLabel(event);
  const tickets = hasTickets(event);
  const title = event?.title || "Evento Cutinapp";

  return (
    <section className="cut-production-next-event" aria-labelledby="cut-production-next-event-title">
      <div className="cut-production-next-event__media">
        <EventArtwork
          image={event?.image}
          title={title}
          alt={title}
          loading="eager"
          fetchPriority="high"
          decoding="async"
          fallbackClassName="cut-production-next-event__fallback"
        />
        <span className="cut-production-next-event__badge">Próxima experiência</span>
      </div>

      <div className="cut-production-next-event__body">
        <span className="cut-eyebrow">Próximo evento</span>
        <h2 id="cut-production-next-event-title">{title}</h2>
        <div className="cut-production-next-event__meta">
          <span><i className="fa-regular fa-calendar" />{formatDate(eventStart(event))}</span>
          <span><i className="fa-solid fa-location-dot" />{locationLabel(event, production)}</span>
          {price && <span><i className="fa-solid fa-ticket" />{price}</span>}
        </div>
        <div className="cut-production-next-event__actions">
          {slug && (
            <Button onClick={() => navigate("/event/" + encodeURIComponent(slug))}>
              {tickets ? "Ver evento e ingressos" : "Ver evento"}
              <i className="fa-solid fa-arrow-right ms-2" />
            </Button>
          )}
          {allTo && <Button variant="outline-light" onClick={() => navigate(allTo)}>Agenda completa</Button>}
        </div>
      </div>
    </section>
  );
}

ProductionNextEventHero.propTypes = {
  event: PropTypes.object,
  production: PropTypes.object,
  allTo: PropTypes.string,
  emptyTitle: PropTypes.string,
  emptyText: PropTypes.string,
};

ProductionNextEventHero.defaultProps = {
  event: null,
  production: null,
  allTo: "",
  emptyTitle: "Novas datas em breve",
  emptyText: "Assim que a próxima experiência for publicada, ela aparecerá em destaque aqui.",
};
