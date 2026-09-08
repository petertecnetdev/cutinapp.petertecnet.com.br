import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, Container, Form, Modal, Spinner } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import appApiClient from "../../services/AppApiClient";
import applicationAdminEventService from "../../services/ApplicationAdminEventService";
import { storageUrl } from "../../config";
import "./ApplicationAdminEventsPage.css";

const PAGE_SIZE = 12;

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
    timeZone: "America/Sao_Paulo",
  }).format(date);
};

const eventImage = (event) => {
  if (!event?.image) return "";
  const image = String(event.image);
  return /^https?:\/\//i.test(image) ? image : `${storageUrl}${image.replace(/^\/+/, "")}`;
};

const eventStatus = (event) => {
  if (event?.is_cancelled) return { label: "Cancelado", variant: "danger" };
  if (event?.is_published) return { label: "Publicado", variant: "success" };
  return { label: "Rascunho", variant: "secondary" };
};

export default function ApplicationAdminEventsPage() {
  const navigate = useNavigate();
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
  const [eventToDelete, setEventToDelete] = useState(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [selectedEventIds, setSelectedEventIds] = useState([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteConfirmation, setBulkDeleteConfirmation] = useState("");
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
      if (requestId === requestRef.current) setError(err?.response?.data?.message || err?.message || "Não foi possível carregar os eventos.");
    } finally {
      if (requestId === requestRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [debouncedQuery]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setEvents([]);
    setSelectedEventIds([]);
    setPage(1);
    setLastPage(1);
    void loadEvents({ nextPage: 1, append: false, q: debouncedQuery });
  }, [debouncedQuery, loadEvents]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || loading || loadingMore || page >= lastPage) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !loadingMore && page < lastPage) void loadEvents({ nextPage: page + 1, append: true });
    }, { rootMargin: "320px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadEvents, lastPage, loading, loadingMore, page]);

  const toggleEventSelection = (eventId) => {
    const normalizedId = Number(eventId);
    setSelectedEventIds((current) => current.includes(normalizedId)
      ? current.filter((id) => id !== normalizedId)
      : [...current, normalizedId]);
  };

  const loadedEventIds = events.map((event) => Number(event.id));
  const allLoadedSelected = loadedEventIds.length > 0 && loadedEventIds.every((id) => selectedEventIds.includes(id));
  const selectedEvents = events.filter((event) => selectedEventIds.includes(Number(event.id)));

  const toggleSelectAllLoaded = () => {
    if (allLoadedSelected) {
      setSelectedEventIds((current) => current.filter((id) => !loadedEventIds.includes(id)));
      return;
    }
    setSelectedEventIds((current) => Array.from(new Set([...current, ...loadedEventIds])));
  };

  const deleteEvent = async () => {
    if (!eventToDelete || deleteConfirmation.trim().toUpperCase() !== "EXCLUIR") return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await applicationAdminEventService.remove(eventToDelete.id);
      setEvents((current) => current.filter((event) => event.id !== eventToDelete.id));
      setSelectedEventIds((current) => current.filter((id) => id !== Number(eventToDelete.id)));
      setTotal((current) => Math.max(0, current - 1));
      setSuccess(response?.message || "Evento excluído com sucesso.");
      setEventToDelete(null);
      setDeleteConfirmation("");
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Não foi possível excluir este evento.");
    } finally {
      setBusy(false);
    }
  };

  const deleteSelectedEvents = async () => {
    if (!selectedEventIds.length || bulkDeleteConfirmation.trim().toUpperCase() !== "EXCLUIR") return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await applicationAdminEventService.removeMany(selectedEventIds);
      const deletedCount = Number(response?.deleted_count || selectedEventIds.length);
      setSuccess(response?.message || `${deletedCount} evento(s) excluído(s) com sucesso.`);
      setSelectedEventIds([]);
      setBulkDeleteConfirmation("");
      setBulkDeleteOpen(false);
      setPage(1);
      setLastPage(1);
      await loadEvents({ nextPage: 1, append: false, q: debouncedQuery });
    } catch (err) {
      const payload = err?.response?.data || {};
      const protectedIds = Array.isArray(payload.protected_event_ids) ? payload.protected_event_ids : [];
      const suffix = protectedIds.length ? ` Eventos protegidos: ${protectedIds.join(", ")}.` : "";
      setError(`${payload.message || err?.message || "Não foi possível excluir os eventos selecionados."}${suffix}`);
    } finally {
      setBusy(false);
    }
  };

  return <div className="cut-app-page cut-admin-events-page">
    <NavlogComponent />
    <Container className="cut-page-container py-4 py-lg-5">
      <section className="cut-admin-events-hero"><div><span className="cut-eyebrow">Cutinapp Admin Center</span><h1>Eventos</h1><p>{total || events.length} evento(s) na Cutinapp. Selecione vários eventos para executar ações administrativas em lote.</p></div></section>
      {error && <Alert variant="danger">{error}</Alert>}
      {success && <Alert variant="success" dismissible onClose={() => setSuccess("")}>{success}</Alert>}
      <div className="cut-admin-events-toolbar">
        <div className="cut-admin-search-wrap"><i className="fa-solid fa-magnifying-glass" aria-hidden="true" /><Form.Control type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar evento, produção ou cidade" aria-label="Buscar evento" /></div>
        <Button variant="outline-light" onClick={() => { setSelectedEventIds([]); loadEvents({ nextPage: 1, append: false }); }} disabled={loading}><i className="fa-solid fa-rotate me-2" />Atualizar</Button>
      </div>
      {events.length > 0 && <div className="cut-admin-events-bulkbar">
        <Form.Check type="checkbox" id="cut-admin-select-all-events" checked={allLoadedSelected} onChange={toggleSelectAllLoaded} label={selectedEventIds.length > 0 ? `${selectedEventIds.length} evento(s) selecionado(s)` : "Selecionar eventos"} />
        <div className="cut-admin-events-bulkbar__actions"><Button variant="outline-light" size="sm" onClick={toggleSelectAllLoaded}>{allLoadedSelected ? "Limpar seleção" : `Selecionar ${events.length} carregado(s)`}</Button><Button variant="danger" size="sm" disabled={!selectedEventIds.length} onClick={() => { setBulkDeleteConfirmation(""); setBulkDeleteOpen(true); }}><i className="fa-regular fa-trash-can me-2" />Excluir selecionados</Button></div>
      </div>}
      {loading && !events.length ? <div className="text-center py-5"><Spinner /><p className="mt-2">Carregando eventos...</p></div> : <div className="cut-admin-event-list">
        {events.map((event) => {
          const image = eventImage(event);
          const status = eventStatus(event);
          const eventId = Number(event.id);
          const selected = selectedEventIds.includes(eventId);
          return <article className={`cut-admin-event-row${selected ? " is-selected" : ""}`} key={event.id}>
            <div className="cut-admin-event-row__select" onClick={(e) => e.stopPropagation()}><Form.Check type="checkbox" checked={selected} onChange={() => toggleEventSelection(eventId)} aria-label={`Selecionar ${event.title || "evento"}`} /></div>
            <button type="button" className="cut-admin-event-row__main" onClick={() => navigate(`/event/edit/${event.id}`)} aria-label={`Editar ${event.title || "evento"}`}>
              <div className="cut-admin-event-row__media">{image ? <img src={image} alt="" loading="lazy" decoding="async" /> : <i className="fa-regular fa-calendar" aria-hidden="true" />}</div>
              <div className="cut-admin-event-row__content"><div className="cut-admin-event-row__title-line"><h2>{event.title || "Evento sem nome"}</h2><Badge bg={status.variant}>{status.label}</Badge></div><span className="cut-admin-event-row__date"><i className="fa-regular fa-calendar me-2" />{formatEventDate(event.start_date)}</span><small>{event.production?.name || "Produção não informada"}</small></div>
            </button>
            <div className="cut-admin-event-row__actions"><Button onClick={() => navigate(`/event/edit/${event.id}`)}><i className="fa-regular fa-pen-to-square me-2" />Editar</Button><Button variant="outline-light" aria-label="Abrir evento" onClick={() => event.slug ? navigate(`/event/${event.slug}`) : navigate(`/event/edit/${event.id}`)}><i className="fa-regular fa-eye" /></Button><Button variant="outline-danger" aria-label="Excluir evento" onClick={() => { setDeleteConfirmation(""); setEventToDelete(event); }}><i className="fa-regular fa-trash-can" /></Button></div>
          </article>;
        })}
        {!events.length && !error && <Alert variant="secondary">Nenhum evento encontrado.</Alert>}
      </div>}
      <div ref={sentinelRef} className="text-center py-4" aria-live="polite">{loadingMore && <><Spinner size="sm" /><span className="ms-2">Buscando mais eventos...</span></>}{!loadingMore && events.length > 0 && page >= lastPage && <small className="text-secondary">Fim dos resultados.</small>}</div>
    </Container>
    <Modal show={Boolean(eventToDelete)} onHide={() => !busy && setEventToDelete(null)} centered>
      <Modal.Header closeButton={!busy}><Modal.Title>Excluir evento</Modal.Title></Modal.Header>
      <Modal.Body><p>Excluir <strong>{eventToDelete?.title}</strong>?</p><Form.Label>Digite <strong>EXCLUIR</strong> para confirmar.</Form.Label><Form.Control autoFocus value={deleteConfirmation} onChange={(e) => setDeleteConfirmation(e.target.value)} disabled={busy} /></Modal.Body>
      <Modal.Footer><Button variant="outline-light" onClick={() => setEventToDelete(null)} disabled={busy}>Cancelar</Button><Button variant="danger" onClick={deleteEvent} disabled={busy || deleteConfirmation.trim().toUpperCase() !== "EXCLUIR"}>{busy ? <Spinner size="sm" className="me-2" /> : <i className="fa-regular fa-trash-can me-2" />}Excluir evento</Button></Modal.Footer>
    </Modal>
    <Modal show={bulkDeleteOpen} onHide={() => !busy && setBulkDeleteOpen(false)} centered>
      <Modal.Header closeButton={!busy}><Modal.Title>Excluir vários eventos</Modal.Title></Modal.Header>
      <Modal.Body><Alert variant="danger">Você está prestes a excluir <strong>{selectedEventIds.length} evento(s)</strong>. A ação é permanente e será cancelada se algum dos eventos tiver ingressos já emitidos.</Alert>{selectedEvents.length > 0 && <div className="cut-admin-bulk-preview">{selectedEvents.slice(0, 5).map((event) => <span key={event.id}>{event.title || `Evento #${event.id}`}</span>)}{selectedEvents.length > 5 && <small>+ {selectedEvents.length - 5} outro(s)</small>}</div>}<Form.Label className="mt-3">Digite <strong>EXCLUIR</strong> para confirmar.</Form.Label><Form.Control autoFocus value={bulkDeleteConfirmation} onChange={(e) => setBulkDeleteConfirmation(e.target.value)} disabled={busy} /></Modal.Body>
      <Modal.Footer><Button variant="outline-light" onClick={() => setBulkDeleteOpen(false)} disabled={busy}>Cancelar</Button><Button variant="danger" onClick={deleteSelectedEvents} disabled={busy || !selectedEventIds.length || bulkDeleteConfirmation.trim().toUpperCase() !== "EXCLUIR"}>{busy ? <Spinner size="sm" className="me-2" /> : <i className="fa-regular fa-trash-can me-2" />}Excluir {selectedEventIds.length} evento(s)</Button></Modal.Footer>
    </Modal>
  </div>;
}
