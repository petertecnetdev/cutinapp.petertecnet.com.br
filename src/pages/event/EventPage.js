import React, { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Row } from "react-bootstrap";
import { useNavigate, useSearchParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import EventPosterThumbnail from "../../components/event/EventPosterThumbnail";
import EventDateCarousel from "../../components/event/EventDateCarousel";
import eventService from "../../services/EventService";
import cutinappService from "../../services/CutinappService";
import { readDiscoveryPreference } from "../../utils/discoveryFilters";
import "./EventPage.css";

const formatDate = (value) => value
  ? new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value))
  : "Data não informada";

const formatEventLocation = (event) => {
  const cityState = event?.city
    ? `${event.city}${event.uf ? ` - ${event.uf}` : ""}`
    : "";
  const venue = event?.venue || event?.address || "";

  if (venue && cityState) return `${venue} · ${cityState}`;
  return venue || cityState || "Local a confirmar";
};

const ticketPriceLabel = (event) => {
  const price = Number(event?.starting_price);
  if (event?.ticket_availability_status === "free_available" || (Number.isFinite(price) && price === 0)) return "Grátis";
  if (Number.isFinite(price) && price > 0) return `A partir de ${price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`;
  return null;
};

const ticketAvailabilityBadge = (event) => {
  switch (event?.ticket_availability_status) {
    case "free_available": return { bg: "success", label: "Gratuito" };
    case "available": return { bg: "primary", label: "Ingressos disponíveis" };
    case "temporarily_reserved": return { bg: "secondary", label: "Reservado no momento" };
    case "sold_out": return { bg: "secondary", label: "Esgotado" };
    case "sales_ended": return { bg: "secondary", label: "Vendas encerradas" };
    case "tickets_pending": return { bg: "warning", text: "dark", label: "Ingressos em breve" };
    default:
      if (Number(event?.sellable_free_ticket_lots_count ?? event?.free_ticket_lots_count ?? 0) > 0) return { bg: "success", label: "Gratuito" };
      if (Number(event?.sellable_ticket_lots_count ?? 0) > 0) return { bg: "primary", label: "Ingressos disponíveis" };
      if (Number(event?.ticket_lots_count ?? 0) > 0) return { bg: "secondary", label: "Indisponível no momento" };
      return { bg: "warning", text: "dark", label: "Ingressos em breve" };
  }
};

const DATE_FILTER_KEYS = new Set(["city", "uf", "date", "page"]);

