import React, { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import { useLocation, useNavigate } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import ticketService from "../../services/TicketService";
import eventService from "../../services/EventService";

export default function TicketCreatePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const requestedEventId = new URLSearchParams(location.search).get("eventId") || "";
  const [eventId, setEventId] = useState(requestedEventId);
  const [events, setEvents] = useState([]);
  const [name, setName] = useState("Cortesia");
  const [quantity, setQuantity] = useState(100);
  const [limitDate, setLimitDate] = useState("");
  const [description, setDescription] = useState("Entrada gratuita mediante apresentação do QR Code individual.");
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    eventService
      .myEvents()
      .then((items) => {
        if (!active) return;
        setEvents(items);
        const exists = items.some((item) => String(item.id) === String(requestedEventId));
        if (!exists && requestedEventId) setEventId("");
      })
      .catch((err) => active && setError(err?.message || "Não foi possível carregar seus eventos."))
      .finally(() => active && setInitialLoading(false));
    return () => {
      active = false;
    };
  }, [requestedEventId]);

  const canSubmit = useMemo(
    () => Boolean(eventId && name.trim() && Number(quantity) > 0 && !loading),
    [eventId, name, quantity, loading]
  );

  const submit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError("");

    try {
      await ticketService.store({
        event_id: Number(eventId),
        name: name.trim(),
        quantity: Number(quantity),
        limit_date: limitDate || null,
        description: description.trim() || null,
      });
      navigate(`/event/edit/${eventId}?courtesyCreated=1`, { replace: true });
    } catch (err) {
      setError(err?.message || "Não foi possível criar a cortesia.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="cut-app-page">
      <NavlogComponent />
      {(loading || initialLoading) && (
        <ProcessingIndicatorComponent label={loading ? "Criando cortesia" : "Carregando eventos"} />
      )}

      <Container className="cut-page-container py-4 py-lg-5">
        <div className="cut-page-heading">
          <div>
            <span className="cut-eyebrow">Ingressos</span>
            <h1>Crie uma cortesia gratuita</h1>
            <p>Defina o lote gratuito. Depois você revisa o evento e decide quando publicar a página para os participantes.</p>
          </div>
        </div>

        {error && <Alert variant="danger">{error}</Alert>}

        {!initialLoading && events.length === 0 ? (
          <Card className="cut-empty-state">
            <Card.Body>
              <h2>Você ainda não tem eventos</h2>
              <p>Crie um evento antes de configurar uma cortesia.</p>
              <Button onClick={() => navigate("/event/create")}>Criar evento</Button>
            </Card.Body>
          </Card>
        ) : (
          <Row className="justify-content-center">
            <Col lg={8} xl={7}>
              <Card className="cut-panel">
                <Card.Body className="p-4 p-lg-5">
                  <div className="cut-feature-badge mb-4"><i className="fa-solid fa-ticket" /> Cortesia com QR Code individual</div>

                  <Form onSubmit={submit}>
                    <Row className="g-3">
                      <Col xs={12}><Form.Group><Form.Label>Evento *</Form.Label><Form.Select value={eventId} onChange={(event) => setEventId(event.target.value)} required><option value="">Selecione o evento</option>{events.filter((item) => !item.is_cancelled).map((item) => <option key={item.id} value={item.id}>{item.title} {item.is_published ? "· publicado" : "· rascunho"}</option>)}</Form.Select></Form.Group></Col>
                      <Col md={7}><Form.Group><Form.Label>Nome do lote *</Form.Label><Form.Control value={name} onChange={(event) => setName(event.target.value)} required /></Form.Group></Col>
                      <Col md={5}><Form.Group><Form.Label>Quantidade *</Form.Label><Form.Control type="number" min={1} max={100000} value={quantity} onChange={(event) => setQuantity(event.target.value)} required /></Form.Group></Col>
                      <Col xs={12}><Form.Group><Form.Label>Retirada disponível até</Form.Label><Form.Control type="datetime-local" value={limitDate} onChange={(event) => setLimitDate(event.target.value)} /></Form.Group></Col>
                      <Col xs={12}><Form.Group><Form.Label>Orientações</Form.Label><Form.Control as="textarea" rows={4} value={description} onChange={(event) => setDescription(event.target.value)} /></Form.Group></Col>
                    </Row>

                    <div className="cut-info-box mt-4">
                      <strong>Preço: R$ 0,00</strong>
                      <span>Cada participante receberá um ingresso individual com token e QR Code únicos. O lote não publica o evento automaticamente.</span>
                    </div>

                    <div className="cut-form-actions mt-4">
                      <Button type="button" variant="outline-light" onClick={() => navigate(eventId ? `/event/edit/${eventId}` : "/event/manage")}>Cancelar</Button>
                      <Button type="submit" disabled={!canSubmit}>Salvar cortesia e revisar evento</Button>
                    </div>
                  </Form>
                </Card.Body>
              </Card>
            </Col>
          </Row>
        )}
      </Container>
    </div>
  );
}
