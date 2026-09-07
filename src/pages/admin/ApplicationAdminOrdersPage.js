import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Modal, Row, Spinner } from "react-bootstrap";
import NavlogComponent from "../../components/NavlogComponent";
import appApiClient from "../../services/AppApiClient";

const PAGE_SIZE = 12;
const money = (value) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const variant = (status) => status === "paid" ? "success" : status === "refunded" ? "warning" : ["cancelled", "failed"].includes(status) ? "danger" : "secondary";

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
  const [refundOrder, setRefundOrder] = useState(null);
  const [refundReason, setRefundReason] = useState("");
  const sentinelRef = useRef(null);
  const requestRef = useRef(0);

  const load = useCallback(async ({ nextPage = 1, append = false, q = debouncedQuery } = {}) => {
    const requestId = ++requestRef.current; append ? setLoadingMore(true) : setLoading(true); setError("");
    try {
      const response = await appApiClient.get("/admin/commerce-orders", { params: { page: nextPage, per_page: PAGE_SIZE, q: q || undefined } });
      if (requestId !== requestRef.current) return;
      const paginator = response.data?.data || {}; const data = Array.isArray(paginator.data) ? paginator.data : [];
      setRows((current) => append ? [...current, ...data.filter((row) => !current.some((item) => item.id === row.id))] : data);
      setPage(Number(paginator.current_page || nextPage)); setLastPage(Number(paginator.last_page || nextPage));
    } catch (err) { if (requestId === requestRef.current) setError(err?.response?.data?.message || err?.message || "Não foi possível carregar as vendas globais."); }
    finally { if (requestId === requestRef.current) { setLoading(false); setLoadingMore(false); } }
  }, [debouncedQuery]);

  useEffect(() => { const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 280); return () => window.clearTimeout(timer); }, [query]);
  useEffect(() => { setRows([]); setPage(1); setLastPage(1); void load({ nextPage: 1, append: false, q: debouncedQuery }); }, [debouncedQuery, load]);
  useEffect(() => { const node = sentinelRef.current; if (!node || loading || loadingMore || page >= lastPage) return undefined; const observer = new IntersectionObserver((entries) => { if (entries[0]?.isIntersecting && page < lastPage) void load({ nextPage: page + 1, append: true }); }, { rootMargin: "320px 0px" }); observer.observe(node); return () => observer.disconnect(); }, [load, lastPage, loading, loadingMore, page]);

  const refund = async (event) => {
    event.preventDefault(); if (!refundOrder || !refundReason.trim()) return;
    setBusyId(refundOrder.id); setError(""); setSuccess("");
    try {
      const response = await appApiClient.post(`/admin/commerce-orders/${refundOrder.id}/refund`, { reason: refundReason.trim() });
      const updated = response.data?.data;
      if (updated) setRows((current) => current.map((row) => row.id === updated.id ? updated : row));
      setSuccess(response.data?.message || "Reembolso confirmado pelo provedor."); setRefundOrder(null); setRefundReason("");
    } catch (err) {
      const validation = err?.response?.data?.errors; setError(validation ? Object.values(validation).flat().join(" ") : (err?.response?.data?.message || err?.message || "Não foi possível efetuar o reembolso."));
    } finally { setBusyId(null); }
  };

  return <div className="cut-app-page"><NavlogComponent /><Container className="cut-page-container py-4 py-lg-5">
    <div className="cut-page-heading align-items-start"><div><span className="cut-eyebrow">Cutinapp Owner · escopo global</span><h1>Vendas e pedidos</h1><p>Pedidos pagos da plataforma, com rastreio do provedor e reembolso real.</p></div><Badge bg="danger">GLOBAL</Badge></div>
    {error && <Alert variant="danger" dismissible onClose={() => setError("")}>{error}</Alert>}{success && <Alert variant="success" dismissible onClose={() => setSuccess("")}>{success}</Alert>}
    <Card className="cut-panel mb-4"><Card.Body><Form.Control type="search" placeholder="Buscar pedido, cliente, evento ou produção" value={query} onChange={(e) => setQuery(e.target.value)} /></Card.Body></Card>
    {loading && !rows.length ? <div className="text-center py-5"><Spinner /></div> : <Row className="g-3">{rows.map((order) => { const payment = (order.payments || []).slice().sort((a,b) => b.id-a.id)[0]; return <Col md={6} xl={4} key={order.id}><Card className="cut-panel h-100"><Card.Body className="d-flex flex-column"><div className="d-flex justify-content-between gap-2"><div><span className="cut-eyebrow">{order.public_id || `#${order.id}`}</span><h2 className="cut-section-title mt-2">{order.event?.title || "Pedido"}</h2></div><Badge bg={variant(order.status)}>{order.status || "pending"}</Badge></div><p className="text-secondary mb-1">{order.production?.name || "Produção"}</p><p className="text-secondary mb-2">{order.user?.email || "Usuário não informado"}</p><p className="fs-5 fw-bold mb-2">{money(order.total)}</p><small className="text-secondary">{payment ? `${payment.provider} · ${payment.method} · ${payment.provider_payment_id || "sem ID"}` : "Pagamento ainda não criado"}</small><div className="mt-auto pt-3">{order.status === "paid" && payment?.provider === "mercadopago" ? <Button className="w-100" size="sm" variant="outline-warning" disabled={busyId === order.id} onClick={() => { setRefundOrder(order); setRefundReason(""); }}>Reembolsar no Mercado Pago</Button> : order.status === "refunded" ? <Alert variant="warning" className="py-2 mb-0">Pagamento reembolsado.</Alert> : null}</div></Card.Body></Card></Col>; })}{!rows.length && !error && <Col><Alert variant="secondary">Nenhum pedido encontrado.</Alert></Col>}</Row>}
    <div ref={sentinelRef} className="text-center py-4">{loadingMore && <Spinner size="sm" />}{!loadingMore && rows.length > 0 && page >= lastPage && <small className="text-secondary">Fim dos resultados.</small>}</div>
  </Container>
  <Modal show={Boolean(refundOrder)} onHide={() => !busyId && setRefundOrder(null)} centered><Form onSubmit={refund}><Modal.Header closeButton={!busyId}><Modal.Title>Confirmar reembolso real</Modal.Title></Modal.Header><Modal.Body><Alert variant="warning">Esta operação solicita a devolução do pagamento diretamente ao Mercado Pago e invalida os ingressos do pedido.</Alert><div className="mb-3"><strong>{refundOrder?.event?.title}</strong><div>{money(refundOrder?.total)}</div></div><Form.Group><Form.Label>Motivo do reembolso</Form.Label><Form.Control required as="textarea" rows={3} maxLength={1000} value={refundReason} onChange={(e) => setRefundReason(e.target.value)} /></Form.Group></Modal.Body><Modal.Footer><Button variant="outline-secondary" disabled={Boolean(busyId)} onClick={() => setRefundOrder(null)}>Cancelar</Button><Button variant="warning" type="submit" disabled={Boolean(busyId) || !refundReason.trim()}>{busyId ? <Spinner size="sm" /> : "Confirmar reembolso"}</Button></Modal.Footer></Form></Modal>
  </div>;
}
