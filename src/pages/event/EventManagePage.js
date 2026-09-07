import React, { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Modal, Row } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import eventService from "../../services/EventService";
import cutinappService from "../../services/CutinappService";

const formatDate = (value) => value
  ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
  : "Data não informada";

const toDateInput = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const suggestedDuplicateDate = (event) => {
  const source = new Date(event?.start_date);
  const candidate = Number.isNaN(source.getTime()) ? new Date() : new Date(source);
  candidate.setDate(candidate.getDate() + 7);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  if (candidate < tomorrow) return toDateInput(tomorrow);
  return toDateInput(candidate);
};

const trackProducerActivation = (type, event, metadata = {}) => {
  try {
    window.PeterTecnetTelemetry?.track?.(type, {
      label: event?.title || "Evento",
      target: event?.slug || String(event?.id || ""),
      metadata: {
        event_id: Number(event?.id || 0),
        production_id: Number(event?.production?.id || event?.production_id || 0),
        ...metadata,
      },
    });
  } catch (_) {
    // Telemetry must never interrupt producer activation.
  }
};

const getSalesReadiness = (event) => {
  const hasBasics = Boolean(
    String(event?.title || "").trim()
    && event?.start_date
    && String(event?.venue || event?.address || "").trim()
  );
  const hasTickets = Number(event?.tickets_count || 0) > 0;
  const isPublished = Boolean(event?.is_published);
  const completed = [hasBasics, hasTickets, isPublished].filter(Boolean).length;

  if (!hasBasics) {
    return {
      completed,
      label: "Complete os dados essenciais do evento",
      action: "Completar evento",
      route: `/event/edit/${event.id}`,
    };
  }

  if (!hasTickets) {
    return {
      completed,
      label: "Crie pelo menos um lote de ingresso para começar a vender",
      action: "Criar primeiro lote pago",
      route: `/ticket/create?eventId=${event.id}`,
    };
  }

  if (!isPublished) {
    return {
      completed,
      label: "Tudo pronto para publicar e liberar as vendas",
      action: "Publicar e começar a vender",
      mode: "publish",
      route: null,
    };
  }

  return {
    completed,
    label: "Evento publicado e pronto para receber vendas",
    action: "Ver página pública",
    route: `/event/${event.slug}`,
  };
};

