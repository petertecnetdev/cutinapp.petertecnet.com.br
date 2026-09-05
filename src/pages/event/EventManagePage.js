import React, { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Row } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import eventService from "../../services/EventService";
import cutinappService from "../../services/CutinappService";

const formatDate = (value) => value
  ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
  : "Data não informada";

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
      action: "Configurar ingressos",
      route: `/event/${event.id}/courtesies`,
    };
  }

  if (!isPublished) {
    return {
      completed,
      label: "Tudo pronto para publicar e liberar as vendas",
      action: "Revisar antes de publicar",
      route: `/event/edit/${event.id}`,
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
      setSuccess(response.message || "Situação do evento atualizada.");
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
      if (navigator.share) await navigator.share({ title: event.title, url });
      else {
        await navigator.clipboard.writeText(url);
        setSuccess("Link público copiado.");
      }
    } catch (err) {
      if (err?.name !== "AbortError") setError("Não foi possível compartilhar o link deste navegador.");
    }
  };

  return (
    <div className="cut-app-page">
      <NavlogComponent />
      {(loading || busyId) && <ProcessingIndicatorComponent label={loading ? "Carregando eventos" : "Atualizando evento"} />}
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
              <div className="cut-info-box mt-3"><strong>{event.tickets_count || 0} lote(s) de ingresso</strong><span>{event.is_published ? "Página pública disponível para retirada de cortesias." : "Finalize a cortesia antes de publicar."}</span></div>

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
                <Button className="mt-3" size="sm" variant={readiness.completed === 3 ? "outline-light" : "light"} onClick={() => navigate(readiness.route)}>{readiness.action}</Button>
              </div>}

              <div className="cut-card-actions mt-4">
                <Button onClick={() => navigate(`/event/edit/${event.id}`)}>Editar</Button>
                <Button variant="outline-light" onClick={() => navigate(`/event/${event.id}/courtesies`)}>Ingressos</Button>
                <Button variant="outline-light" onClick={() => navigate(`/event/${event.id}/participants`)}>Participantes</Button>
                {!event.is_cancelled && <Button variant={event.is_published ? "outline-warning" : "outline-success"} onClick={() => publication(event)} disabled={busyId === event.id}>{event.is_published ? "Despublicar" : "Publicar"}</Button>}
                {event.is_published && !event.is_cancelled && <><Button variant="outline-light" onClick={() => navigate(`/checkin?eventId=${event.id}`)}>Portaria</Button><Button variant="outline-light" onClick={() => navigate(`/event/${event.slug}`)}>Página pública</Button><Button variant="outline-light" onClick={() => share(event)}>Compartilhar</Button></>}
              </div>
            </Card.Body></Card></Col>;
          })}</Row>
        )}
      </Container>
    </div>
  );
}
