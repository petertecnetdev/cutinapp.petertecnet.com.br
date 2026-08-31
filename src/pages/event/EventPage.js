import React, { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import eventService from "../../services/EventService";
import { storageUrl } from "../../config";

const formatDate = (value) => {
  if (!value) return "Data não informada";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
};

export default function EventPage() {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let active = true;
    eventService
      .list({ per_page: 100 })
      .then((items) => active && setEvents(items))
      .catch((err) => active && setError(err?.message || "Não foi possível carregar os eventos."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const filtered = events.filter((event) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return [event.title, event.city, event.venue, event.production?.name]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(term));
  });

  return (
    <div className="cut-app-page">
      <NavlogComponent />
      {loading && <ProcessingIndicatorComponent label="Buscando eventos" />}

      <Container className="cut-page-container py-4 py-lg-5">
        <div className="cut-page-heading">
          <div>
            <span className="cut-eyebrow">Descobrir</span>
            <h1>Eventos</h1>
            <p>Encontre eventos, retire cortesias gratuitas e leve seu QR Code no celular.</p>
          </div>
          <Button variant="outline-light" onClick={() => navigate("/passes")}>Minhas cortesias</Button>
        </div>

        {error && <Alert variant="danger">{error}</Alert>}

        <div className="cut-search-bar mb-4">
          <i className="fa-solid fa-magnifying-glass" />
          <Form.Control
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por evento, cidade, local ou produção"
          />
        </div>

        {!loading && filtered.length === 0 ? (
          <Card className="cut-empty-state">
            <Card.Body>
              <h2>Nenhum evento encontrado</h2>
              <p>{search ? "Tente outro termo de busca." : "Ainda não existem eventos publicados."}</p>
            </Card.Body>
          </Card>
        ) : (
          <Row className="g-4">
            {filtered.map((event) => (
              <Col md={6} xl={4} key={event.id}>
                <Card className="cut-event-card h-100" role="button" onClick={() => navigate(`/event/${event.slug}`)}>
                  <div className="cut-event-card__media">
                    {event.image ? (
                      <img src={`${storageUrl}${String(event.image).replace(/^\//, "")}`} alt={event.title} />
                    ) : (
                      <div className="cut-event-card__placeholder"><i className="fa-regular fa-calendar" /></div>
                    )}
                    <Badge bg="success" className="cut-event-card__badge">Ver evento</Badge>
                  </div>
                  <Card.Body className="p-4">
                    <span className="cut-eyebrow">{event.production?.name || "Cutinapp"}</span>
                    <h2>{event.title}</h2>
                    <div className="cut-event-card__meta">
                      <span><i className="fa-regular fa-calendar" />{formatDate(event.start_date)}</span>
                      <span><i className="fa-solid fa-location-dot" />{event.venue || event.city || event.address || "Local a confirmar"}</span>
                    </div>
                  </Card.Body>
                </Card>
              </Col>
            ))}
          </Row>
        )}
      </Container>
    </div>
  );
}