export default function EventManagePage() {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [eventToDuplicate, setEventToDuplicate] = useState(null);
  const [duplicateDate, setDuplicateDate] = useState("");
  const [duplicateError, setDuplicateError] = useState("");

  const load = async () => setEvents(await eventService.myEvents());

  useEffect(() => {
    let active = true;
    eventService.myEvents()
      .then((items) => active && setEvents(items))
      .catch((err) => active && setError(err?.message || "Não foi possível carregar seus eventos."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const publication = async (event) => {
    setBusyId(event.id);
    setError("");
    setSuccess("");
    try {
      const response = event.is_published
        ? await cutinappService.unpublishEvent(event.id)
        : await cutinappService.publishEvent(event.id);
      await load();
      if (!event.is_published) trackProducerActivation("producer_event_published", event, { activation_stage: "published" });
      setSuccess(event.is_published ? (response.message || "Evento retirado da publicação.") : "Evento publicado. Agora compartilhe a página pública para buscar a primeira venda.");
    } catch (err) {
      setError(err?.message || "Não foi possível alterar a publicação do evento.");
    } finally {
      setBusyId(null);
    }
  };

  const share = async (event) => {
    if (!event.is_published || !event.slug) return;
    const url = `${window.location.origin}/event/${event.slug}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: event.title, url });
        trackProducerActivation("producer_event_shared", event, { channel: "native_share", activation_stage: "distribution" });
      } else {
        await navigator.clipboard.writeText(url);
        trackProducerActivation("producer_event_shared", event, { channel: "clipboard", activation_stage: "distribution" });
        setSuccess("Link público copiado.");
      }
    } catch (err) {
      if (err?.name !== "AbortError") setError("Não foi possível compartilhar o link deste navegador.");
    }
  };

  const shareWhatsApp = (event) => {
    if (!event.is_published || !event.slug) return;
    const url = `${window.location.origin}/event/${event.slug}`;
    const message = `Confira ${event.title} na Cutinapp: ${url}`;
    trackProducerActivation("producer_event_shared", event, { channel: "whatsapp", activation_stage: "distribution" });
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  };

  const openDuplicate = (event) => {
    setEventToDuplicate(event);
    setDuplicateDate(suggestedDuplicateDate(event));
    setDuplicateError("");
    setError("");
    setSuccess("");
  };

  const closeDuplicate = () => {
    if (String(busyId).startsWith("duplicate-")) return;
    setEventToDuplicate(null);
    setDuplicateDate("");
    setDuplicateError("");
  };

  const duplicate = async () => {
    if (!eventToDuplicate || !duplicateDate) {
      setDuplicateError("Escolha a nova data do evento.");
      return;
    }

    const sourceDate = toDateInput(eventToDuplicate.start_date);
    if (sourceDate === duplicateDate) {
      setDuplicateError("Escolha uma data diferente da data do evento original.");
      return;
    }

    const currentEvent = eventToDuplicate;
    setBusyId(`duplicate-${currentEvent.id}`);
    setDuplicateError("");
    setError("");
    setSuccess("");

    try {
      const response = await eventService.duplicate(currentEvent.id, duplicateDate);
      await load();
      setEventToDuplicate(null);
      setDuplicateDate("");
      setSuccess(response.message || "Evento duplicado como rascunho.");
    } catch (err) {
      const dateMessage = Array.isArray(err?.errors?.date) ? err.errors.date[0] : err?.errors?.date;
      setDuplicateError(dateMessage || err?.message || "Não foi possível duplicar o evento.");
    } finally {
      setBusyId(null);
    }
  };

  const duplicating = String(busyId).startsWith("duplicate-");
  const processingLabel = loading ? "Carregando eventos" : duplicating ? "Duplicando evento" : "Atualizando evento";

  return (
    <div className="cut-app-page">
      <NavlogComponent />
      {(loading || busyId) && <ProcessingIndicatorComponent label={processingLabel} />}
      <Container className="cut-page-container py-4 py-lg-5">
        <div className="cut-page-heading"><div><span className="cut-eyebrow">Área do produtor</span><h1>Meus eventos</h1><p>Controle rascunho, cortesias, publicação, participantes e portaria sem misturar as etapas.</p></div><Button onClick={() => navigate("/event/create")}><i className="fa-solid fa-plus me-2" />Novo evento</Button></div>
        {error && <Alert variant="danger">{error}</Alert>}
        {success && <Alert variant="success">{success}</Alert>}

        {!loading && events.length === 0 ? (
          <Card className="cut-empty-state"><Card.Body><h2>Nenhum evento criado</h2><p>Crie um evento. Se ainda não houver produção, a Cutinapp direcionará você para cadastrá-la primeiro.</p><Button onClick={() => navigate("/event/create")}>Criar evento</Button></Card.Body></Card>
        ) : (
          <Row className="g-4">{events.map((event) => {
            const readiness = getSalesReadiness(event);
            return <Col lg={6} key={event.id}><Card className="cut-panel h-100"><Card.Body className="p-4">
              <div className="d-flex justify-content-between gap-3 align-items-start"><div><span className="cut-eyebrow">{event.production?.name || "Produção"}</span><h2 className="cut-section-title mt-2 mb-1">{event.title}</h2></div><Badge bg={event.is_cancelled ? "danger" : event.is_published ? "success" : "secondary"}>{event.is_cancelled ? "Cancelado" : event.is_published ? "Publicado" : "Rascunho"}</Badge></div>
              <p className="mb-1">{formatDate(event.start_date)}</p><p className="text-secondary">{event.venue || event.address}</p>
              <div className="cut-info-box mt-3"><strong>{event.tickets_count || 0} lote(s) de ingresso</strong><span>{event.is_published ? "Página pública disponível para venda de ingressos." : "Complete os dados do evento e crie um lote para publicar."}</span></div>

              {!event.is_cancelled && <div className="cut-info-box mt-3">
                <div className="d-flex justify-content-between gap-3 align-items-center mb-2">
                  <strong>Prontidão para primeira venda</strong>
                  <Badge bg={readiness.completed === 3 ? "success" : "warning"} text={readiness.completed === 3 ? undefined : "dark"}>{readiness.completed}/3</Badge>
                </div>
                <span>{readiness.label}</span>
                <div className="d-flex flex-wrap gap-2 mt-3">
                  <Badge bg={String(event.title || "").trim() && event.start_date && String(event.venue || event.address || "").trim() ? "success" : "secondary"}>1. Dados do evento</Badge>
                  <Badge bg={Number(event.tickets_count || 0) > 0 ? "success" : "secondary"}>2. Ingressos</Badge>
                  <Badge bg={event.is_published ? "success" : "secondary"}>3. Publicação</Badge>
                </div>
                <Button className="mt-3" size="sm" variant={readiness.completed === 3 ? "outline-light" : "light"} onClick={() => readiness.mode === "publish" ? publication(event) : navigate(readiness.route)} disabled={busyId === event.id}>{readiness.action}</Button>
              </div>}

              {event.is_published && !event.is_cancelled && <div className="cut-info-box mt-3">
                <strong>Próxima meta: primeira venda</strong>
                <span>Seu evento já está no ar. Compartilhe a página pública para transformar divulgação em ingressos vendidos.</span>
                <div className="d-flex flex-wrap gap-2 mt-3">
                  <Button size="sm" onClick={() => shareWhatsApp(event)}><i className="fa-brands fa-whatsapp me-2" />Compartilhar no WhatsApp</Button>
                  <Button size="sm" variant="outline-light" onClick={() => { trackProducerActivation("producer_sales_monitor_opened", event, { activation_stage: "first_sale" }); navigate("/producer/sales"); }}><i className="fa-solid fa-chart-line me-2" />Acompanhar primeira venda</Button>
                </div>
              </div>}

              <div className="cut-card-actions mt-4">
                <Button onClick={() => navigate(`/event/edit/${event.id}`)}>Editar</Button>
                <Button variant="outline-light" onClick={() => openDuplicate(event)} disabled={Boolean(busyId)}><i className="fa-regular fa-copy me-2" />Duplicar</Button>
                <Button variant="outline-light" onClick={() => navigate(`/ticket/create?eventId=${event.id}`)}>Novo lote</Button>
                <Button variant="outline-light" onClick={() => navigate(`/event/${event.id}/courtesies`)}>Cortesias</Button>
                <Button variant="outline-light" onClick={() => navigate(`/event/${event.id}/participants`)}>Participantes</Button>
                {!event.is_cancelled && <Button variant={event.is_published ? "outline-warning" : "outline-success"} onClick={() => publication(event)} disabled={busyId === event.id}>{event.is_published ? "Despublicar" : "Publicar"}</Button>}
                {event.is_published && !event.is_cancelled && <><Button variant="outline-light" onClick={() => navigate(`/checkin?eventId=${event.id}`)}>Portaria</Button><Button variant="outline-light" onClick={() => navigate(`/event/${event.slug}`)}>Página pública</Button><Button variant="outline-light" onClick={() => share(event)}>Compartilhar</Button></>}
              </div>
            </Card.Body></Card></Col>;
          })}</Row>
        )}
      </Container>

      <Modal show={Boolean(eventToDuplicate)} onHide={closeDuplicate} centered>
        <Modal.Header closeButton={!duplicating}>
          <Modal.Title>Duplicar evento</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="mb-2"><strong>{eventToDuplicate?.title}</strong></p>
          <p className="text-secondary">
            A Cutinapp criará um novo rascunho com a mesma duração, capa, local, line-up e lotes de ingresso. Horários do line-up e prazos dos lotes serão deslocados para a nova data.
          </p>
          <Alert variant="info">
            Vendas, participantes, passes, check-ins, avaliações e histórico do evento original não serão copiados.
          </Alert>
          <Form.Group>
            <Form.Label>Nova data *</Form.Label>
            <Form.Control
              type="date"
              value={duplicateDate}
              min={toDateInput(new Date())}
              onChange={(event) => {
                setDuplicateDate(event.target.value);
                setDuplicateError("");
              }}
              isInvalid={Boolean(duplicateError)}
              disabled={duplicating}
            />
            <Form.Text>O horário de início e a duração do evento original serão mantidos.</Form.Text>
            <Form.Control.Feedback type="invalid">{duplicateError}</Form.Control.Feedback>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={closeDuplicate} disabled={duplicating}>Cancelar</Button>
          <Button onClick={duplicate} disabled={duplicating || !duplicateDate}>
            <i className="fa-regular fa-copy me-2" />Criar cópia
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
