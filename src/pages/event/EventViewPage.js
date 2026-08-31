import React, { useContext, useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Row } from "react-bootstrap";
import { useNavigate, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import { AuthContext } from "../../context/AuthContext";
import eventService from "../../services/EventService";
import cutinappService from "../../services/CutinappService";
import { storageUrl } from "../../config";

const formatDate = (value) => {
  if (!value) return "Data não informada";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(value));
};

export default function EventViewPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [claimingId, setClaimingId] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;
    eventService
      .view(slug)
      .then((response) => active && setData(response))
      .catch((err) => active && setError(err?.message || "Não foi possível carregar este evento."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [slug]);

  const event = data?.event || null;
  const tickets = useMemo(
    () => (data?.tickets || event?.tickets || []).filter((ticket) => Number(ticket.price) === 0),
    [data, event]
  );
  const isOwner = Boolean(event?.production?.user_id && Number(event.production.user_id) === Number(user?.id));

  const claim = async (ticket) => {
    setClaimingId(ticket.id);
    setError("");
    setSuccess("");
    try {
      await cutinappService.claimCourtesy(ticket.id);
      setSuccess("Cortesia retirada. Seu QR Code já está disponível.");
      window.setTimeout(() => navigate("/passes"), 700);
    } catch (err) {
      setError(err?.message || "Não foi possível retirar esta cortesia.");
    } finally {
      setClaimingId(null);
    }
  };

  return (
    <div className="cut-app-page">
      <NavlogComponent />
      {(loading || claimingId) && (
        <ProcessingIndicatorComponent label={claimingId ? "Reservando cortesia" : "Carregando evento"} />
      )}

      {!loading && event && (
        <>
          <section
            className="cut-event-hero"
            style={event.image ? { backgroundImage: `linear-gradient(180deg, rgba(3,10,16,.15), rgba(3,10,16,.95)), url(${storageUrl}${event.image})` } : undefined}
          >
            <Container className="cut-page-container">
              <div className="cut-event-hero__content">
                <Badge bg="success" className="mb-3">Evento</Badge>
                <h1>{event.title}</h1>
                <p>{formatDate(event.start_date)}</p>
                <span>{event.venue || event.address}</span>
              </div>
            </Container>
          </section>

          <Container className="cut-page-container py-4 py-lg-5">
            {error && <Alert variant="danger">{error}</Alert>}
            {success && <Alert variant="success">{success}</Alert>}

            <Row className="g-4">
              <Col lg={8}>
                <Card className="cut-panel mb-4">
                  <Card.Body className="p-4">
                    <span className="cut-eyebrow">Sobre o evento</span>
                    <h2 className="cut-section-title mt-2">{event.title}</h2>
                    <p className="cut-body-copy">{event.description}</p>
                    <div className="cut-event-details">
                      <div><i className="fa-regular fa-calendar" /><span><strong>Início</strong>{formatDate(event.start_date)}</span></div>
                      <div><i className="fa-solid fa-location-dot" /><span><strong>Local</strong>{event.venue || event.address}</span></div>
                      {event.city && <div><i className="fa-solid fa-map" /><span><strong>Cidade</strong>{event.city}{event.uf ? ` - ${event.uf}` : ""}</span></div>}
                      {event.contact_phone && <div><i className="fa-solid fa-phone" /><span><strong>Contato</strong>{event.contact_phone}</span></div>}
                    </div>
                  </Card.Body>
                </Card>
              </Col>

              <Col lg={4}>
                <Card className="cut-panel cut-ticket-panel">
                  <Card.Body className="p-4">
                    <span className="cut-eyebrow">Entrada</span>
                    <h2 className="cut-section-title mt-2">Cortesias disponíveis</h2>

                    {tickets.length === 0 ? (
                      <div className="cut-empty-state-inline">
                        <p>Nenhuma cortesia gratuita disponível neste momento.</p>
                        {isOwner && (
                          <Button onClick={() => navigate(`/ticket/create?eventId=${event.id}`)}>Criar cortesia</Button>
                        )}
                      </div>
                    ) : (
                      <div className="cut-ticket-list">
                        {tickets.map((ticket) => (
                          <div className="cut-ticket-option" key={ticket.id}>
                            <div>
                              <strong>{ticket.name}</strong>
                              <span>Grátis · {ticket.quantity} disponíveis no lote</span>
                            </div>
                            <Button onClick={() => claim(ticket)} disabled={claimingId === ticket.id}>
                              Retirar cortesia
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    {isOwner && (
                      <div className="cut-owner-actions mt-4">
                        <Button variant="outline-light" onClick={() => navigate(`/ticket/create?eventId=${event.id}`)}>Novo lote</Button>
                        <Button variant="outline-light" onClick={() => navigate("/checkin")}>Abrir portaria</Button>
                      </div>
                    )}
                  </Card.Body>
                </Card>
              </Col>
            </Row>
          </Container>
        </>
      )}

      {!loading && !event && (
        <Container className="cut-page-container py-5">
          <Alert variant="danger">{error || "Evento não encontrado."}</Alert>
        </Container>
      )}
    </div>
  );
}
