import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Modal, Row, Spinner } from "react-bootstrap";
import NavlogComponent from "../../components/NavlogComponent";
import appApiClient from "../../services/AppApiClient";
import applicationAdminTicketService from "../../services/ApplicationAdminTicketService";

const PAGE_SIZE = 12;

const money = (value) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function ApplicationAdminTicketsPage() {
  const [context, setContext] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const sentinelRef = useRef(null);
  const requestRef = useRef(0);

  const loadTickets = useCallback(async ({ nextPage = 1, append = false, q = debouncedQuery } = {}) => {
    const requestId = ++requestRef.current;
    append ? setLoadingMore(true) : setLoading(true);
    setError("");
    try {
      const response = await appApiClient.get("/admin/tickets", {
        params: { page: nextPage, per_page: PAGE_SIZE, q: q || undefined },
      });
      if (requestId !== requestRef.current) return;
      const paginator = response.data?.data || {};
      const rows = Array.isArray(paginator.data) ? paginator.data : [];
      setTickets((current) => append ? [...current, ...rows.filter((row) => !current.some((item) => item.id === row.id))] : rows);
      setPage(Number(paginator.current_page || nextPage));
      setLastPage(Number(paginator.last_page || nextPage));
    } catch (err) {
      if (requestId === requestRef.current) setError(err?.response?.data?.message || err?.message || "Não foi possível carregar os ingressos globais da Cutinapp.");
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
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 280);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setTickets([]);
    setPage(1);
    setLastPage(1);
    void loadTickets({ nextPage: 1, append: false, q: debouncedQuery });
  }, [debouncedQuery, loadTickets]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || loading || loadingMore || page >= lastPage) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && page < lastPage) void loadTickets({ nextPage: page + 1, append: true });
    }, { rootMargin: "320px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadTickets, lastPage, loading, loadingMore, page]);

  const openEdit = (ticket) => {
    setSelected(ticket);
    setForm({
      name: ticket.name || "",
      price: ticket.price ?? 0,
      quantity: ticket.quantity ?? 0,
      description: ticket.description || "",
      limit_date: ticket.limit_date ? String(ticket.limit_date).slice(0, 16) : "",
    });
  };

  const save = async () => {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const payload = {
        name: form.name,
        price: Number(form.price || 0),
        quantity: Number(form.quantity || 0),
        description: form.description || null,
        limit_date: form.limit_date || null,
      };
      const response = await applicationAdminTicketService.update(selected.id, payload);
      const updated = response?.data;
      if (updated) setTickets((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
      setSuccess("Ingresso atualizado globalmente com sucesso.");
      setSelected(null);
    } catch (err) {
      setError(err?.response?.data?.message || Object.values(err?.response?.data?.errors || {})?.flat?.()?.[0] || "Não foi possível atualizar o ingresso.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (ticket) => {
    if (!window.confirm(`Excluir definitivamente o lote "${ticket.name}"? Esta ação só é permitida quando não existem emissões vinculadas.`)) return;
    setBusy(true);
    setError("");
    try {
      await applicationAdminTicketService.remove(ticket.id);
      setTickets((current) => current.filter((item) => item.id !== ticket.id));
      setSuccess("Ingresso excluído com sucesso.");
    } catch (err) {
      setError(err?.response?.data?.message || Object.values(err?.response?.data?.errors || {})?.flat?.()?.[0] || "Não foi possível excluir o ingresso.");
    } finally {
      setBusy(false);
    }
  };

  return <div className="cut-app-page">
    <NavlogComponent />
    <Container className="cut-page-container py-4 py-lg-5">
      <div className="cut-page-heading align-items-start">
        <div>
          <span className="cut-eyebrow">Cutinapp Owner · escopo global</span>
          <h1>Ingressos de toda a Cutinapp</h1>
          <p>Todos os lotes de todos os eventos e produções. Esta página não depende de você possuir uma produção e não executa onboarding de produtor.</p>
        </div>
        <div className="d-flex flex-wrap gap-2 justify-content-end">
          <Badge bg="danger">GLOBAL</Badge>
          {context?.profile?.name && <Badge bg="dark">{context.profile.name}</Badge>}
        </div>
      </div>

      {error && <Alert variant="danger" role="alert" dismissible onClose={() => setError("")}>{error}</Alert>}
      {success && <Alert variant="success" role="status" dismissible onClose={() => setSuccess("")}>{success}</Alert>}

      <Card className="cut-panel mb-4"><Card.Body>
        <Form.Control type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar ingresso, evento ou produção" aria-label="Buscar ingresso, evento ou produção" />
      </Card.Body></Card>

      {loading && !tickets.length ? <div className="text-center py-5"><Spinner /><p className="mt-2">Carregando ingressos de toda a Cutinapp...</p></div> : <>
        <Row className="g-3">
          {tickets.map((ticket) => <Col md={6} xl={4} key={ticket.id}><Card className="cut-panel h-100"><Card.Body className="d-flex flex-column">
            <div className="d-flex justify-content-between gap-3 align-items-start">
              <div>
                <span className="cut-eyebrow">{ticket.event?.production?.name || "Produção não informada"}</span>
                <h2 className="cut-section-title mt-2">{ticket.name}</h2>
              </div>
              <Badge bg={ticket.available ? "success" : ticket.expired ? "warning" : "secondary"}>{ticket.available ? "Disponível" : ticket.expired ? "Expirado" : "Esgotado"}</Badge>
            </div>
            <p className="text-secondary mb-2">{ticket.event?.title || "Evento não informado"}</p>
            <div className="d-flex flex-wrap gap-3 mb-3">
              <span><strong>{money(ticket.price)}</strong></span>
              <span>{ticket.remaining ?? 0}/{ticket.quantity ?? 0} restantes</span>
              <span>{ticket.valid_passes_count ?? ticket.passes_count ?? 0} emitidos</span>
            </div>
            <div className="mt-auto d-flex gap-2">
              <Button className="flex-grow-1" onClick={() => openEdit(ticket)} disabled={busy}><i className="fa-solid fa-pen me-2" />Editar</Button>
              <Button variant="outline-danger" onClick={() => remove(ticket)} disabled={busy} aria-label={`Excluir ${ticket.name}`}><i className="fa-solid fa-trash" /></Button>
            </div>
          </Card.Body></Card></Col>)}
          {!tickets.length && !error && <Col><Alert variant="secondary"><strong>Nenhum ingresso encontrado.</strong> Isso significa que não há lotes correspondentes ao filtro global atual; não é um onboarding de produtor.</Alert></Col>}
        </Row>
        <div ref={sentinelRef} className="text-center py-4" aria-live="polite">
          {loadingMore && <><Spinner size="sm" /><span className="ms-2">Buscando mais ingressos...</span></>}
          {!loadingMore && tickets.length > 0 && page >= lastPage && <small className="text-secondary">Fim dos ingressos encontrados.</small>}
        </div>
      </>}
    </Container>

    <Modal show={Boolean(selected)} onHide={() => !busy && setSelected(null)} centered>
      <Modal.Header closeButton={!busy}><Modal.Title>Editar ingresso globalmente</Modal.Title></Modal.Header>
      <Modal.Body>
        <Form.Group className="mb-3"><Form.Label>Nome</Form.Label><Form.Control value={form.name || ""} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} /></Form.Group>
        <Row className="g-3 mb-3"><Col><Form.Label>Preço</Form.Label><Form.Control type="number" min="0" step="0.01" value={form.price ?? 0} onChange={(e) => setForm((current) => ({ ...current, price: e.target.value }))} /></Col><Col><Form.Label>Quantidade</Form.Label><Form.Control type="number" min="0" value={form.quantity ?? 0} onChange={(e) => setForm((current) => ({ ...current, quantity: e.target.value }))} /></Col></Row>
        <Form.Group className="mb-3"><Form.Label>Prazo</Form.Label><Form.Control type="datetime-local" value={form.limit_date || ""} onChange={(e) => setForm((current) => ({ ...current, limit_date: e.target.value }))} /></Form.Group>
        <Form.Group><Form.Label>Descrição</Form.Label><Form.Control as="textarea" rows={3} value={form.description || ""} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} /></Form.Group>
      </Modal.Body>
      <Modal.Footer><Button variant="secondary" onClick={() => setSelected(null)} disabled={busy}>Cancelar</Button><Button onClick={save} disabled={busy}>{busy ? <Spinner size="sm" /> : "Salvar alteração"}</Button></Modal.Footer>
    </Modal>
  </div>;
}
