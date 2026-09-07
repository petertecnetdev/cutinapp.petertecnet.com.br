import React, { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Modal, Row, Spinner } from "react-bootstrap";
import NavlogComponent from "../../components/NavlogComponent";
import EventSeriesForm from "../../components/EventSeriesForm";
import appApiClient from "../../services/AppApiClient";
import eventSeriesService from "../../services/EventSeriesService";

const unwrap = (payload) => Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];

export default function ApplicationAdminEventsPage() {
  const [context, setContext] = useState(null);
  const [events, setEvents] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadEvents = async () => {
    const response = await appApiClient.get("/admin/events", { params: { per_page: 100 } });
    setEvents(unwrap(response.data?.events));
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([appApiClient.get("/admin/context"), appApiClient.get("/admin/events", { params: { per_page: 100 } })])
      .then(([contextResponse, eventsResponse]) => {
        if (!active) return;
        setContext(contextResponse.data?.data || null);
        setEvents(unwrap(eventsResponse.data?.events));
      })
      .catch((err) => active && setError(err?.message || "Você não possui acesso administrativo aos eventos desta aplicação."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("pt-BR");
    if (!needle) return events;
    return events.filter((event) => `${event.title || ""} ${event.production?.name || ""} ${event.city || ""}`.toLocaleLowerCase("pt-BR").includes(needle));
  }, [events, query]);

  const submit = async (payload) => {
    if (!selected) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await eventSeriesService.create(selected.id, payload);
      await loadEvents();
      setSuccess(response?.message || "Agenda criada com sucesso.");
      setSelected(null);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Não foi possível criar a agenda. Tente novamente sem alterar os dados para retomar a mesma tentativa com segurança.");
    } finally {
      setBusy(false);
    }
  };

  return <div className="cut-app-page">
    <NavlogComponent />
    <Container className="cut-page-container py-4 py-lg-5">
      <div className="cut-page-heading">
        <div><span className="cut-eyebrow">Cutinapp Admin Center</span><h1>Agenda e séries de eventos</h1><p>Escolha qualquer evento da aplicação e crie várias edições para datas específicas ou dias fixos da semana.</p></div>
        {context?.profile?.name && <Badge bg="info" text="dark">{context.profile.name}</Badge>}
      </div>

      {error && <Alert variant="danger" role="alert">{error}</Alert>}
      {success && <Alert variant="success" role="status" dismissible onClose={() => setSuccess("")}>{success}</Alert>}

      <Card className="cut-panel mb-4"><Card.Body><Form.Control type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar evento, produção ou cidade" aria-label="Buscar evento, produção ou cidade" /></Card.Body></Card>

      {loading ? <div className="text-center py-5" role="status" aria-live="polite"><Spinner /><p className="mt-2">Carregando eventos administrativos...</p></div> : <Row className="g-3">
        {filtered.map((event) => <Col lg={6} key={event.id}><Card className="cut-panel h-100"><Card.Body>
          <div className="d-flex justify-content-between gap-3"><div><span className="cut-eyebrow">{event.production?.name || "Produção"}</span><h2 className="cut-section-title mt-2">{event.title}</h2></div><Badge bg={event.is_published ? "success" : "secondary"}>{event.is_published ? "Publicado" : "Rascunho"}</Badge></div>
          <p className="text-secondary">{event.start_date ? new Date(event.start_date).toLocaleString("pt-BR") : "Sem data"} · {event.city || event.venue || "Local não informado"}</p>
          <div className="d-flex justify-content-between align-items-center"><span>{event.tickets_count || 0} lote(s) de ingresso</span><Button onClick={() => setSelected(event)}><i className="fa-solid fa-calendar-plus me-2" />Criar agenda</Button></div>
        </Card.Body></Card></Col>)}
        {!filtered.length && !error && <Col><Alert variant="secondary">Nenhum evento encontrado.</Alert></Col>}
      </Row>}
    </Container>

    <Modal show={Boolean(selected)} onHide={() => !busy && setSelected(null)} centered size="lg">
      <Modal.Header closeButton={!busy}><Modal.Title>Criar agenda a partir do evento</Modal.Title></Modal.Header>
      <Modal.Body>{selected && <EventSeriesForm event={selected} busy={busy} onSubmit={submit} />}</Modal.Body>
    </Modal>
  </div>;
}
