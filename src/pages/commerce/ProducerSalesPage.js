import React, { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Row, Spinner } from "react-bootstrap";
import { Link } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import CollapsibleFilterPanel from "../../components/CollapsibleFilterPanel";
import commerceService from "../../services/CommerceService";
import cutinappService from "../../services/CutinappService";
import { estimateAddOnAttachmentOpportunity, suggestedAddOnStock, weightedAverageAddOnUnitPrice } from "../../utils/addOnOpportunity";
import { estimatePendingRevenueOpportunity } from "../../utils/pendingRevenueOpportunity";
import { estimateNetRevenueEconomics, processorFeesBorneByPlatformForOrder } from "../../utils/netRevenueEconomics";
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
  const activeFilterCount = Number(Boolean(filters.q.trim())) + Number(Boolean(filters.status));

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
    const paidOrders = orders.filter((order) => order.status === "paid");
    const grossPaid = paidOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const platformFees = paidOrders.reduce((sum, order) => sum + Number(order.platform_fee || 0), 0);
    const processorFeesBorneByPlatform = paidOrders.reduce((sum, order) => (
      sum + processorFeesBorneByPlatformForOrder({ processorFee: order.processor_fee, settlementMode: order.metadata?.settlement_mode })
    ), 0);
    const netEconomics = estimateNetRevenueEconomics({
      grossRevenue: grossPaid,
      platformRevenue: platformFees,
      processorFees: processorFeesBorneByPlatform,
      processorFeesBorneByPlatform,
      paidOrders: paidOrders.length,
    });

    return {
      averageTicket: paidOrders.length > 0 ? grossPaid / paidOrders.length : 0,
      platformRevenuePerSale: paidOrders.length > 0 ? platformFees / paidOrders.length : 0,
      takeRate: grossPaid > 0 ? (platformFees / grossPaid) * 100 : 0,
      netPlatformRevenue: netEconomics.netRevenue,
      netRevenuePerSale: netEconomics.netRevenuePerPaidOrder,
      netTakeRate: netEconomics.netTakeRate,
      contributionRatio: netEconomics.contributionRatio,
      contributionMargin: netEconomics.contributionRatio * 100,
      processorFeesBorneByPlatform,
    };
  }, [orders]);

  const pendingRevenue = useMemo(() => estimatePendingRevenueOpportunity({
    orders,
    fallbackTakeRate: economicMetrics.takeRate,
    fallbackContributionRatio: economicMetrics.contributionRatio,
  }), [economicMetrics.contributionRatio, economicMetrics.takeRate, orders]);

  const addOnEconomics = useMemo(() => {
    const paidOrders = orders.filter((order) => order.status === "paid");
    const ordersWithAddOns = paidOrders.filter((order) => (order.items || []).some((item) => item.type !== "ticket"));
    const addOnGmv = paidOrders.reduce((sum, order) => (
      sum + (order.items || [])
        .filter((item) => item.type !== "ticket")
        .reduce((itemSum, item) => itemSum + Number(item.subtotal || (Number(item.unit_price || 0) * Number(item.quantity || 0))), 0)
    ), 0);
    const averageAddOnValue = ordersWithAddOns.length > 0 ? addOnGmv / ordersWithAddOns.length : 0;
    const averageAddOnUnitPrice = weightedAverageAddOnUnitPrice(
      paidOrders.flatMap((order) => (order.items || []).filter((item) => item.type !== "ticket"))
    );
    const opportunity = estimateAddOnAttachmentOpportunity({
      paidCount: paidOrders.length,
      addOnOrders: ordersWithAddOns.length,
      averageAddOnValue,
      takeRate: economicMetrics.takeRate,
    });

    return {
      ordersWithAddOns: ordersWithAddOns.length,
      attachmentRate: paidOrders.length > 0 ? (ordersWithAddOns.length / paidOrders.length) * 100 : 0,
      addOnGmv,
      averageAddOnValue,
      averageAddOnUnitPrice,
      estimatedPlatformRevenue: addOnGmv * (economicMetrics.takeRate / 100),
      estimatedNetPlatformRevenue: addOnGmv * (economicMetrics.takeRate / 100) * economicMetrics.contributionRatio,
      incrementalNetRevenue: opportunity.incrementalPlatformRevenue * economicMetrics.contributionRatio,
      ...opportunity,
    };
  }, [economicMetrics.contributionRatio, economicMetrics.takeRate, orders]);

  const eventEconomics = useMemo(() => {
    const grouped = new Map();
    const benchmarkAddOnValue = addOnEconomics.averageAddOnValue;
    const benchmarkAddOnUnitPrice = addOnEconomics.averageAddOnUnitPrice;

    orders.filter((order) => order.status === "paid").forEach((order) => {
      const editableId = order.event?.id || order.event_id || null;
      const eventId = String(editableId || order.event?.title || "evento");
      const current = grouped.get(eventId) || {
        id: eventId,
        editableId,
        title: order.event?.title || "Evento",
        paidCount: 0,
        gmv: 0,
        platformRevenue: 0,
        producerNet: 0,
        processorFeesBorneByPlatform: 0,
        addOnOrders: 0,
        addOnGmv: 0,
        addOnUnits: 0,
        addOnUnitRevenue: 0,
      };

      const orderAddOnGmv = (order.items || [])
        .filter((item) => item.type !== "ticket")
        .reduce((sum, item) => sum + Number(item.subtotal || (Number(item.unit_price || 0) * Number(item.quantity || 0))), 0);

      current.paidCount += 1;
      current.gmv += Number(order.total || 0);
      current.platformRevenue += Number(order.platform_fee || 0);
      current.producerNet += Number(order.producer_net || 0);
      current.processorFeesBorneByPlatform += processorFeesBorneByPlatformForOrder({ processorFee: order.processor_fee, settlementMode: order.metadata?.settlement_mode });
      const orderAddOnItems = (order.items || []).filter((item) => item.type !== "ticket");
      current.addOnOrders += orderAddOnGmv > 0 ? 1 : 0;
      current.addOnGmv += orderAddOnGmv;
      current.addOnUnits += orderAddOnItems.reduce((sum, item) => sum + Math.max(0, Number(item.quantity || 0)), 0);
      current.addOnUnitRevenue += orderAddOnItems.reduce((sum, item) => sum + (Math.max(0, Number(item.unit_price || 0)) * Math.max(0, Number(item.quantity || 0))), 0);
      grouped.set(eventId, current);
    });

    return Array.from(grouped.values())
      .map((event) => {
        const takeRate = event.gmv > 0 ? (event.platformRevenue / event.gmv) * 100 : 0;
        const averageAddOnValue = event.addOnOrders > 0 ? event.addOnGmv / event.addOnOrders : 0;
        const averageAddOnUnitPrice = event.addOnUnits > 0 ? event.addOnUnitRevenue / event.addOnUnits : 0;
        const opportunity = estimateAddOnAttachmentOpportunity({
          paidCount: event.paidCount,
          addOnOrders: event.addOnOrders,
          averageAddOnValue,
          benchmarkAddOnValue,
          takeRate,
        });
        const netEconomics = estimateNetRevenueEconomics({
          grossRevenue: event.gmv,
          platformRevenue: event.platformRevenue,
          processorFees: event.processorFeesBorneByPlatform,
          processorFeesBorneByPlatform: event.processorFeesBorneByPlatform,
          paidOrders: event.paidCount,
        });
        const incrementalNetRevenue = Math.max(0, opportunity.incrementalPlatformRevenue * netEconomics.contributionRatio);

        return {
          ...event,
          averageTicket: event.paidCount > 0 ? event.gmv / event.paidCount : 0,
          platformRevenuePerSale: event.paidCount > 0 ? event.platformRevenue / event.paidCount : 0,
          takeRate,
          netPlatformRevenue: netEconomics.netRevenue,
          netTakeRate: netEconomics.netTakeRate,
          contributionMargin: netEconomics.contributionRatio * 100,
          incrementalNetRevenue,
          producerShare: event.gmv > 0 ? (event.producerNet / event.gmv) * 100 : 0,
          addOnAttachmentRate: event.paidCount > 0 ? (event.addOnOrders / event.paidCount) * 100 : 0,
          averageAddOnValue,
          averageAddOnUnitPrice,
          suggestedAddOnPrice: Number((averageAddOnUnitPrice > 0 ? averageAddOnUnitPrice : benchmarkAddOnUnitPrice).toFixed(2)),
          suggestedAddOnStock: suggestedAddOnStock(opportunity.incrementalOrders),
          suggestedAddOnSource: averageAddOnUnitPrice > 0 ? "event" : (benchmarkAddOnUnitPrice > 0 ? "production" : ""),
          estimatedAddOnPlatformRevenue: event.gmv > 0 ? event.addOnGmv * (event.platformRevenue / event.gmv) : 0,
          ...opportunity,
        };
      })
      .sort((a, b) => b.incrementalNetRevenue - a.incrementalNetRevenue || b.netPlatformRevenue - a.netPlatformRevenue)
      .slice(0, 5);
  }, [addOnEconomics.averageAddOnUnitPrice, addOnEconomics.averageAddOnValue, orders]);

  const clearFilters = () => setFilters({ q: "", status: "" });

  return <>
    <NavlogComponent />
    <Container className="cut-commerce-history py-4 py-lg-5">
      <div className="cut-commerce-heading"><div><span className="cut-commerce-kicker">Produtor</span><h1>Vendas</h1><p>Controle pedidos, pagamentos, taxas e recibos da sua produção.</p></div><Button as={Link} to="/producer/finance" variant="outline-light">Financeiro</Button></div>
      {error && <Alert variant="danger">{error}</Alert>}
      {!loading && !productions.length && <Alert variant="info">Você ainda não possui uma produção para acompanhar vendas.</Alert>}
      {!!productions.length && <Card className="cut-commerce-card mb-3"><Card.Body>
        <CollapsibleFilterPanel title="Pesquisar e filtrar vendas" activeCount={activeFilterCount} defaultOpen={activeFilterCount > 0}>
          <Row className="g-3 align-items-end">
            <Col md={5}><Form.Label>Produção</Form.Label><Form.Select value={productionId} onChange={(e) => setProductionId(e.target.value)}>{productions.map((production) => <option key={production.id} value={production.id}>{production.name}</option>)}</Form.Select></Col>
            <Col md={4}><Form.Label>Buscar</Form.Label><Form.Control value={filters.q} onChange={(e) => setFilters((current) => ({ ...current, q: e.target.value }))} placeholder="Pedido, nome ou e-mail" /></Col>
            <Col md={3}><Form.Label>Status</Form.Label><Form.Select value={filters.status} onChange={(e) => setFilters((current) => ({ ...current, status: e.target.value }))}><option value="">Todos</option><option value="paid">Pagos</option><option value="pending">Pendentes</option><option value="cancelled">Cancelados</option><option value="refunded">Reembolsados</option><option value="charged_back">Contestados</option></Form.Select></Col>
          </Row>
          {activeFilterCount > 0 && <div className="d-flex justify-content-end"><Button type="button" variant="outline-light" size="sm" onClick={clearFilters}>Limpar filtros</Button></div>}
        </CollapsibleFilterPanel>
      </Card.Body></Card>}

      {productionId && <>
        <Row className="g-3 mb-3">
          <Col sm={6} lg={4} xl={3}><div className="cut-commerce-stat"><small>Vendas pagas</small><strong>{summary.paid_count || 0}</strong></div></Col>
          <Col sm={6} lg={4} xl={3}><div className="cut-commerce-stat"><small>GMV pago</small><strong>{money(summary.gross_paid)}</strong></div></Col>
          <Col sm={6} lg={4} xl={3}><div className="cut-commerce-stat"><small>Ticket médio</small><strong>{money(economicMetrics.averageTicket)}</strong></div></Col>
          <Col sm={6} lg={4} xl={3}><div className="cut-commerce-stat"><small>Receita Cutinapp</small><strong>{money(summary.platform_fees)}</strong><span>taxas brutas registradas</span></div></Col>
          <Col sm={6} lg={4} xl={3}><div className="cut-commerce-stat"><small>Receita líquida Peter Tecnet</small><strong>{money(economicMetrics.netPlatformRevenue)}</strong><span>após processamento suportado pela plataforma nos pedidos carregados</span></div></Col>
          <Col sm={6} lg={4} xl={3}><div className="cut-commerce-stat"><small>Receita líquida / venda</small><strong>{money(economicMetrics.netRevenuePerSale)}</strong><span>margem de contribuição {percent(economicMetrics.contributionMargin)}</span></div></Col>
          <Col sm={6} lg={4} xl={3}><div className="cut-commerce-stat"><small>Take rate líquido</small><strong>{percent(economicMetrics.netTakeRate)}</strong><span>take rate bruto {percent(economicMetrics.takeRate)}</span></div></Col>
          <Col sm={6} lg={4} xl={3}><div className="cut-commerce-stat"><small>Processamento Peter Tecnet</small><strong>{money(economicMetrics.processorFeesBorneByPlatform)}</strong><span>somente custo suportado pela plataforma</span></div></Col>
          <Col sm={6} lg={4} xl={3}><div className="cut-commerce-stat"><small>Líquido do produtor</small><strong>{money(summary.organization_net ?? summary.producer_net)}</strong></div></Col>
          <Col sm={6} lg={4} xl={3}><div className="cut-commerce-stat"><small>GMV de adicionais</small><strong>{money(addOnEconomics.addOnGmv)}</strong></div></Col>
          <Col sm={6} lg={4} xl={3}><div className="cut-commerce-stat"><small>Vendas com adicional</small><strong>{percent(addOnEconomics.attachmentRate)}</strong></div></Col>
          <Col sm={6} lg={4} xl={3}><div className="cut-commerce-stat"><small>Adicional médio</small><strong>{money(addOnEconomics.averageAddOnValue)}</strong></div></Col>
          <Col sm={6} lg={4} xl={3}><div className="cut-commerce-stat"><small>Receita líquida estimada em adicionais</small><strong>{money(addOnEconomics.estimatedNetPlatformRevenue)}</strong><span>{money(addOnEconomics.estimatedPlatformRevenue)} antes do processamento suportado</span></div></Col>
          <Col sm={6} lg={4} xl={3}><div className="cut-commerce-stat"><small>Oportunidade +10 p.p. em adicionais</small><strong>+{money(addOnEconomics.incrementalNetRevenue)} receita líquida</strong><span>+{money(addOnEconomics.incrementalGmv)} GMV · +{money(addOnEconomics.incrementalPlatformRevenue)} receita bruta estimada</span></div></Col>
          <Col sm={6} lg={4} xl={3}><div className="cut-commerce-stat"><small>GMV pendente recuperável</small><strong>{money(pendingRevenue.pendingGmv)}</strong><span>{pendingRevenue.pendingCount} pedido(s) aguardando pagamento</span></div></Col>
          <Col sm={6} lg={4} xl={3}><div className="cut-commerce-stat"><small>Receita líquida recuperável</small><strong>{money(pendingRevenue.estimatedNetPlatformRevenue)}</strong><span>{money(pendingRevenue.estimatedPlatformRevenue)} de receita bruta potencial · margem observada {percent(pendingRevenue.contributionRatio * 100)}</span></div></Col>
        </Row>
        <Alert variant="info" className="mb-3">
          O GMV considera as vendas pagas. A receita Cutinapp corresponde às taxas brutas registradas; receita líquida, receita líquida por venda e take rate líquido descontam somente o processamento que a Peter Tecnet efetivamente suporta nos pedidos carregados, respeitando o settlement registrado. Os indicadores de adicionais consideram itens não classificados como ingresso e agora priorizam a contribuição líquida estimada, não apenas receita bruta. A oportunidade de +10 p.p. simula somente mais vendas aderindo a adicionais pelo valor médio já observado e pela margem de contribuição após processamento. As pendências mostram receita potencial já iniciada no checkout; usam a taxa registrada no pedido quando disponível e, como fallback analítico, o take rate efetivo da produção. A receita líquida recuperável aplica a margem de contribuição observada nas vendas pagas para priorizar recuperação por valor econômico, sem presumir novos preços ou taxas. Nenhuma projeção altera preços, taxas ou regras de pagamento e nenhuma delas representa garantia de receita.
        </Alert>
        {!!pendingRevenue.events.length && <Card className="cut-commerce-card mb-3">
          <Card.Body>
            <div className="cut-commerce-order-top mb-3">
              <div>
                <small>Receita em recuperação</small>
                <h2>Eventos com mais receita líquida aguardando pagamento</h2>
                <p>Prioriza pedidos ainda válidos pela contribuição líquida estimada, usando a margem já observada na produção. É uma leitura econômica para orientar recuperação de checkout; não cria cobrança, desconto ou contato automático.</p>
              </div>
            </div>
            <Row className="g-3">
              {pendingRevenue.events.slice(0, 5).map((event, index) => <Col lg={6} key={event.id}>
                <div className="cut-commerce-stat h-100">
                  <small>#{index + 1} · {event.title}</small>
                  <strong>{money(event.estimatedNetPlatformRevenue)} receita líquida potencial</strong>
                  <span>{money(event.pendingGmv)} GMV · {event.pendingCount} pedido(s) aguardando pagamento</span>
                  <span>{money(event.estimatedPlatformRevenue)} de receita bruta Cutinapp potencial associada</span>
                </div>
              </Col>)}
            </Row>
          </Card.Body>
        </Card>}
        {!!eventEconomics.length && <Card className="cut-commerce-card mb-3">
          <Card.Body>
            <div className="cut-commerce-order-top mb-3">
              <div>
                <small>Monetização por evento</small>
                <h2>Onde há mais receita líquida incremental disponível</h2>
                <p>Os eventos são priorizados pela receita líquida incremental estimada após o custo de processamento já observado, simulando +10 pontos percentuais de adesão aos adicionais. Assim, o ranking favorece crescimento que também preserva margem.</p>
              </div>
            </div>
            <Row className="g-3">
              {eventEconomics.map((event, index) => <Col lg={6} key={event.id}>
                <div className="cut-commerce-stat h-100">
                  <small>#{index + 1} · {event.title}</small>
                  <strong>+{money(event.incrementalNetRevenue)} receita líquida estimada</strong>
                  <span>Oportunidade: +{money(event.incrementalGmv)} GMV · +{money(event.incrementalPlatformRevenue)} receita bruta Cutinapp com até {event.incrementalOrders.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} venda(s) adicional(is) aderindo ao cross-sell</span>
                  <span>Atual: {money(event.netPlatformRevenue)} receita líquida · {money(event.platformRevenue)} receita bruta · {money(event.processorFeesBorneByPlatform)} processamento suportado pela Cutinapp</span>
                  <span>Take rate líquido {percent(event.netTakeRate)} · Margem de contribuição {percent(event.contributionMargin)} · {money(event.gmv)} GMV · {event.paidCount} venda(s)</span>
                  <span>Receita Cutinapp / venda {money(event.platformRevenuePerSale)} · Take rate bruto {percent(event.takeRate)}</span>
                  <span>Ticket médio {money(event.averageTicket)} · Líquido do produtor {money(event.producerNet)}</span>
                  <span>Adicionais: {money(event.addOnGmv)} GMV · {percent(event.addOnAttachmentRate)} das vendas · médio {money(event.averageAddOnValue)}</span>
                  {event.editableId && event.incrementalGmv > 0 && <Button as={Link} to={`/event/edit/${event.editableId}${event.suggestedAddOnPrice > 0 ? `?addonSuggested=${encodeURIComponent(event.suggestedAddOnPrice.toFixed(2))}&addonStock=${encodeURIComponent(String(event.suggestedAddOnStock || ""))}&addonSource=${event.suggestedAddOnSource}` : ""}`} variant="outline-light" size="sm" className="mt-2 align-self-start">{event.addOnOrders > 0 ? "Otimizar adicionais" : "Ativar adicionais"}</Button>}
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