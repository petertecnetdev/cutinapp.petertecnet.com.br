import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Row, Spinner } from "react-bootstrap";
import NavlogComponent from "../../components/NavlogComponent";
import appApiClient from "../../services/AppApiClient";

const PAGE_SIZE = 12;
const fmt = (value) => value ? new Date(value).toLocaleString("pt-BR") : "Não utilizado";

export default function ApplicationAdminCheckinsPage() {
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const sentinelRef = useRef(null);
  const requestRef = useRef(0);

  const load = useCallback(async ({ nextPage = 1, append = false, q = debouncedQuery } = {}) => {
    const requestId = ++requestRef.current;
    append ? setLoadingMore(true) : setLoading(true);
    setError("");
    try {
      const response = await appApiClient.get("/admin/checkins", { params: { page: nextPage, per_page: PAGE_SIZE, q: q || undefined } });
      if (requestId !== requestRef.current) return;
      const paginator = response.data?.data || {};
      const data = Array.isArray(paginator.data) ? paginator.data : [];
      setRows((current) => append ? [...current, ...data.filter((row) => !current.some((item) => item.id === row.id))] : data);
      setPage(Number(paginator.current_page || nextPage));
      setLastPage(Number(paginator.last_page || nextPage));
    } catch (err) {
      if (requestId === requestRef.current) setError(err?.response?.data?.message || err?.message || "Não foi possível carregar os acessos globais.");
    } finally {
      if (requestId === requestRef.current) { setLoading(false); setLoadingMore(false); }
    }
  }, [debouncedQuery]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 280);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setRows([]); setPage(1); setLastPage(1);
    void load({ nextPage: 1, append: false, q: debouncedQuery });
  }, [debouncedQuery, load]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || loading || loadingMore || page >= lastPage) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && page < lastPage) void load({ nextPage: page + 1, append: true });
    }, { rootMargin: "320px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [load, lastPage, loading, loadingMore, page]);

  const invalidate = async (pass) => {
    const reason = window.prompt("Motivo da invalidação administrativa:");
    if (!reason?.trim()) return;
    setBusyId(pass.id); setError(""); setSuccess("");
    try {
      const response = await appApiClient.put(`/admin/passes/${pass.id}/invalidate`, { reason: reason.trim() });
      const updated = response.data?.data;
      if (updated) setRows((current) => current.map((row) => row.id === updated.id ? { ...row, ...updated } : row));
      setSuccess("Ingresso invalidado globalmente.");
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Não foi possível invalidar o ingresso.");
    } finally { setBusyId(null); }
  };

  return <div className="cut-app-page">
    <NavlogComponent />
    <Container className="cut-page-container py-4 py-lg-5">
      <div className="cut-page-heading align-items-start">
        <div><span className="cut-eyebrow">Cutinapp Owner · escopo global</span><h1>Check-ins e acessos</h1><p>Visualize ingressos emitidos e validações de todos os eventos e produções, sem depender de vínculo operacional.</p></div>
        <Badge bg="danger">GLOBAL</Badge>
      </div>
      {error && <Alert variant="danger" dismissible onClose={() => setError("")}>{error}</Alert>}
      {success && <Alert variant="success" dismissible onClose={() => setSuccess("")}>{success}</Alert>}
      <Card className="cut-panel mb-4"><Card.Body><Form.Control type="search" placeholder="Buscar participante, e-mail, token, evento ou produção" value={query} onChange={(e) => setQuery(e.target.value)} /></Card.Body></Card>
      {loading && !rows.length ? <div className="text-center py-5"><Spinner /><p className="mt-2">Carregando acessos de toda a Cutinapp...</p></div> : <Row className="g-3">
        {rows.map((pass) => <Col md={6} xl={4} key={pass.id}><Card className="cut-panel h-100"><Card.Body className="d-flex flex-column">
          <div className="d-flex justify-content-between gap-2"><div><span className="cut-eyebrow">{pass.event?.production?.name || "Produção"}</span><h2 className="cut-section-title mt-2">{pass.holder_name || pass.user?.first_name || "Participante"}</h2></div><Badge bg={pass.status === "cancelled" ? "danger" : pass.checked_in_at ? "success" : "secondary"}>{pass.status === "cancelled" ? "Invalidado" : pass.checked_in_at ? "Entrou" : "Pendente"}</Badge></div>
          <p className="text-secondary mb-1">{pass.holder_email || pass.user?.email || "E-mail não informado"}</p>
          <p className="mb-1"><strong>Evento:</strong> {pass.event?.title || "Não informado"}</p>
          <p className="mb-3"><strong>Check-in:</strong> {fmt(pass.checked_in_at)}</p>
          <div className="mt-auto"><Button variant="outline-danger" size="sm" disabled={busyId === pass.id || pass.status === "cancelled"} onClick={() => invalidate(pass)}>Invalidar ingresso</Button></div>
        </Card.Body></Card></Col>)}
        {!rows.length && !error && <Col><Alert variant="secondary">Nenhum ingresso emitido encontrado no escopo global atual.</Alert></Col>}
      </Row>}
      <div ref={sentinelRef} className="text-center py-4">{loadingMore && <><Spinner size="sm" /><span className="ms-2">Buscando mais acessos...</span></>}{!loadingMore && rows.length > 0 && page >= lastPage && <small className="text-secondary">Fim dos resultados.</small>}</div>
    </Container>
  </div>;
}
