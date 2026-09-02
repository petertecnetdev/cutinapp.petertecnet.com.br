import React, { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Row, Spinner } from "react-bootstrap";
import { Link } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import commerceService from "../../services/CommerceService";
import cutinappService from "../../services/CutinappService";
import "./CommerceHistory.css";

const money = (value) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const statusLabel = { paid: "Pago", pending: "Pendente", cancelled: "Cancelado", refunded: "Reembolsado", charged_back: "Contestada" };

export default function ProducerSalesPage() {
  const [productions, setProductions] = useState([]);
  const [productionId, setProductionId] = useState("");
  const [filters, setFilters] = useState({ q: "", status: "" });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    cutinappService.myProductions()
      .then((list) => {
        if (!active) return;
        const normalized = Array.isArray(list) ? list : [];
        setProductions(normalized);
        if (normalized[0]?.id) setProductionId(String(normalized[0].id));
      })
      .catch((err) => active && setError(err?.message || "Não foi possível carregar suas produções."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!productionId) return;
    let active = true;
    setLoading(true); setError("");
    commerceService.producerSales(productionId, { ...filters, per_page: 100 })
      .then((response) => active && setResult(response))
      .catch((err) => active && setError(err?.message || "Não foi possível carregar as vendas."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [productionId, filters.q, filters.status]);

  const summary = result?.summary || {};
  const orders = result?.orders?.data || [];

  return <>
    <NavlogComponent />
    <Container className="cut-commerce-history py-4 py-lg-5">
      <div className="cut-commerce-heading"><div><span className="cut-commerce-kicker">Produtor</span><h1>Vendas</h1><p>Controle pedidos, pagamentos, taxas e recibos da sua produção.</p></div><Button as={Link} to="/producer/finance" variant="outline-light">Financeiro</Button></div>
      {error && <Alert variant="danger">{error}</Alert>}
      {!loading && !productions.length && <Alert variant="info">Você ainda não possui uma produção para acompanhar vendas.</Alert>}
      {!!productions.length && <Card className="cut-commerce-card mb-3"><Card.Body><Row className="g-3"><Col md={5}><Form.Label>Produção</Form.Label><Form.Select value={productionId} onChange={(e) => setProductionId(e.target.value)}>{productions.map((production) => <option key={production.id} value={production.id}>{production.name}</option>)}</Form.Select></Col><Col md={4}><Form.Label>Buscar</Form.Label><Form.Control value={filters.q} onChange={(e) => setFilters((current) => ({ ...current, q: e.target.value }))} placeholder="Pedido, nome ou e-mail" /></Col><Col md={3}><Form.Label>Status</Form.Label><Form.Select value={filters.status} onChange={(e) => setFilters((current) => ({ ...current, status: e.target.value }))}><option value="">Todos</option><option value="paid">Pagos</option><option value="pending">Pendentes</option><option value="cancelled">Cancelados</option><option value="refunded">Reembolsados</option><option value="charged_back">Contestados</option></Form.Select></Col></Row></Card.Body></Card>}

      {productionId && <Row className="g-3 mb-3"><Col md={3}><div className="cut-commerce-stat"><small>Vendas pagas</small><strong>{summary.paid_count || 0}</strong></div></Col><Col md={3}><div className="cut-commerce-stat"><small>Faturamento bruto</small><strong>{money(summary.gross_paid)}</strong></div></Col><Col md={3}><div className="cut-commerce-stat"><small>Taxas da plataforma</small><strong>{money(summary.platform_fees)}</strong></div></Col><Col md={3}><div className="cut-commerce-stat"><small>Líquido do produtor</small><strong>{money(summary.producer_net)}</strong></div></Col></Row>}

      {loading && <div className="text-center py-5"><Spinner animation="border" /></div>}
      {!loading && productionId && !orders.length && <Card className="cut-commerce-card"><Card.Body>Nenhuma venda encontrada para estes filtros.</Card.Body></Card>}
      <div className="cut-commerce-list">{orders.map((order) => <Card className="cut-commerce-card" key={order.public_id}><Card.Body><div className="cut-commerce-order-top"><div><small>Pedido #{String(order.public_id).slice(0, 8).toUpperCase()}</small><h2>{order.event?.title || "Evento"}</h2><p>{[order.user?.first_name, order.user?.last_name].filter(Boolean).join(" ") || order.user?.email || "Cliente"} · {order.user?.email}</p></div><Badge bg={order.status === "paid" ? "success" : order.status === "pending" ? "warning" : "secondary"}>{statusLabel[order.status] || order.status}</Badge></div><div className="cut-commerce-order-grid"><span><strong>{money(order.total)}</strong><small>Total</small></span><span><strong>{money(order.platform_fee)}</strong><small>Taxa Cutinapp</small></span><span><strong>{money(order.producer_net)}</strong><small>Líquido</small></span></div><div className="cut-commerce-actions"><Button as={Link} to={`/producer/sales/${productionId}/${order.public_id}`}>Ver venda</Button></div></Card.Body></Card>)}</div>
    </Container>
  </>;
}
