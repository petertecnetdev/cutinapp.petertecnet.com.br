import React, { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Row, Spinner } from "react-bootstrap";
import { Link } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import commerceService from "../../services/CommerceService";
import cutinappService from "../../services/CutinappService";
import "./CommerceHistory.css";

const money = (value) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const percent = (value) => `${Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
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
  const economicMetrics = useMemo(() => {
    const grossPaid = Number(summary.gross_paid || 0);
    const paidCount = Number(summary.paid_count || 0);
    const platformFees = Number(summary.platform_fees || 0);

    return {
      averageTicket: paidCount > 0 ? grossPaid / paidCount : 0,
      platformRevenuePerSale: paidCount > 0 ? platformFees / paidCount : 0,
      takeRate: grossPaid > 0 ? (platformFees / grossPaid) * 100 : 0,
    };
  }, [summary.gross_paid, summary.paid_count, summary.platform_fees]);

  const eventEconomics = useMemo(() => {
    const grouped = new Map();

    orders.filter((order) => order.status === "paid").forEach((order) => {
      const eventId = String(order.event?.id || order.event_id || order.event?.title || "evento");
      const current = grouped.get(eventId) || {
        id: eventId,
        title: order.event?.title || "Evento",
        paidCount: 0,
        gmv: 0,
        platformRevenue: 0,
        producerNet: 0,
      };

      current.paidCount += 1;
      current.gmv += Number(order.total || 0);
      current.platformRevenue += Number(order.platform_fee || 0);
      current.producerNet += Number(order.producer_net || 0);
      grouped.set(eventId, current);
    });

    return Array.from(grouped.values())
      .map((event) => ({
        ...event,
        averageTicket: event.paidCount > 0 ? event.gmv / event.paidCount : 0,
        platformRevenuePerSale: event.paidCount > 0 ? event.platformRevenue / event.paidCount : 0,
        takeRate: event.gmv > 0 ? (event.platformRevenue / event.gmv) * 100 : 0,
        producerShare: event.gmv > 0 ? (event.producerNet / event.gmv) * 100 : 0,
      }))
      .sort((a, b) => b.platformRevenue - a.platformRevenue)
      .slice(0, 5);
  }, [orders]);

  return <>
    <NavlogComponent />
    <Container className="cut-commerce-history py-4 py-lg-5">
      <div className="cut-commerce-heading"><div><span className="cut-commerce-kicker">Produtor</span><h1>Vendas</h1><p>Controle pedidos, pagamentos, taxas e recibos da sua produção.</p></div><Button as={Link} to="/producer/finance" variant="outline-light">Financeiro</Button></div>
      {error && <Alert variant="danger">{error}</Alert>}
      {!loading && !productions.length && <Alert variant="info">Você ainda não possui uma produção para acompanhar vendas.</Alert>}
      {!!productions.length && <Card className="cut-commerce-card mb-3"><Card.Body><Row className="g-3"><Col md={5}><Form.Label>Produção</Form.Label><Form.Select value={productionId} onChange={(e) => setProductionId(e.target.value)}>{productions.map((production) => <option key={production.id} value={production.id}>{production.name}</option>)}</Form.Select></Col><Col md={4}><Form.Label>Buscar</Form.Label><Form.Control value={filters.q} onChange={(e) => setFilters((current) => ({ ...current, q: e.target.value }))} placeholder="Pedido, nome ou e-mail" /></Col><Col md={3}><Form.Label>Status</Form.Label><Form.Select value={filters.status} onChange={(e) => setFilters((current) => ({ ...current, status: e.target.value }))}><option value="">Todos</option><option value="paid">Pagos</option><option value="pending">Pendentes</option><option value="cancelled">Cancelados</option><option value="refunded">Reembolsados</option><option value="charged_back">Contestados</option></Form.Select></Col></Row></Card.Body></Card>}

      {productionId && <>
        <Row className="g-3 mb-3">
          <Col sm={6} lg={4} xl={3}><div className="cut-commerce-stat"><small>Vendas pagas</small><strong>{summary.paid_count || 0}</strong></div></Col>
          <Col sm={6} lg={4} xl={3}><div className="cut-commerce-stat"><small>GMV pago</small><strong>{money(summary.gross_paid)}</strong></div></Col>
          <Col sm={6} lg={4} xl={3}><div className="cut-commerce-stat"><small>Ticket médio</small><strong>{money(economicMetrics.averageTicket)}</strong></div></Col>
          <Col sm={6} lg={4} xl={3}><div className="cut-commerce-stat"><small>Receita Cutinapp</small><strong>{money(summary.platform_fees)}</strong></div></Col>
          <Col sm={6} lg={4} xl={3}><div className="cut-commerce-stat"><small>Receita Cutinapp / venda</small><strong>{money(economicMetrics.platformRevenuePerSale)}</strong></div></Col>
          <Col sm={6} lg={4} xl={3}><div className="cut-commerce-stat"><small>Take rate efetivo</small><strong>{percent(economicMetrics.takeRate)}</strong></div></Col>
          <Col sm={6} lg={4} xl={3}><div className="cut-commerce-stat"><small>Líquido do produtor</small><strong>{money(summary.producer_net)}</strong></div></Col>
        </Row>
        <Alert variant="info" className="mb-3">
          O GMV considera as vendas pagas. A receita Cutinapp corresponde às taxas da plataforma já registradas nas vendas. A receita por venda mostra quanto cada pedido pago gera, em média, para a plataforma, e o take rate efetivo mostra quanto dessa receita representa sobre o GMV.
        </Alert>
        {!!eventEconomics.length && <Card className="cut-commerce-card mb-3">
          <Card.Body>
            <div className="cut-commerce-order-top mb-3">
              <div>
                <small>Monetização por evento</small>
                <h2>Eventos que mais geram receita Cutinapp</h2>
                <p>Compare receita por venda, ticket médio e participação econômica usando somente as taxas efetivamente registradas nas vendas pagas carregadas.</p>
              </div>
            </div>
            <Row className="g-3">
              {eventEconomics.map((event, index) => <Col lg={6} key={event.id}>
                <div className="cut-commerce-stat h-100">
                  <small>#{index + 1} · {event.title}</small>
                  <strong>{money(event.platformRevenue)}</strong>
                  <span>{money(event.gmv)} GMV · {event.paidCount} venda(s)</span>
                  <span>Receita Cutinapp / venda {money(event.platformRevenuePerSale)}</span>
                  <span>Ticket médio {money(event.averageTicket)} · Take rate {percent(event.takeRate)}</span>
                  <span>Líquido do produtor {money(event.producerNet)} · {percent(event.producerShare)} do GMV</span>
                </div>
              </Col>)}
            </Row>
          </Card.Body>
        </Card>}
      </>}

      {loading && <div className="text-center py-5"><Spinner animation="border" /></div>}
      {!loading && productionId && !orders.length && <Card className="cut-commerce-card"><Card.Body>Nenhuma venda encontrada para estes filtros.</Card.Body></Card>}
      <div className="cut-commerce-list">{orders.map((order) => <Card className="cut-commerce-card" key={order.public_id}><Card.Body><div className="cut-commerce-order-top"><div><small>Pedido #{String(order.public_id).slice(0, 8).toUpperCase()}</small><h2>{order.event?.title || "Evento"}</h2><p>{[order.user?.first_name, order.user?.last_name].filter(Boolean).join(" ") || order.user?.email || "Cliente"} · {order.user?.email}</p></div><Badge bg={order.status === "paid" ? "success" : order.status === "pending" ? "warning" : "secondary"}>{statusLabel[order.status] || order.status}</Badge></div><div className="cut-commerce-order-grid"><span><strong>{money(order.total)}</strong><small>Total</small></span><span><strong>{money(order.platform_fee)}</strong><small>Taxa Cutinapp</small></span><span><strong>{money(order.producer_net)}</strong><small>Líquido</small></span></div><div className="cut-commerce-actions"><Button as={Link} to={`/producer/sales/${productionId}/${order.public_id}`}>Ver venda</Button></div></Card.Body></Card>)}</div>
    </Container>
  </>;
}