export default function EventPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [events, setEvents] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const filters = useMemo(() => ({
    city: searchParams.get("city") || "",
    uf: searchParams.get("uf") || "",
    date: searchParams.get("date") || "",
    page: Math.max(1, Number(searchParams.get("page") || 1)),
  }), [searchParams]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    let changed = false;
    Array.from(next.keys()).forEach((key) => {
      if (!DATE_FILTER_KEYS.has(key)) {
        next.delete(key);
        changed = true;
      }
    });
    if (changed) setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (filters.city || searchParams.has("city")) return;
    const saved = readDiscoveryPreference();
    if (!saved?.city) return;

    const next = new URLSearchParams(searchParams);
    next.set("city", saved.city);
    if (saved.uf) next.set("uf", saved.uf);
    setSearchParams(next, { replace: true });
  }, [filters.city, searchParams, setSearchParams]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    cutinappService.publicEvents({
      city: filters.city || undefined,
      uf: filters.uf || undefined,
      date: filters.date || undefined,
      page: filters.page,
      view: "compact",
      per_page: 18,
      sort: "soonest",
    })
      .then((response) => {
        if (!active) return;
        setEvents(response.events?.data || []);
        setPagination(response.events || null);
      })
      .catch((err) => {
        if (active) setError(err?.message || "Não foi possível buscar eventos agora.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [filters.city, filters.uf, filters.date, filters.page]);

  const update = (changes) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(changes).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "" || value === false) next.delete(key);
      else next.set(key, String(value));
    });
    if (!("page" in changes)) next.delete("page");
    setSearchParams(next);
  };

  const handleDateSelect = (date) => update({ date });
  const resultTotal = Number(pagination?.total ?? events.length);

  return (
    <div className="cut-app-page cut-event-discovery-page">
      <NavlogComponent />
      {loading && <ProcessingIndicatorComponent label="Buscando eventos" />}
      <Container className="cut-page-container py-4 py-lg-5">
        <div className="cut-page-heading">
          <div>
            <span className="cut-eyebrow">Descoberta</span>
            <h1>{filters.city ? `Eventos em ${filters.city}` : "Encontre seu próximo evento"}</h1>
            <p>Deslize pelas datas e toque em um dia para ver somente os eventos publicados naquela data.</p>
          </div>
          <Button variant="outline-light" onClick={() => navigate("/passes")}>
            <i className="fa-solid fa-ticket me-2" />Minha carteira
          </Button>
        </div>

        {error && <Alert variant="danger">{error}</Alert>}

        <EventDateCarousel
          city={filters.city}
          uf={filters.uf}
          selectedDate={filters.date}
          onSelect={handleDateSelect}
        />

        {!loading && events.length === 0 ? (
          <Card className="cut-empty-state">
            <Card.Body>
              <i className="fa-regular fa-calendar-xmark cut-empty-icon" />
              <h2>{filters.date ? "Não encontramos eventos publicados nesta data." : "Nenhum evento publicado no momento."}</h2>
              <p>{filters.date ? "Escolha outra data acima ou volte a visualizar todos os eventos." : "Assim que novos eventos forem publicados, eles aparecerão aqui."}</p>
              {filters.date && (
                <div className="cut-card-actions justify-content-center">
                  <Button variant="outline-light" onClick={() => handleDateSelect("")}>Ver todos os eventos</Button>
                </div>
              )}
            </Card.Body>
          </Card>
        ) : (
          <>
            {!loading && (
              <div className="cut-event-discovery-results" aria-live="polite">
                <div className="cut-event-discovery-results__title">
                  <strong>{resultTotal} {resultTotal === 1 ? "evento encontrado" : "eventos encontrados"}</strong>
                  <span>
                    {filters.date
                      ? "Mostrando somente os eventos da data selecionada"
                      : filters.city
                        ? `Mostrando os próximos eventos em ${filters.city}`
                        : "Explore os próximos eventos disponíveis na Cutinapp"}
                  </span>
                </div>
                <span className="cut-event-discovery-results__hint">
                  <i className="fa-solid fa-arrow-pointer" />Clique em um evento para ver detalhes e ingressos
                </span>
              </div>
            )}

            <Row className="cut-event-discovery-grid">
              {events.map((event) => {
                const availabilityBadge = ticketAvailabilityBadge(event);
                return (
                  <Col xs={12} sm={6} md={4} lg={3} xxl={2} key={event.id}>
                    <Card
                      className="cut-event-card h-100"
                      role="button"
                      tabIndex={0}
                      aria-label={`Abrir evento ${event.title}`}
                      onMouseEnter={() => eventService.view(event.slug).catch(() => {})}
                      onFocus={() => eventService.view(event.slug).catch(() => {})}
                      onClick={() => navigate(`/event/${event.slug}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          navigate(`/event/${event.slug}`);
                        }
                      }}
                    >
                      <div className="cut-event-card__media">
                        <EventPosterThumbnail image={event.image} title={event.title} alt={event.title} className="cut-event-card__poster" loading="lazy" />
                      </div>
                      <Card.Body>
                        <div className="cut-event-card__badges">{event.category && <Badge bg="dark">{event.category}</Badge>}<Badge bg={availabilityBadge.bg} text={availabilityBadge.text}>{availabilityBadge.label}</Badge></div>
                        <span className="cut-eyebrow">{event.production?.name || "Cutinapp"}</span>
                        <h2>{event.title}</h2>
                        <div className="cut-event-card__meta">
                          <span><i className="fa-regular fa-calendar" />{formatDate(event.start_date)}</span>
                          <span><i className="fa-solid fa-location-dot" />{formatEventLocation(event)}</span>
                          {event.artists?.length > 0 && <span><i className="fa-solid fa-music" />{event.artists.slice(0, 3).map((a) => a.stage_name).join(" · ")}</span>}
                          {event.distance_km != null && <span><i className="fa-solid fa-route" />{Number(event.distance_km).toFixed(1)} km de você</span>}
                          {ticketPriceLabel(event) && <span><i className="fa-solid fa-ticket" />{ticketPriceLabel(event)}</span>}
                        </div>
                      </Card.Body>
                    </Card>
                  </Col>
                );
              })}
            </Row>
          </>
        )}

        {pagination?.last_page > 1 && (
          <div className="cut-pagination mt-4">
            <Button variant="outline-light" disabled={pagination.current_page <= 1} onClick={() => update({ page: pagination.current_page - 1 })}>Anterior</Button>
            <span>Página {pagination.current_page} de {pagination.last_page}</span>
            <Button variant="outline-light" disabled={pagination.current_page >= pagination.last_page} onClick={() => update({ page: pagination.current_page + 1 })}>Próxima</Button>
          </div>
        )}
      </Container>
    </div>
  );
}
