import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Modal, Row, Spinner } from "react-bootstrap";
import NavlogComponent from "../../components/NavlogComponent";
import EventSeriesForm from "../../components/EventSeriesForm";
import appApiClient from "../../services/AppApiClient";
import eventSeriesService from "../../services/EventSeriesService";

const PAGE_SIZE = 4;

const paginatorFrom = (payload) => payload?.events && !Array.isArray(payload.events) ? payload.events : null;
const rowsFrom = (payload) => {
  const paginator = paginatorFrom(payload);
  if (Array.isArray(paginator?.data)) return paginator.data;
  if (Array.isArray(payload?.events)) return payload.events;
  return [];
};

export default function ApplicationAdminEventsPage() {
  const [context, setContext] = useState(null);
  const [events, setEvents] = useState([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selected, setSelected] = useState(null);
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

  return <div className="cut-app-page">
    <NavlogComponent />
    <Container className="cut-page-container py-4 py-lg-5">
      <div className="cut-page-heading">
        <div><span className="cut-eyebrow">Cutinapp Admin Center</span><h1>Agenda e séries de eventos</h1><p>Os eventos são carregados em pequenos lotes conforme você avança pela tela, sem baixar uma lista inteira de uma vez.</p></div>
        {context?.profile?.name && <Badge bg="info" text="dark">{context.profile.name}</Badge>}
      </div>

      {error && <Alert variant="danger" role="alert">{error}</Alert>}
      {success && <Alert variant="success" role="status" dismissible onClose={() => setSuccess("")}>{success}</Alert>}

      <Card className="cut-panel mb-4"><Card.Body><Form.Control type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar evento, produção ou cidade" aria-label="Buscar evento, produção ou cidade" /></Card.Body></Card>

      {loading && !events.length ? <div className="text-center py-5" role="status" aria-live="polite"><Spinner /><p className="mt-2">Carregando os primeiros eventos...</p></div> : <>
        <Row className="g-3">
          {events.map((event) => <Col lg={6} key={event.id}><Card className="cut-panel h-100"><Card.Body>
            <div className="d-flex justify-content-between gap-3"><div><span className="cut-eyebrow">{event.production?.name || "Produção"}</span><h2 className="cut-section-title mt-2">{event.title}</h2></div><Badge bg={event.is_published ? "success" : "secondary"}>{event.is_published ? "Publicado" : "Rascunho"}</Badge></div>
            <p className="text-secondary">{event.start_date ? new Date(event.start_date).toLocaleString("pt-BR") : "Sem data"} · {event.city || event.venue || "Local não informado"}</p>
            <div className="d-flex justify-content-between align-items-center"><span>{event.tickets_count || 0} lote(s) de ingresso</span><Button onClick={() => setSelected(event)}><i className="fa-solid fa-calendar-plus me-2" />Criar agenda</Button></div>
          </Card.Body></Card></Col>)}
          {!events.length && !error && <Col><Alert variant="secondary">Nenhum evento encontrado.</Alert></Col>}
        </Row>
        <div ref={sentinelRef} className="text-center py-4" aria-live="polite">
          {loadingMore && <><Spinner size="sm" /><span className="ms-2">Buscando mais eventos...</span></>}
          {!loadingMore && events.length > 0 && page >= lastPage && <small className="text-secondary">Você chegou ao fim dos resultados.</small>}
        </div>
      </>}
    </Container>

    <Modal show={Boolean(selected)} onHide={() => !busy && setSelected(null)} centered size="lg">
      <Modal.Header closeButton={!busy}><Modal.Title>Criar agenda a partir do evento</Modal.Title></Modal.Header>
      <Modal.Body>{selected && <EventSeriesForm event={selected} busy={busy} onSubmit={submit} />}</Modal.Body>
    </Modal>
  </div>;
}
