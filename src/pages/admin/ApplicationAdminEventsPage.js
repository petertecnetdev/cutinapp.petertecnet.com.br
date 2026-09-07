import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Modal, Row, Spinner } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import EventSeriesForm from "../../components/EventSeriesForm";
import appApiClient from "../../services/AppApiClient";
import eventSeriesService from "../../services/EventSeriesService";
import "./ApplicationAdminEventsPage.css";

const PAGE_SIZE = 6;

const paginatorFrom = (payload) => payload?.events && !Array.isArray(payload.events) ? payload.events : null;
const rowsFrom = (payload) => {
  const paginator = paginatorFrom(payload);
  if (Array.isArray(paginator?.data)) return paginator.data;
  if (Array.isArray(payload?.events)) return payload.events;
  return [];
};

const formatEventDate = (value) => {
  if (!value) return "Sem data definida";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sem data definida";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const eventStatus = (event) => {
  if (event?.is_cancelled) return { label: "Cancelado", variant: "danger" };
  if (event?.is_published) return { label: "Publicado", variant: "success" };
  return { label: "Rascunho", variant: "secondary" };
};

export default function ApplicationAdminEventsPage() {
  const navigate = useNavigate();
  const [context, setContext] = useState(null);
  const [events, setEvents] = useState([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selected, setSelected] = useState(null);
  const [eventToDelete, setEventToDelete] = useState(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const sentinelRef = useRef(null);
  const requestRef = useRef(0);

  const loadEvents = useCallback(async ({ nextPage = 1, append = false, q = debouncedQuery } = {}) => {
    const requestId = ++requestRef.current;
    append ? setLoadingMore(true) : setLoading(true);
    setError("");
    try {
      const response = await appApiClient.get("/admin/events", {
        params: { page: nextPage, per_page: PAGE_SIZE, q: q || undefined },
      });
      if (requestId !== requestRef.current) return;
      const payload = response.data || {};
      const paginator = paginatorFrom(payload);
      const rows = rowsFrom(payload);
      setEvents((current) => append ? [...current, ...rows.filter((row) => !current.some((item) => item.id === row.id))] : rows);
      setPage(Number(paginator?.current_page || nextPage));
      setLastPage(Number(paginator?.last_page || nextPage));
      setTotal(Number(paginator?.total ?? rows.length));
    } catch (err) {
      if (requestId === requestRef.current) setError(err?.response?.data?.message || err?.message || "Você não possui acesso administrativo aos eventos desta aplicação.");
    } finally {
      if (requestId === requestRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [debouncedQuery]);

  useEffect(() => {
    let active = true;
    appApiClient.get("/admin/context")
      .then((response) => active && setContext(response.data?.data || null))
      .catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setEvents([]);
    setPage(1);
    setLastPage(1);
    void loadEvents({ nextPage: 1, append: false, q: debouncedQuery });
  }, [debouncedQuery, loadEvents]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || loading || loadingMore || page >= lastPage) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !loadingMore && page < lastPage) {
        void loadEvents({ nextPage: page + 1, append: true });
      }
    }, { rootMargin: "320px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadEvents, lastPage, loading, loadingMore, page]);

  const stats = useMemo(() => ({
    published: events.filter((event) => event.is_published && !event.is_cancelled).length,
    drafts: events.filter((event) => !event.is_published && !event.is_cancelled).length,
    tickets: events.reduce((sum, event) => sum + Number(event.tickets_count || 0), 0),
  }), [events]);

  const submit = async (payload) => {
    if (!selected) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await eventSeriesService.create(selected.id, payload);
      await loadEvents({ nextPage: 1, append: false });
      setSuccess(response?.message || "Agenda criada com sucesso.");
      setSelected(null);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Não foi possível criar a agenda. Tente novamente sem alterar os dados para retomar a mesma tentativa com segurança.");
    } finally {
      setBusy(false);
    }
  };

  const askDelete = (event) => {
    setError("");
    setSuccess("");
    setDeleteConfirmation("");
    setEventToDelete(event);
  };

  const deleteEvent = async () => {
    if (!eventToDelete || deleteConfirmation.trim().toUpperCase() !== "EXCLUIR") return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await appApiClient.delete(`/events/${eventToDelete.id}`);
      setEvents((current) => current.filter((event) => event.id !== eventToDelete.id));
      setTotal((current) => Math.max(0, current - 1));
      setSuccess(response?.data?.message || "Evento excluído com sucesso.");
      setEventToDelete(null);
      setDeleteConfirmation("");
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Não foi possível excluir este evento.");
    } finally {
      setBusy(false);
    }
  };

  return <div className="cut-app-page cut-admin-events-page">
    <NavlogComponent />
    <Container className="cut-page-container py-4 py-lg-5">
      <section className="cut-admin-events-hero">
        <div>
          <span className="cut-eyebrow">Cutinapp Admin Center</span>
          <h1>Eventos</h1>
          <p>Administre qualquer evento da Cutinapp em um só lugar: abra, edite, configure ingressos, crie agenda ou exclua quando necessário.</p>
        </div>
        {context?.profile?.name && <Badge className="cut-admin-role-badge" bg="info" text="dark"><i className="fa-solid fa-shield-halved me-2" />{context.profile.name}</Badge>}
      </section>

      <div className="cut-admin-event-stats" aria-label="Resumo dos eventos carregados">
        <div><strong>{total || events.length}</strong><span>Eventos</span></div>
        <div><strong>{stats.published}</strong><span>Publicados nesta lista</span></div>
        <div><strong>{stats.drafts}</strong><span>Rascunhos nesta lista</span></div>
        <div><strong>{stats.tickets}</strong><span>Lotes de ingresso</span></div>
      </div>

      {error && <Alert variant="danger" role="alert">{error}</Alert>}
      {success && <Alert variant="success" role="status" dismissible onClose={() => setSuccess("")}>{success}</Alert>}

      <div className="cut-admin-events-toolbar">
        <div className="cut-admin-search-wrap">
          <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
          <Form.Control type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por evento, produção ou cidade" aria-label="Buscar evento, produção ou cidade" />
        </div>
        <Button variant="outline-light" onClick={() => loadEvents({ nextPage: 1, append: false })} disabled={loading}>
          <i className="fa-solid fa-rotate me-2" />Atualizar
        </Button>
      </div>

      {loading && !events.length ? <div className="text-center py-5" role="status" aria-live="polite"><Spinner /><p className="mt-2">Carregando eventos...</p></div> : <>
        <Row className="g-3 g-xl-4">
          {events.map((event) => {
            const status = eventStatus(event);
            return <Col md={6} xl={4} key={event.id}>
              <Card className="cut-admin-event-card h-100">
                <Card.Body>
                  <div className="cut-admin-event-card__top">
                    <div className="min-w-0">
                      <span className="cut-admin-event-production">{event.production?.name || "Produção não informada"}</span>
                      <h2>{event.title || "Evento sem nome"}</h2>
                    </div>
                    <Badge bg={status.variant}>{status.label}</Badge>
                  </div>

                  <div className="cut-admin-event-meta">
                    <span><i className="fa-regular fa-calendar" />{formatEventDate(event.start_date)}</span>
                    <span><i className="fa-solid fa-location-dot" />{event.city || event.venue || "Local não informado"}</span>
                    <span><i className="fa-solid fa-ticket" />{Number(event.tickets_count || 0)} lote(s) de ingresso</span>
                  </div>

                  <div className="cut-admin-event-primary-actions">
                    <Button onClick={() => event.slug ? navigate(`/event/${event.slug}`) : navigate(`/event/edit/${event.id}`)}>
                      <i className="fa-regular fa-eye me-2" />Abrir
                    </Button>
                    <Button variant="outline-light" onClick={() => navigate(`/event/edit/${event.id}`)}>
                      <i className="fa-regular fa-pen-to-square me-2" />Editar
                    </Button>
                  </div>

                  <div className="cut-admin-event-secondary-actions">
                    <button type="button" onClick={() => navigate(`/ticket/create?eventId=${event.id}`)}><i className="fa-solid fa-ticket" /><span>Ingressos</span></button>
                    <button type="button" onClick={() => setSelected(event)}><i className="fa-solid fa-calendar-plus" /><span>Agenda</span></button>
                    <button type="button" className="is-danger" onClick={() => askDelete(event)}><i className="fa-regular fa-trash-can" /><span>Excluir</span></button>
                  </div>
                </Card.Body>
              </Card>
            </Col>;
          })}
          {!events.length && !error && <Col><Alert variant="secondary">Nenhum evento encontrado.</Alert></Col>}
        </Row>
        <div ref={sentinelRef} className="text-center py-4" aria-live="polite">
          {loadingMore && <><Spinner size="sm" /><span className="ms-2">Buscando mais eventos...</span></>}
          {!loadingMore && events.length > 0 && page >= lastPage && <small className="text-secondary">Fim dos resultados.</small>}
        </div>
      </>}
    </Container>

    <Modal show={Boolean(selected)} onHide={() => !busy && setSelected(null)} centered size="lg">
      <Modal.Header closeButton={!busy}><Modal.Title>Criar agenda a partir do evento</Modal.Title></Modal.Header>
      <Modal.Body>{selected && <EventSeriesForm event={selected} busy={busy} onSubmit={submit} />}</Modal.Body>
    </Modal>

    <Modal show={Boolean(eventToDelete)} onHide={() => !busy && setEventToDelete(null)} centered>
      <Modal.Header closeButton={!busy}><Modal.Title>Excluir evento</Modal.Title></Modal.Header>
      <Modal.Body>
        <p>Você está prestes a excluir <strong>{eventToDelete?.title}</strong>. Esta ação é administrativa e pode ser irreversível.</p>
        <Form.Label>Digite <strong>EXCLUIR</strong> para confirmar.</Form.Label>
        <Form.Control autoFocus value={deleteConfirmation} onChange={(e) => setDeleteConfirmation(e.target.value)} disabled={busy} />
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-light" onClick={() => setEventToDelete(null)} disabled={busy}>Cancelar</Button>
        <Button variant="danger" onClick={deleteEvent} disabled={busy || deleteConfirmation.trim().toUpperCase() !== "EXCLUIR"}>
          {busy ? <Spinner size="sm" className="me-2" /> : <i className="fa-regular fa-trash-can me-2" />}Excluir evento
        </Button>
      </Modal.Footer>
    </Modal>
  </div>;
}