import React, { useEffect, useState } from "react";
import { Alert, Button, Card, Col, Container, Row } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import eventService from "../../services/EventService";

const formatDate = (value) => {
  if (!value) return "Data não informada";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
};

export default function EventManagePage() {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    eventService
      .myEvents()
      .then((items) => active && setEvents(items))
      .catch((err) => active && setError(err?.message || "Não foi possível carregar seus eventos."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="cut-app-page">
      <NavlogComponent />
      {loading && <ProcessingIndicatorComponent label="Carregando eventos" />}
      <Container className="cut-page-container py-4 py-lg-5">
        <div className="cut-page-heading">
          <div>
            <span className="cut-eyebrow">Área do produtor</span>
            <h1>Meus eventos</h1>
            <p>Crie lotes de cortesia, acompanhe eventos e abra a portaria para validar entradas.</p>
          </div>
          <Button onClick={() => navigate("/event/create")}><i className="fa-solid fa-plus me-2" />Novo evento</Button>
        </div>

        {error && <Alert variant="danger">{error}</Alert>}

        {!loading && events.length === 0 ? (
          <Card className="cut-empty-state">
            <Card.Body>
              <h2>Nenhum evento criado</h2>
              <p>Crie sua produção e publique o primeiro evento.</p>
              <Button onClick={() => navigate("/event/create")}>Criar evento</Button>
            </Card.Body>
          </Card>
        ) : (
          <Row className="g-4">
            {events.map((event) => (
              <Col lg={6} key={event.id}>
                <Card className="cut-panel h-100">
                  <Card.Body className="p-4">
                    <span className="cut-eyebrow">{event.production?.name || "Produção"}</span>
                    <h2 className="cut-section-title mt-2">{event.title}</h2>
                    <p>{formatDate(event.start_date)}</p>
                    <p className="text-secondary">{event.venue || event.address}</p>
                    <div className="cut-card-actions mt-4">
                      <Button onClick={() => navigate(`/ticket/create?eventId=${event.id}`)}>Criar cortesia</Button>
                      <Button variant="outline-light" onClick={() => navigate("/checkin")}>Abrir portaria</Button>
                      {event.slug && <Button variant="outline-light" onClick={() => navigate(`/event/${event.slug}`)}>Ver página</Button>}
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
