import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Row, Spinner } from "react-bootstrap";
import NavlogComponent from "../../components/NavlogComponent";
import appApiClient from "../../services/AppApiClient";

const PAGE_SIZE = 12;
const money = (value) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function ApplicationAdminOrdersPage() {
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
      const response = await appApiClient.get("/admin/orders", { params: { page: nextPage, per_page: PAGE_SIZE, q: q || undefined } });
      if (requestId !== requestRef.current) return;
      const paginator = response.data?.data || {};
      const data = Array.isArray(paginator.data) ? paginator.data : [];
      setRows((current) => append ? [...current, ...data.filter((row) => !current.some((item) => item.id === row.id))] : data);
      setPage(Number(paginator.current_page || nextPage));
      setLastPage(Number(paginator.last_page || nextPage));
    } catch (err) {
      if (requestId === requestRef.current) setError(err?.response?.data?.message || err?.message || "Não foi possível carregar as vendas globais.");
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

  const patch = async (order, changes, message) => {
    setBusyId(order.id); setError(""); setSuccess("");
    try {
      const response = await appApiClient.put(`/admin/orders/${order.id}`, changes);
      const updated = response.data?.data;
      if (updated) setRows((current) => current.map((row) => row.id === updated.id ? { ...row, ...updated } : row));
      setSuccess(message);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Não foi possível alterar o pedido.");
    } finally { setBusyId(null); }
  };

  return <div className="cut-app-page">
    <NavlogComponent />
    <Container className="cut-page-container py-4 py-lg-5">
      <div className="cut-page-heading align-items-start">
        <div><span className="cut-eyebrow">Cutinapp Owner · escopo global</span><h1>Vendas e pedidos</h1><p>Pedidos de toda a aplicação, independentemente da produção, vendedor, promoter ou usuário responsável.</p></div>
        <Badge bg="danger">GLOBAL</Badge>
      </div>
      {error && <Alert variant="danger" dismissible onClose={() => setError("")}>{error}</Alert>}
      {success && <Alert variant="success" dismissible onClose={() => setSuccess("")}>{success}</Alert>}
      <Card className="cut-panel mb-4"><Card.Body><Form.Control type="search" placeholder="Buscar pedido, cliente, e-mail ou telefone" value={query} onChange={(e) => setQuery(e.target.value)} /></Card.Body></Card>
      {loading && !rows.length ? <div className="text-center py-5"><Spinner /><p className="mt-2">Carregando todas as vendas...</p></div> : <Row className="g-3">
        {rows.map((order) => <Col md={6} xl={4} key={order.id}><Card className="cut-panel h-100"><Card.Body className="d-flex flex-column">
          <div className="d-flex justify-content-between gap-2"><div><span className="cut-eyebrow">Pedido #{order.order_number || order.id}</span><h2 className="cut-section-title mt-2">{order.customer_name || order.client?.email || "Cliente"}</h2></div><Badge bg={['paid','approved','completed'].includes(order.payment_status) ? "success" : order.payment_status === 'refunded' ? "warning" : "secondary"}>{order.payment_status || "sem status"}</Badge></div>
          <p className="text-secondary mb-2">{order.customer_email || order.client?.email || "E-mail não informado"}</p>
          <p className="fs-5 fw-bold mb-3">{money(order.total_price)}</p>
          <div className="d-flex flex-wrap gap-2 mt-auto">
            <Button size="sm" disabled={busyId === order.id} onClick={() => patch(order, { status: "completed" }, "Pedido marcado como concluído.")}>Concluir</Button>
            <Button size="sm" variant="outline-warning" disabled={busyId === order.id} onClick={() => patch(order, { payment_status: "refunded" }, "Status financeiro marcado como reembolsado.")}>Marcar reembolso</Button>
            <Button size="sm" variant="outline-danger" disabled={busyId === order.id} onClick={() => patch(order, { status: "cancelled", cancelled_reason: "Cancelado pelo Cutinapp Owner" }, "Pedido cancelado administrativamente.")}>Cancelar</Button>
          </div>
        </Card.Body></Card></Col>)}
        {!rows.length && !error && <Col><Alert variant="secondary">Nenhum pedido encontrado no escopo global atual.</Alert></Col>}
      </Row>}
      <div ref={sentinelRef} className="text-center py-4">{loadingMore && <><Spinner size="sm" /><span className="ms-2">Buscando mais pedidos...</span></>}{!loadingMore && rows.length > 0 && page >= lastPage && <small className="text-secondary">Fim dos resultados.</small>}</div>
    </Container>
  </div>;
}
