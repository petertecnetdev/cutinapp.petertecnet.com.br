import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Row, Spinner } from "react-bootstrap";
import NavlogComponent from "../../components/NavlogComponent";
import appApiClient from "../../services/AppApiClient";

const PAGE_SIZE = 12;

export default function ApplicationAdminProductionsPage() {
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
      const response = await appApiClient.get("/admin/productions", { params: { page: nextPage, per_page: PAGE_SIZE, q: q || undefined } });
      if (requestId !== requestRef.current) return;
      const paginator = response.data?.data || {};
      const data = Array.isArray(paginator.data) ? paginator.data : [];
      setRows((current) => append ? [...current, ...data.filter((row) => !current.some((item) => item.id === row.id))] : data);
      setPage(Number(paginator.current_page || nextPage));
      setLastPage(Number(paginator.last_page || nextPage));
    } catch (err) {
      if (requestId === requestRef.current) setError(err?.response?.data?.message || err?.message || "Não foi possível carregar as produções globais.");
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

  const patch = async (production, changes, message) => {
    setBusyId(production.id); setError(""); setSuccess("");
    try {
      const response = await appApiClient.put(`/admin/productions/${production.id}`, changes);
      const updated = response.data?.data;
      if (updated) setRows((current) => current.map((row) => row.id === updated.id ? { ...row, ...updated } : row));
      setSuccess(message);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Não foi possível alterar a produção.");
    } finally { setBusyId(null); }
  };

  return <div className="cut-app-page">
    <NavlogComponent />
    <Container className="cut-page-container py-4 py-lg-5">
      <div className="cut-page-heading align-items-start">
        <div><span className="cut-eyebrow">Cutinapp Owner · escopo global</span><h1>Todas as produções</h1><p>Administre produções de qualquer usuário sem depender de vínculo de propriedade, gerência ou equipe.</p></div>
        <Badge bg="danger">GLOBAL</Badge>
      </div>
      {error && <Alert variant="danger" dismissible onClose={() => setError("")}>{error}</Alert>}
      {success && <Alert variant="success" dismissible onClose={() => setSuccess("")}>{success}</Alert>}
      <Card className="cut-panel mb-4"><Card.Body><Form.Control type="search" placeholder="Buscar produção, cidade, e-mail ou proprietário" value={query} onChange={(e) => setQuery(e.target.value)} /></Card.Body></Card>
      {loading && !rows.length ? <div className="text-center py-5"><Spinner /><p className="mt-2">Carregando todas as produções...</p></div> : <Row className="g-3">
        {rows.map((production) => <Col md={6} xl={4} key={production.id}><Card className="cut-panel h-100"><Card.Body className="d-flex flex-column">
          <div className="d-flex justify-content-between gap-2"><div><span className="cut-eyebrow">#{production.id}</span><h2 className="cut-section-title mt-2">{production.name}</h2></div><Badge bg={production.is_cancelled ? "danger" : production.is_published ? "success" : "secondary"}>{production.is_cancelled ? "Suspensa" : production.is_published ? "Publicada" : "Rascunho"}</Badge></div>
          <p className="text-secondary mb-2">{production.city || "Cidade não informada"}</p>
          <p className="mb-3"><strong>Responsável:</strong> {production.user?.email || production.email || "Não informado"}</p>
          <div className="d-flex flex-wrap gap-3 mb-3"><span>{production.events_count || 0} eventos</span><span>{production.employers_count || 0} membros</span></div>
          <div className="mt-auto d-flex flex-wrap gap-2">
            <Button size="sm" disabled={busyId === production.id} onClick={() => patch(production, { is_published: !production.is_published }, production.is_published ? "Produção despublicada." : "Produção publicada.")}>{production.is_published ? "Despublicar" : "Publicar"}</Button>
            <Button size="sm" variant={production.is_approved ? "outline-secondary" : "outline-success"} disabled={busyId === production.id} onClick={() => patch(production, { is_approved: !production.is_approved }, production.is_approved ? "Aprovação removida." : "Produção aprovada.")}>{production.is_approved ? "Remover aprovação" : "Aprovar"}</Button>
            <Button size="sm" variant={production.is_cancelled ? "outline-success" : "outline-danger"} disabled={busyId === production.id} onClick={() => patch(production, { is_cancelled: !production.is_cancelled }, production.is_cancelled ? "Produção reativada." : "Produção suspensa.")}>{production.is_cancelled ? "Reativar" : "Suspender"}</Button>
          </div>
        </Card.Body></Card></Col>)}
        {!rows.length && !error && <Col><Alert variant="secondary">Nenhuma produção encontrada no escopo global atual.</Alert></Col>}
      </Row>}
      <div ref={sentinelRef} className="text-center py-4">{loadingMore && <><Spinner size="sm" /><span className="ms-2">Buscando mais produções...</span></>}{!loadingMore && rows.length > 0 && page >= lastPage && <small className="text-secondary">Fim dos resultados.</small>}</div>
    </Container>
  </div>;
}
