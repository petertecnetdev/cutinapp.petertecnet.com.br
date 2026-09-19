/* eslint-disable react/prop-types */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Row, Table } from "react-bootstrap";
import { useLocation, useNavigate } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import commerceService from "../../services/CommerceService";
import cutinappService from "../../services/CutinappService";
import { estimateNetRevenueEconomics } from "../../utils/netRevenueEconomics";
import { evaluateRecoveryRolloutReadiness } from "../../utils/recoveryRolloutReadiness";

const money = (value) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
const percent = (value) => `${Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`;
const paymentMethodLabel = {
  pix: "Pix",
  card: "Cartão",
  credit_card: "Cartão",
  debit_card: "Débito",
  unknown: "Não identificado",
};
const recoverySurfaceLabel = {
  feed: "Feed",
  event: "Página do evento",
  discovery: "Descoberta",
  navbar_popover: "Atalho da navegação",
  notifications_page: "Central de notificações",
  unknown: "Origem não identificada",
};
const recoveryDecisionMeta = {
  winner: { label: "Vencedor", bg: "success" },
  harmful: { label: "Prejudicial", bg: "danger" },
  inconclusive: { label: "Inconclusivo", bg: "secondary" },
};
const recoveryDecisionReason = {
  sample_immature: "A amostra ainda não atingiu maturidade.",
  paid_conversion_uncertainty: "O efeito observado na conversão ainda pode ser explicado por variação estatística.",
  paid_conversion_guardrail_failed_with_95_confidence: "Há evidência de 95% de que o destaque reduz a conversão paga.",
  platform_contribution_guardrail_failed: "O destaque reduz a contribuição líquida por pedido exposto.",
  conversion_preserved_with_95_confidence_and_contribution_improved: "A conversão foi preservada com 95% de confiança e a contribuição líquida aumentou.",
  no_positive_net_contribution_lift: "A conversão foi preservada, mas ainda não houve ganho líquido positivo.",
};
const checkoutRemediationMeta = {
  improve_event_purchase_intent: {
    title: "Aumentar intenção de compra no evento",
    detail: "Reforce proposta de valor, preço e disponibilidade do ingresso na página do evento, mantendo informação verdadeira e sem pressão artificial.",
  },
  reduce_ticket_selection_friction: {
    title: "Reduzir atrito na escolha do ingresso",
    detail: "Deixe lote, preço, disponibilidade e avanço para o checkout claros e rápidos, sem esconder taxas nem comprometer integridade de estoque.",
  },
  reduce_payment_entry_friction: {
    title: "Reduzir atrito antes do pagamento",
    detail: "Simplifique a revisão do pedido, mantenha total e método visíveis e deixe a ação de pagamento imediata, sem esconder taxas ou alterar o carrinho.",
  },
  improve_payment_approval: {
    title: "Aumentar aprovação do pagamento",
    detail: "Priorize falhas por Pix/cartão, mensagens claras e retomada segura. Preserve idempotência e nunca repita uma cobrança automaticamente.",
  },
  protect_post_payment_fulfillment: {
    title: "Garantir ingresso após pagamento aprovado",
    detail: "Trate pagamento aprovado sem emissão como prioridade operacional e reprocesse fulfillment de forma idempotente, preservando QR e check-in.",
  },
};

function StatusLine({ ok, title, detail }) {
  return <div className="d-flex align-items-start gap-3 py-2">
    <Badge bg={ok ? "success" : "secondary"} className="mt-1">{ok ? "OK" : "Pendente"}</Badge>
    <div><strong>{title}</strong>{detail && <div className="text-secondary small">{detail}</div>}</div>
  </div>;
}

function RevenueMetric({ label, value, detail }) {
  return <div className="cut-ticket-option h-100"><div><span className="cut-ticket-kicker">{label}</span><strong>{value}</strong>{detail && <small className="text-secondary d-block mt-1">{detail}</small>}</div></div>;
}

export default function ProductionFinancePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const focus = params.get("focus") || "";
  const [productions, setProductions] = useState([]);
  const [productionId, setProductionId] = useState(params.get("production") || "");
  const [paymentAccount, setPaymentAccount] = useState(null);
  const [summary, setSummary] = useState(null);
  const [revenueFunnel, setRevenueFunnel] = useState(null);
  const [revenueDays, setRevenueDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadFinance = useCallback(async (id) => {
    const [account, financial, funnel] = await Promise.all([
      commerceService.paymentAccount(id),
      commerceService.financialSummary(id),
      commerceService.revenueFunnel(id, revenueDays),
    ]);
    setPaymentAccount(account);
    setSummary(financial);
    setRevenueFunnel(funnel);
  }, [revenueDays]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    cutinappService.myProductions()
      .then((rows) => {
        if (!active) return;
        setProductions(rows);
        if (!productionId && rows.length) setProductionId(String(rows[0].id));
      })
      .catch((err) => active && setError(err?.message || "Não foi possível carregar suas produções."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!productionId) return undefined;
    let active = true;
    setLoading(true); setError("");
    loadFinance(productionId)
      .catch((err) => active && setError(err?.message || "Não foi possível carregar os dados financeiros."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [productionId, loadFinance]);

  const production = productions.find((row) => String(row.id) === String(productionId));
  const merchantConnected = paymentAccount?.provider === "mercadopago" && paymentAccount?.status === "connected";

  useEffect(() => {
    if (params.get("payment_provider") !== "connected") return;
    setSuccess("Mercado Pago conectado. O split automático está ativo para esta produção.");
  }, [params]);

  useEffect(() => {
    if (focus !== "activation" || loading || !productionId) return undefined;
    const timer = window.setTimeout(() => {
      document.getElementById("producer-finance-activation")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 160);
    return () => window.clearTimeout(timer);
  }, [focus, loading, productionId]);

  const grossRevenue = Number(revenueFunnel?.gross_revenue || 0);
  const platformRevenue = Number(revenueFunnel?.platform_revenue || 0);
  const processorFees = Number(revenueFunnel?.processor_fees || 0);
  const platformProcessorFees = Number(revenueFunnel?.processor_fees_borne_by_platform ?? processorFees);
  const organizationProcessorFees = Number(revenueFunnel?.processor_fees_borne_by_organization || 0);
  const platformNetAfterProcessing = Number(revenueFunnel?.platform_contribution_after_processing ?? (platformRevenue - platformProcessorFees));
  const effectiveTakeRate = grossRevenue > 0 ? (platformRevenue / grossRevenue) * 100 : 0;
  const recoveryAttempts = Number(revenueFunnel?.checkout_recovery_attempts || 0);
  const recoveredGmv = Number(revenueFunnel?.recovered_gross_revenue || 0);
  const recoveredPlatformRevenue = Number(revenueFunnel?.recovered_platform_revenue || 0);
  const recoveryConversionRate = Number(revenueFunnel?.checkout_recovery_conversion_rate || 0);
  const recoveredGmvShare = grossRevenue > 0 ? (recoveredGmv / grossRevenue) * 100 : 0;
  const recoveredGmvPerAttempt = recoveryAttempts > 0 ? recoveredGmv / recoveryAttempts : 0;
  const recoveredPlatformRevenuePerAttempt = recoveryAttempts > 0 ? recoveredPlatformRevenue / recoveryAttempts : 0;
  const pixRecoveryEconomics = revenueFunnel?.pix_initialization_recovery_economics || {};
  const pixRecoveryObservedOrders = Number(pixRecoveryEconomics.orders_observed || 0);
  const pixRecoveryResumedOrders = Number(pixRecoveryEconomics.resumed_orders || 0);
  const pixRecoveryPaidOrders = Number(pixRecoveryEconomics.paid_after_resume_orders || 0);
  const pixRecoveryGmv = Number(pixRecoveryEconomics.recovered_gmv || 0);
  const pixRecoveryPlatformRevenue = Number(pixRecoveryEconomics.recovered_platform_revenue || 0);
  const pixRecoveryPlatformContribution = Number(pixRecoveryEconomics.recovered_platform_contribution || 0);
  const pixRecoveryBySource = Array.isArray(pixRecoveryEconomics.by_source) ? pixRecoveryEconomics.by_source : [];
  const recoverySurfaces = useMemo(() => {
    const rows = Array.isArray(revenueFunnel?.checkout_recovery_surface_economics)
      ? revenueFunnel.checkout_recovery_surface_economics
      : [];
    return [...rows].sort((left, right) => {
      if (Boolean(left.sample_is_mature) !== Boolean(right.sample_is_mature)) return left.sample_is_mature ? -1 : 1;
      return Number(right.observed_platform_contribution_per_impression || 0) - Number(left.observed_platform_contribution_per_impression || 0);
    });
  }, [revenueFunnel?.checkout_recovery_surface_economics]);
  const recoveryExperiment = revenueFunnel?.checkout_recovery_prominence_experiment || {};
  const recoveryExperimentVariants = Array.isArray(recoveryExperiment.variants) ? recoveryExperiment.variants : [];
  const recoveryExperimentComparison = recoveryExperiment.comparison || {};
  const recoveryControl = recoveryExperimentVariants.find((row) => row.variant === "control");
  const recoveryProminent = recoveryExperimentVariants.find((row) => row.variant === "prominent");
  const recoveryExperimentMature = Boolean(recoveryExperimentComparison.sample_is_mature);
  const recoveryIncrementalContribution = recoveryExperimentMature
    ? Number(recoveryExperimentComparison.incremental_platform_contribution_per_exposed_order || 0)
    : null;
  const recoveryIncrementalPaidRate = recoveryExperimentMature
    ? Number(recoveryExperimentComparison.incremental_paid_orders_per_100_exposed_orders || 0)
    : null;
  const recoveryDecision = recoveryExperimentComparison.decision || {};
  const recoveryDecisionStatus = recoveryDecision.status || "inconclusive";
  const recoveryDecisionUi = recoveryDecisionMeta[recoveryDecisionStatus] || recoveryDecisionMeta.inconclusive;
  const recoveryConfidence = recoveryExperimentComparison.paid_conversion_difference_confidence_95 || null;
  const recoveryObservedProjection = recoveryExperimentMature ? recoveryExperimentComparison.observed_volume_projection : null;
  const recoveryTreatmentEstimate = recoveryExperimentMature
    ? recoveryExperimentComparison.treatment_observed_incremental_estimate
    : null;
  const recoveryRolloutReadiness = evaluateRecoveryRolloutReadiness({ comparison: recoveryExperimentComparison });
  const checkoutJourneyFunnel = revenueFunnel?.checkout_journey_funnel || {};
  const checkoutJourneyStages = checkoutJourneyFunnel.stages || {};
  const checkoutJourneyConversion = checkoutJourneyFunnel.conversion || {};
  const checkoutJourneyDropoff = checkoutJourneyFunnel.dropoff || {};
  const checkoutJourneyGmv = checkoutJourneyFunnel.gmv || {};
  const checkoutLargestDropoff = checkoutJourneyDropoff.largest_step || null;
  const checkoutLargestEconomicDropoff = checkoutJourneyDropoff.largest_economic_step || null;
  const checkoutLargestContributionDropoff = checkoutJourneyDropoff.largest_contribution_step || null;
  const checkoutRecommendedAction = checkoutLargestContributionDropoff?.recommended_action || checkoutLargestEconomicDropoff?.recommended_action || null;
  const checkoutRecommendedActionUi = checkoutRemediationMeta[checkoutRecommendedAction?.code] || null;
  const checkoutContributionEstimate = checkoutJourneyFunnel.platform_contribution_estimate || {};
  const checkoutPeriodComparison = checkoutJourneyFunnel.period_comparison || {};
  const checkoutPeriodConversion = checkoutPeriodComparison.conversion || {};
  const checkoutPeriodRisk = checkoutPeriodComparison.platform_contribution_risk || {};
  const checkoutActionEffectiveness = checkoutPeriodComparison.recommended_action_effectiveness || null;
  const checkoutActionEffectivenessUi = checkoutRemediationMeta[checkoutActionEffectiveness?.action_code] || null;
  const checkoutJourneyMethods = Array.isArray(checkoutJourneyFunnel.by_payment_method) ? checkoutJourneyFunnel.by_payment_method : [];
  const checkoutIntentSurfaces = Array.isArray(checkoutJourneyFunnel.by_intent_surface) ? checkoutJourneyFunnel.by_intent_surface : [];
  const checkoutIntentSurfaceLabel = {
    summary: "Resumo do evento",
    production_card: "Card da produção",
    mobile_fixed: "CTA fixo mobile",
    unknown: "Origem não identificada",
  };
  const checkoutStepLabel = {
    event_detail_viewed: "Evento visualizado",
    ticket_intent_clicked: "Intenção de comprar",
    checkout_opened: "Checkout aberto",
    payment_attempted: "Tentativa de pagamento",
    payment_approved: "Pagamento aprovado",
    checkout_fulfilled: "Ingresso emitido",
  };
  const netEconomics = useMemo(() => estimateNetRevenueEconomics({
    grossRevenue,
    platformRevenue,
    processorFees,
    processorFeesBorneByPlatform: platformProcessorFees,
    platformContributionAfterProcessing: revenueFunnel?.platform_contribution_after_processing,
    paidOrders: Number(revenueFunnel?.orders_paid || 0),
    platformRevenueAtRisk: Number(revenueFunnel?.platform_revenue_at_risk || 0),
    recoveredPlatformRevenue: Number(revenueFunnel?.recovered_platform_revenue || 0),
    recoveredPlatformContributionAfterProcessing: revenueFunnel?.recovered_platform_contribution_after_processing,
  }), [grossRevenue, platformRevenue, processorFees, platformProcessorFees, revenueFunnel?.platform_contribution_after_processing, revenueFunnel?.orders_paid, revenueFunnel?.platform_revenue_at_risk, revenueFunnel?.recovered_platform_revenue, revenueFunnel?.recovered_platform_contribution_after_processing]);

  const connectMercadoPago = async () => {
    if (!productionId) return;
    setWorking(true); setError(""); setSuccess("");
    try {
      const response = await commerceService.connectMercadoPago(productionId);
      const authorizationUrl = String(response?.authorization_url || "").trim();
      if (!authorizationUrl) throw new Error("O Mercado Pago não retornou a autorização.");
      window.location.assign(authorizationUrl);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Não foi possível iniciar a conexão com o Mercado Pago.");
      setWorking(false);
    }
  };

  return <div className="cut-app-page">
    <NavlogComponent />
    {(loading || working) && <ProcessingIndicatorComponent label={working ? "Abrindo o Mercado Pago" : "Atualizando financeiro"} />}
    <Container className="cut-page-container py-4 py-lg-5">
      <div className="cut-page-heading">
        <div>
          <span className="cut-eyebrow">Área do produtor</span>
          <h1>Recebimentos via Pix</h1>
          <p>Cadastre uma chave Pix de qualquer banco. A Cutinapp valida sua identidade e a titularidade antes de liberar os repasses.</p>
        </div>
        <Button variant="outline-light" onClick={() => navigate("/production/mine")}>Minhas produções</Button>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}
      {focus === "activation" && productionId && <Alert variant="info" className="mb-4"><strong>Ative as vendas pagas.</strong> Autorize a conta Mercado Pago da produção. Depois disso, os pagamentos serão divididos automaticamente, sem repasse manual da Cutinapp.</Alert>}

      <Card className="cut-production-card mb-4"><Card.Body className="p-4">
        <Form.Group><Form.Label>Produção</Form.Label><Form.Select value={productionId} onChange={(event) => setProductionId(event.target.value)}><option value="">Selecione</option>{productions.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</Form.Select></Form.Group>
      </Card.Body></Card>

      {productionId && <>
        <Row className="g-4">
          <Col lg={5}><Card id="producer-finance-activation" className="cut-production-card h-100"><Card.Body className="p-4">
            <span className="cut-eyebrow">Mercado Pago Marketplace</span>
            <h2 className="mt-2 mb-3">{merchantConnected ? "Split automático ativo" : "Conecte a conta da produção"}</h2>
            <p className="text-secondary">
              {merchantConnected
                ? "A conta está autorizada. O pagamento do comprador é processado na conta do produtor e a comissão da Cutinapp é separada automaticamente."
                : "A Cutinapp não ficará com o saldo do produtor. Para vender ingressos pagos, autorize a conta Mercado Pago que receberá as vendas."}
            </p>
            <StatusLine ok={merchantConnected} title="Conta Mercado Pago" detail={merchantConnected ? "Autorização ativa para esta produção." : "Obrigatória apenas para vendas pagas."} />
            <StatusLine ok={merchantConnected} title="Repasse automático" detail={merchantConnected ? "Não existe solicitação de saque ou Pix manual pela Cutinapp." : "Será ativado junto com a conexão."} />
            <StatusLine ok={merchantConnected} title="Comissão Cutinapp" detail={merchantConnected ? "Separada automaticamente no pagamento por application_fee." : "Aplicada somente quando houver uma venda paga."} />
            <Button className="mt-3" onClick={connectMercadoPago} disabled={working}>
              {merchantConnected ? "Reconectar Mercado Pago" : "Conectar Mercado Pago"}
            </Button>
          </Card.Body></Card></Col>

          <Col lg={7}><Card className="cut-production-card h-100"><Card.Body className="p-4">
            <span className="cut-eyebrow">Resumo financeiro</span><h2 className="mt-2 mb-4">{production?.name || "Produção"}</h2>
            <Row className="g-3">
              <Col sm={6}><RevenueMetric label="Volume bruto" value={money(summary?.gross_sales)} /></Col>
              <Col sm={6}><RevenueMetric label="Receita do produtor" value={money(summary?.organization_earned)} /></Col>
              <Col sm={6}><RevenueMetric label="Comissão Cutinapp" value={money(summary?.platform_fees)} /></Col>
              <Col sm={6}><RevenueMetric label="Processamento" value={money(summary?.processor_fees)} /></Col>
            </Row>
            <Alert variant={merchantConnected ? "success" : "warning"} className="mt-4 mb-0">
              {merchantConnected
                ? "Vendas pagas habilitadas com Mercado Pago e split automático. Não há repasse manual da Cutinapp para esta produção."
                : "Vendas gratuitas continuam disponíveis. Para cobrar ingressos, conecte o Mercado Pago da produção."}
            </Alert>
          </Card.Body></Card></Col>
        </Row>

        {revenueFunnel && <Card className="cut-production-card mt-4"><Card.Body className="p-4">
          <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4">
            <div>
              <span className="cut-eyebrow">Economia dos eventos</span>
              <h2 className="mt-2 mb-1">GMV, conversão e receita por venda</h2>
              <p className="text-secondary mb-0">Valores calculados pela API central a partir dos pedidos reais. Nenhuma taxa é adicionada nesta tela.</p>
            </div>
            <Form.Select aria-label="Período do funil de receita" value={revenueDays} onChange={(event) => setRevenueDays(Number(event.target.value))} style={{ width: 180 }}>
              <option value={7}>Últimos 7 dias</option>
              <option value={30}>Últimos 30 dias</option>
              <option value={90}>Últimos 90 dias</option>
              <option value={365}>Últimos 12 meses</option>
            </Form.Select>
          </div>

          <Row className="g-3">
            <Col md={4} xl={3}><RevenueMetric label="GMV pago" value={money(grossRevenue)} detail={`${revenueFunnel.orders_paid || 0} pedidos pagos`} /></Col>
            <Col md={4} xl={3}><RevenueMetric label="Ticket médio" value={money(revenueFunnel.average_paid_order)} detail="Por pedido pago" /></Col>
            <Col md={4} xl={3}><RevenueMetric label="Conversão checkout" value={percent(revenueFunnel.checkout_conversion_rate)} detail={`${revenueFunnel.orders_created || 0} checkouts criados`} /></Col>
            <Col md={4} xl={3}><RevenueMetric label="Abandono" value={percent(revenueFunnel.abandonment_rate)} detail={money(revenueFunnel.gross_revenue_lost_to_abandonment) + " de GMV perdido"} /></Col>
            <Col md={4} xl={3}><RevenueMetric label="Tentativas de recuperação" value={recoveryAttempts.toLocaleString("pt-BR")} detail="Checkouts retomados no período" /></Col>
            <Col md={4} xl={3}><RevenueMetric label="Conversão da recuperação" value={percent(recoveryConversionRate)} detail="Retomadas que viraram pagamento" /></Col>
            <Col md={4} xl={3}><RevenueMetric label="GMV recuperado" value={money(recoveredGmv)} detail={`${percent(recoveredGmvShare)} do GMV pago do período`} /></Col>
            <Col md={4} xl={3}><RevenueMetric label="GMV por tentativa recuperada" value={money(recoveredGmvPerAttempt)} detail="Valor recuperado por tentativa de retomada" /></Col>
            <Col md={4} xl={3}><RevenueMetric label="Receita plataforma / tentativa" value={money(recoveredPlatformRevenuePerAttempt)} detail="Retorno bruto médio de cada tentativa de recuperação" /></Col>
            <Col md={4} xl={3}><RevenueMetric label="Receita líquida recuperada" value={money(netEconomics.estimatedRecoveredNetRevenue)} detail={`${money(recoveredPlatformRevenue)} de receita bruta da plataforma`} /></Col>
            <Col md={4} xl={3}><RevenueMetric label="Receita plataforma" value={money(platformRevenue)} detail={`Take rate efetivo ${percent(effectiveTakeRate)}`} /></Col>
            <Col md={4} xl={3}><RevenueMetric label="Processamento total" value={money(processorFees)} detail={`Peter Tecnet suporta ${money(platformProcessorFees)} • produtor ${money(organizationProcessorFees)}`} /></Col>
            <Col md={4} xl={3}><RevenueMetric label="Receita líquida Peter Tecnet" value={money(platformNetAfterProcessing)} detail={`Margem sobre GMV ${percent(revenueFunnel.platform_contribution_margin ?? netEconomics.netTakeRate)}`} /></Col>
            <Col md={4} xl={3}><RevenueMetric label="Take rate líquido" value={percent(netEconomics.netTakeRate)} detail={`Processamento suportado pela plataforma consome ${percent(netEconomics.processingShareOfPlatformRevenue)} da receita`} /></Col>
            <Col md={4} xl={3}><RevenueMetric label="Receita líquida / venda" value={money(netEconomics.netRevenuePerPaidOrder)} detail="Após custo de processamento registrado" /></Col>
            <Col md={4} xl={3}><RevenueMetric label="Líquido do produtor" value={money(revenueFunnel.producer_net)} detail={`Descontos: ${money(revenueFunnel.discounts)}`} /></Col>
          </Row>

          {Number(revenueFunnel.gross_revenue_at_risk || 0) > 0 && <Alert variant="warning" className="mt-4 mb-0">
            Há <strong>{money(revenueFunnel.gross_revenue_at_risk)}</strong> em pedidos ainda pendentes, equivalentes a <strong>{money(revenueFunnel.platform_revenue_at_risk)}</strong> de receita de plataforma potencial e cerca de <strong>{money(netEconomics.estimatedNetRevenueAtRisk)}</strong> após processamento, usando a margem observada no período. Priorize recuperação de pagamento antes de aumentar desconto.
          </Alert>}

          {recoveryAttempts > 0 && <Alert variant="info" className="mt-3 mb-0">
            Recuperação de checkout converteu <strong>{percent(recoveryConversionRate)}</strong> das tentativas e recuperou <strong>{money(recoveredGmv)}</strong> em GMV / <strong>{money(recoveredPlatformRevenue)}</strong> em receita de plataforma. Cada tentativa recuperou em média <strong>{money(recoveredGmvPerAttempt)}</strong> de GMV e <strong>{money(recoveredPlatformRevenuePerAttempt)}</strong> de receita bruta da plataforma, equivalente a aproximadamente <strong>{money(netEconomics.estimatedRecoveredNetRevenue)}</strong> de receita líquida total após processamento pela margem observada.
          </Alert>}

          {pixRecoveryObservedOrders > 0 && <div className="mt-4">
            <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
              <div>
                <span className="cut-eyebrow">Recuperação PIX preservada</span>
                <h3 className="h5 mt-2 mb-1">Quanto a retomada técnica está protegendo</h3>
                <p className="text-secondary small mb-0">Atribuição observacional dos pedidos PIX preservados após falha de inicialização. Os valores mostram vendas associadas à retomada, não ganho causal garantido.</p>
              </div>
              <Badge bg="success">{pixRecoveryObservedOrders.toLocaleString("pt-BR")} pedidos observados</Badge>
            </div>
            <Row className="g-3">
              <Col md={6} xl={3}><RevenueMetric label="Pedidos retomados" value={pixRecoveryResumedOrders.toLocaleString("pt-BR")} detail={`${pixRecoveryPaidOrders.toLocaleString("pt-BR")} pagos após retomada`} /></Col>
              <Col md={6} xl={3}><RevenueMetric label="Retomada → pagamento" value={pixRecoveryEconomics.resume_to_paid_percent == null ? "—" : percent(pixRecoveryEconomics.resume_to_paid_percent)} detail="Conversão dos pedidos efetivamente retomados" /></Col>
              <Col md={6} xl={3}><RevenueMetric label="GMV após retomada PIX" value={money(pixRecoveryGmv)} detail={`${money(pixRecoveryPlatformRevenue)} de receita da plataforma`} /></Col>
              <Col md={6} xl={3}><RevenueMetric label="Contribuição após retomada" value={money(pixRecoveryPlatformContribution)} detail={pixRecoveryEconomics.observed_platform_take_rate_percent == null ? "Take rate sem amostra" : `Take rate observado ${percent(pixRecoveryEconomics.observed_platform_take_rate_percent)}`} /></Col>
            </Row>
            {(Number(pixRecoveryEconomics.retryable_failed_orders || 0) > 0 || Number(pixRecoveryEconomics.terminal_failed_orders || 0) > 0) && <Alert variant="secondary" className="mt-3 mb-0">
              A recuperação registrou <strong>{Number(pixRecoveryEconomics.retryable_failed_orders || 0).toLocaleString("pt-BR")}</strong> falhas ainda recuperáveis e <strong>{Number(pixRecoveryEconomics.terminal_failed_orders || 0).toLocaleString("pt-BR")}</strong> falhas terminais. Falhas terminais são liberadas para um novo checkout válido em vez de prender o comprador a um pedido expirado.
            </Alert>}
            {pixRecoveryBySource.length > 0 && <Table responsive hover className="align-middle mt-3 mb-0">
              <thead><tr><th>Origem da retomada</th><th>Retomados</th><th>Pagos</th><th>Conversão</th><th>GMV observado</th><th>Contribuição</th></tr></thead>
              <tbody>{pixRecoveryBySource.map((row) => <tr key={row.source}>
                <td><strong>{row.source === "session" ? "Após reabertura" : row.source === "checkout" ? "No checkout" : row.source || "Não identificada"}</strong></td>
                <td>{Number(row.resumed_orders || 0).toLocaleString("pt-BR")}</td>
                <td>{Number(row.paid_after_resume_orders || 0).toLocaleString("pt-BR")}</td>
                <td>{row.resume_to_paid_percent == null ? "—" : percent(row.resume_to_paid_percent)}</td>
                <td>{money(row.recovered_gmv)}</td>
                <td>{money(row.recovered_platform_contribution)}</td>
              </tr>)}</tbody>
            </Table>}
          </div>}

          {Number(checkoutJourneyFunnel.journeys || 0) > 0 && <div className="mt-4">
            <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
              <div>
                <span className="cut-eyebrow">Funil real de conversão</span>
                <h3 className="h5 mt-2 mb-1">Onde compradores e GMV estão sendo perdidos</h3>
                <p className="text-secondary small mb-0">Jornadas anônimas correlacionadas pela API central desde a página do evento, passando pela intenção de compra, checkout, pagamento aprovado e emissão do ingresso.</p>
              </div>
              <Badge bg="info">{Number(checkoutJourneyFunnel.journeys || 0).toLocaleString("pt-BR")} jornadas</Badge>
            </div>
            <Row className="g-3">
              <Col md={6} xl={3}><RevenueMetric label="Evento → intenção" value={checkoutJourneyConversion.viewed_to_intent_percent == null ? "—" : percent(checkoutJourneyConversion.viewed_to_intent_percent)} detail={`${Number(checkoutJourneyStages.ticket_intent || 0).toLocaleString("pt-BR")} intenções de compra`} /></Col>
              <Col md={6} xl={3}><RevenueMetric label="Intenção → checkout" value={checkoutJourneyConversion.intent_to_opened_percent == null ? "—" : percent(checkoutJourneyConversion.intent_to_opened_percent)} detail={`${Number(checkoutJourneyStages.opened || 0).toLocaleString("pt-BR")} checkouts abertos`} /></Col>
              <Col md={6} xl={3}><RevenueMetric label="Evento → pagamento" value={checkoutJourneyConversion.viewed_to_approved_percent == null ? "—" : percent(checkoutJourneyConversion.viewed_to_approved_percent)} detail={`${Number(checkoutJourneyStages.event_viewed || 0).toLocaleString("pt-BR")} visualizações observadas`} /></Col>
              <Col md={6} xl={3}><RevenueMetric label="Checkout → tentativa" value={checkoutJourneyConversion.opened_to_attempted_percent == null ? "—" : percent(checkoutJourneyConversion.opened_to_attempted_percent)} detail={`${Number(checkoutJourneyStages.payment_attempted || 0).toLocaleString("pt-BR")} tentativas`} /></Col>
              <Col md={6} xl={3}><RevenueMetric label="Checkout → aprovado" value={checkoutJourneyConversion.opened_to_approved_percent == null ? "—" : percent(checkoutJourneyConversion.opened_to_approved_percent)} detail={`${Number(checkoutJourneyStages.payment_approved || 0).toLocaleString("pt-BR")} pagamentos`} /></Col>
              <Col md={6} xl={3}><RevenueMetric label="Aprovado → ingresso" value={checkoutJourneyConversion.approved_to_fulfilled_percent == null ? "—" : percent(checkoutJourneyConversion.approved_to_fulfilled_percent)} detail={`${Number(checkoutJourneyStages.fulfilled || 0).toLocaleString("pt-BR")} emissões`} /></Col>
              <Col md={6} xl={3}><RevenueMetric label="GMV explicitamente abandonado" value={money(checkoutJourneyGmv.explicit_abandoned_at_risk)} detail={`${Number(checkoutJourneyDropoff.explicit_abandoned_journeys || 0).toLocaleString("pt-BR")} jornadas abandonadas`} /></Col>
            </Row>
            {checkoutLargestContributionDropoff && Number(checkoutLargestContributionDropoff.platform_contribution_at_risk || 0) > 0 ? <Alert variant="danger" className="mt-3 mb-0">
              <strong>Maior oportunidade de margem:</strong> entre <strong>{checkoutStepLabel[checkoutLargestContributionDropoff.from] || checkoutLargestContributionDropoff.from}</strong> e <strong>{checkoutStepLabel[checkoutLargestContributionDropoff.to] || checkoutLargestContributionDropoff.to}</strong> há aproximadamente <strong>{money(checkoutLargestContributionDropoff.platform_contribution_at_risk)}</strong> de contribuição líquida potencial em risco, considerando a margem observada dos pedidos pagos{checkoutContributionEstimate.fallback_margin_percent == null ? "" : ` (${percent(checkoutContributionEstimate.fallback_margin_percent)} de referência)`}. São <strong>{Number(checkoutLargestContributionDropoff.dropoff_journeys || 0).toLocaleString("pt-BR")}</strong> jornadas que não avançaram. Priorize esta etapa antes de aumentar descontos ou tráfego.
            </Alert> : checkoutLargestEconomicDropoff && Number(checkoutLargestEconomicDropoff.gmv_at_risk || 0) > 0 && <Alert variant="danger" className="mt-3 mb-0">
              <strong>Maior oportunidade econômica:</strong> entre <strong>{checkoutStepLabel[checkoutLargestEconomicDropoff.from] || checkoutLargestEconomicDropoff.from}</strong> e <strong>{checkoutStepLabel[checkoutLargestEconomicDropoff.to] || checkoutLargestEconomicDropoff.to}</strong> existem aproximadamente <strong>{money(checkoutLargestEconomicDropoff.gmv_at_risk)}</strong> de GMV em risco, associados a <strong>{Number(checkoutLargestEconomicDropoff.dropoff_journeys || 0).toLocaleString("pt-BR")}</strong> jornadas que não avançaram ({checkoutLargestEconomicDropoff.dropoff_percent == null ? "—" : percent(checkoutLargestEconomicDropoff.dropoff_percent)}). A margem líquida ainda não possui histórico pago suficiente para substituir o ranking por GMV.
            </Alert>}
            {checkoutRecommendedActionUi && <Alert variant="info" className="mt-3 mb-0">
              <strong>Ação recomendada agora: {checkoutRecommendedActionUi.title}.</strong> {checkoutRecommendedActionUi.detail}
              {checkoutRecommendedAction?.target_metric && <span className="d-block mt-1 small">Métrica-alvo: <code>{checkoutRecommendedAction.target_metric}</code>.</span>}
            </Alert>}
            {checkoutPeriodComparison.status && <Alert variant={checkoutPeriodComparison.status === "improving" ? "success" : checkoutPeriodComparison.status === "regressing" ? "warning" : "secondary"} className="mt-3 mb-0">
              <strong>Resultado vs período anterior:</strong>{" "}
              {checkoutPeriodComparison.sample_is_comparable
                ? checkoutPeriodComparison.status === "improving"
                  ? "o funil está melhorando com amostra comparável."
                  : checkoutPeriodComparison.status === "regressing"
                    ? "o funil piorou e merece revisão antes de ampliar tráfego ou desconto."
                    : "os sinais estão mistos; continue medindo antes de atribuir ganho à intervenção."
                : `ainda em coleta. São necessárias pelo menos ${Number(checkoutPeriodComparison.minimum_opened_journeys_per_period || 20).toLocaleString("pt-BR")} jornadas abertas em cada período para classificar tendência.`}
              <span className="d-block mt-1 small">
                Conversão checkout → aprovado: {checkoutPeriodConversion.opened_to_approved_delta_percentage_points == null ? "—" : `${Number(checkoutPeriodConversion.opened_to_approved_delta_percentage_points) >= 0 ? "+" : ""}${Number(checkoutPeriodConversion.opened_to_approved_delta_percentage_points).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} p.p.`}
                {checkoutPeriodRisk.largest_step_amount_delta == null ? "" : ` • variação da contribuição em risco: ${money(checkoutPeriodRisk.largest_step_amount_delta)}`}
              </span>
            </Alert>}
            {checkoutActionEffectiveness && <Alert variant={checkoutActionEffectiveness.status === "improving" ? "success" : checkoutActionEffectiveness.status === "regressing" ? "danger" : checkoutActionEffectiveness.status === "mixed" ? "warning" : "secondary"} className="mt-3 mb-0">
              <strong>Eficácia da ação recomendada{checkoutActionEffectivenessUi?.title ? ` — ${checkoutActionEffectivenessUi.title}` : ""}:</strong>{" "}
              {checkoutActionEffectiveness.status === "improving"
                ? "a mesma etapa melhorou versus o período anterior."
                : checkoutActionEffectiveness.status === "regressing"
                  ? "a mesma etapa piorou; revise a intervenção antes de ampliar tráfego ou incentivos."
                  : checkoutActionEffectiveness.status === "mixed"
                    ? "há sinais mistos; mantenha a medição antes de atribuir ganho ou perda à intervenção."
                    : "ainda em coleta; não há amostra comparável suficiente para avaliar a ação."}
              <span className="d-block mt-1 small">
                {checkoutStepLabel[checkoutActionEffectiveness.step?.from] || checkoutActionEffectiveness.step?.from || "Etapa"} → {checkoutStepLabel[checkoutActionEffectiveness.step?.to] || checkoutActionEffectiveness.step?.to || "próxima etapa"}
                {checkoutActionEffectiveness.target_metric_previous_percent == null || checkoutActionEffectiveness.target_metric_current_percent == null
                  ? ""
                  : ` • conversão: ${percent(checkoutActionEffectiveness.target_metric_previous_percent)} → ${percent(checkoutActionEffectiveness.target_metric_current_percent)}`}
                {checkoutActionEffectiveness.target_metric_delta_percentage_points == null
                  ? ""
                  : ` (${Number(checkoutActionEffectiveness.target_metric_delta_percentage_points) >= 0 ? "+" : ""}${Number(checkoutActionEffectiveness.target_metric_delta_percentage_points).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} p.p.)`}
              </span>
              {(checkoutActionEffectiveness.platform_contribution_at_risk_previous_same_step != null || checkoutActionEffectiveness.platform_contribution_at_risk_current != null) && <span className="d-block mt-1 small">
                Contribuição em risco na mesma etapa: {checkoutActionEffectiveness.platform_contribution_at_risk_previous_same_step == null ? "—" : money(checkoutActionEffectiveness.platform_contribution_at_risk_previous_same_step)} → {checkoutActionEffectiveness.platform_contribution_at_risk_current == null ? "—" : money(checkoutActionEffectiveness.platform_contribution_at_risk_current)}
                {checkoutActionEffectiveness.platform_contribution_at_risk_delta == null ? "" : ` • variação: ${money(checkoutActionEffectiveness.platform_contribution_at_risk_delta)}`}
              </span>}
            </Alert>}
            {checkoutLargestEconomicDropoff && checkoutLargestContributionDropoff && Number(checkoutLargestEconomicDropoff.gmv_at_risk || 0) > 0 && <p className="text-secondary small mt-2 mb-0">
              Maior risco por GMV bruto: <strong>{checkoutStepLabel[checkoutLargestEconomicDropoff.from] || checkoutLargestEconomicDropoff.from}</strong> → <strong>{checkoutStepLabel[checkoutLargestEconomicDropoff.to] || checkoutLargestEconomicDropoff.to}</strong>, com <strong>{money(checkoutLargestEconomicDropoff.gmv_at_risk)}</strong>. O ranking principal usa contribuição líquida para evitar priorizar volume que deixa pouca margem.
            </p>}
            {checkoutLargestDropoff && Number(checkoutLargestDropoff.dropoff_journeys || 0) > 0 && <p className="text-secondary small mt-2 mb-0">
              Maior perda por volume: <strong>{checkoutStepLabel[checkoutLargestDropoff.from] || checkoutLargestDropoff.from}</strong> → <strong>{checkoutStepLabel[checkoutLargestDropoff.to] || checkoutLargestDropoff.to}</strong>, com <strong>{Number(checkoutLargestDropoff.dropoff_journeys || 0).toLocaleString("pt-BR")}</strong> jornadas e <strong>{money(checkoutLargestDropoff.gmv_at_risk)}</strong> de GMV em risco estimado.
            </p>}
            {checkoutIntentSurfaces.length > 0 && <div className="table-responsive mt-3"><Table hover className="align-middle mb-0"><thead><tr><th>CTA de compra</th><th>Intenções</th><th>Checkouts</th><th>Pagamentos</th><th>Intenção → checkout</th><th>Intenção → pagamento</th></tr></thead><tbody>{checkoutIntentSurfaces.map((row) => <tr key={row.surface}><td><strong>{checkoutIntentSurfaceLabel[row.surface] || row.surface}</strong></td><td>{Number(row.journeys || 0).toLocaleString("pt-BR")}</td><td>{Number(row.checkout_opened || 0).toLocaleString("pt-BR")}</td><td>{Number(row.payment_approved || 0).toLocaleString("pt-BR")}</td><td>{row.intent_to_checkout_percent == null ? "—" : percent(row.intent_to_checkout_percent)}</td><td>{row.intent_to_approved_percent == null ? "—" : percent(row.intent_to_approved_percent)}</td></tr>)}</tbody></Table></div>}
            {checkoutJourneyMethods.length > 0 && <div className="table-responsive mt-3"><Table variant="dark" hover className="align-middle mb-0"><thead><tr><th>Pagamento</th><th>Jornadas</th><th>Tentativas</th><th>Aprovados</th><th>Ingressos</th><th>Tentativa → aprovado</th></tr></thead><tbody>{checkoutJourneyMethods.map((row) => <tr key={row.payment_method}><td><strong>{paymentMethodLabel[row.payment_method] || row.payment_method}</strong></td><td>{Number(row.journeys || 0).toLocaleString("pt-BR")}</td><td>{Number(row.attempted || 0).toLocaleString("pt-BR")}</td><td>{Number(row.approved || 0).toLocaleString("pt-BR")}</td><td>{Number(row.fulfilled || 0).toLocaleString("pt-BR")}</td><td>{row.attempt_to_approved_rate_percent == null ? "—" : percent(row.attempt_to_approved_rate_percent)}</td></tr>)}</tbody></Table></div>}
          </div>}

          {recoverySurfaces.length > 0 && <div className="mt-4">
            <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
              <div>
                <span className="cut-eyebrow">Recuperação por origem</span>
                <h3 className="h5 mt-2 mb-1">Onde a recuperação realmente gera receita</h3>
                <p className="text-secondary small mb-0">Ranking econômico das superfícies que retomam checkouts, priorizado pela contribuição líquida por exibição após processamento. Amostras pequenas ficam sinalizadas e não devem orientar decisões isoladamente.</p>
              </div>
            </div>
            <div className="table-responsive"><Table variant="dark" hover className="align-middle mb-0"><thead><tr><th>Origem</th><th>Exibições</th><th>Cliques</th><th>Conversão</th><th>Pagos</th><th>GMV recuperado</th><th>Receita plataforma</th><th>Receita / exibição</th><th>Contribuição líquida</th><th>Líquido / exibição</th><th>Amostra</th></tr></thead><tbody>{recoverySurfaces.map((row) => <tr key={row.surface}><td><strong>{recoverySurfaceLabel[row.surface] || row.surface}</strong></td><td>{Number(row.impressions || 0).toLocaleString("pt-BR")}</td><td>{Number(row.cta_clicks || 0).toLocaleString("pt-BR")}</td><td>{row.click_to_paid_rate_percent == null ? "—" : percent(row.click_to_paid_rate_percent)}</td><td>{Number(row.paid_orders || 0).toLocaleString("pt-BR")}</td><td>{money(row.observed_gross_revenue)}</td><td>{money(row.observed_platform_revenue)}</td><td>{row.observed_platform_revenue_per_impression == null ? "—" : money(row.observed_platform_revenue_per_impression)}</td><td>{money(row.observed_platform_contribution)}</td><td>{row.observed_platform_contribution_per_impression == null ? "—" : money(row.observed_platform_contribution_per_impression)}</td><td><Badge bg={row.sample_is_mature ? "success" : "secondary"}>{row.sample_is_mature ? "Madura" : "Em coleta"}</Badge></td></tr>)}</tbody></Table></div>
            {recoverySurfaces.some((row) => !row.sample_is_mature) && <Alert variant="secondary" className="mt-3 mb-0">Superfícies marcadas como <strong>Em coleta</strong> ainda não atingiram a amostra mínima definida pela API central. Use esses números apenas como sinal inicial; priorize decisões comerciais quando a amostra estiver madura.</Alert>}
          </div>}

          {recoveryExperimentVariants.length > 0 && <div className="mt-4">
            <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
              <div>
                <span className="cut-eyebrow">Teste controlado de recuperação</span>
                <h3 className="h5 mt-2 mb-1">O destaque realmente aumenta pagamentos e margem?</h3>
                <p className="text-secondary small mb-0">A decisão vem da API central e combina maturidade, intervalo de confiança de 95% para conversão paga e contribuição líquida. Nenhum tratamento é promovido automaticamente.</p>
              </div>
              <Badge bg={recoveryDecisionUi.bg}>{recoveryDecisionUi.label}</Badge>
            </div>
            <Row className="g-3">
              <Col md={6} xl={3}><RevenueMetric label="Controle • pagamentos / 100" value={recoveryControl?.paid_orders_per_100_exposed_orders == null ? "—" : percent(recoveryControl.paid_orders_per_100_exposed_orders)} detail={`${Number(recoveryControl?.exposed_orders || 0).toLocaleString("pt-BR")} pedidos expostos`} /></Col>
              <Col md={6} xl={3}><RevenueMetric label="Destaque • pagamentos / 100" value={recoveryProminent?.paid_orders_per_100_exposed_orders == null ? "—" : percent(recoveryProminent.paid_orders_per_100_exposed_orders)} detail={`${Number(recoveryProminent?.exposed_orders || 0).toLocaleString("pt-BR")} pedidos expostos`} /></Col>
              <Col md={6} xl={3}><RevenueMetric label="Controle • margem / exposto" value={recoveryControl?.platform_contribution_per_exposed_order == null ? "—" : money(recoveryControl.platform_contribution_per_exposed_order)} detail="Contribuição líquida por pedido exposto" /></Col>
              <Col md={6} xl={3}><RevenueMetric label="Destaque • margem / exposto" value={recoveryProminent?.platform_contribution_per_exposed_order == null ? "—" : money(recoveryProminent.platform_contribution_per_exposed_order)} detail="Contribuição líquida por pedido exposto" /></Col>
              <Col md={6} xl={3}><RevenueMetric label="Efeito na conversão • IC 95%" value={recoveryConfidence ? `${recoveryConfidence.lower_paid_orders_per_100_exposed_orders >= 0 ? "+" : ""}${percent(recoveryConfidence.lower_paid_orders_per_100_exposed_orders)} a ${recoveryConfidence.upper_paid_orders_per_100_exposed_orders >= 0 ? "+" : ""}${percent(recoveryConfidence.upper_paid_orders_per_100_exposed_orders)}` : "—"} detail={recoveryConfidence?.excludes_zero ? "Faixa não cruza zero" : "Ainda compatível com ausência de efeito"} /></Col>
              {recoveryObservedProjection && <Col md={6} xl={3}><RevenueMetric label="Pagamentos incrementais projetados" value={`${Number(recoveryObservedProjection.projected_incremental_paid_orders || 0) >= 0 ? "+" : ""}${Number(recoveryObservedProjection.projected_incremental_paid_orders || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}`} detail={`No volume observado de ${Number(recoveryObservedProjection.observed_exposed_orders || 0).toLocaleString("pt-BR")} pedidos expostos`} /></Col>}
              {recoveryObservedProjection && recoveryObservedProjection.projected_incremental_gmv != null && <Col md={6} xl={3}><RevenueMetric label="GMV incremental projetado" value={`${Number(recoveryObservedProjection.projected_incremental_gmv || 0) >= 0 ? "+" : ""}${money(recoveryObservedProjection.projected_incremental_gmv)}`} detail="Valor bruto incremental estimado; não é receita realizada" /></Col>}
              {recoveryObservedProjection && <Col md={6} xl={3}><RevenueMetric label="Contribuição incremental projetada" value={`${Number(recoveryObservedProjection.projected_incremental_platform_contribution || 0) >= 0 ? "+" : ""}${money(recoveryObservedProjection.projected_incremental_platform_contribution)}`} detail="Projeção sobre o volume observado; não é receita realizada" /></Col>}
              {recoveryTreatmentEstimate && <Col md={6} xl={3}><RevenueMetric label="Pagamentos atribuídos ao destaque" value={`${Number(recoveryTreatmentEstimate.estimated_incremental_paid_orders || 0) >= 0 ? "+" : ""}${Number(recoveryTreatmentEstimate.estimated_incremental_paid_orders || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}`} detail={`Estimativa causal sobre ${Number(recoveryTreatmentEstimate.treatment_exposed_orders || 0).toLocaleString("pt-BR")} pedidos tratados`} /></Col>}
              {recoveryTreatmentEstimate && <Col md={6} xl={3}><RevenueMetric label="GMV atribuído ao destaque" value={`${Number(recoveryTreatmentEstimate.estimated_incremental_gmv || 0) >= 0 ? "+" : ""}${money(recoveryTreatmentEstimate.estimated_incremental_gmv)}`} detail="Estimativa atribuída ao grupo tratado; não é receita contabilizada" /></Col>}
              {recoveryTreatmentEstimate && <Col md={6} xl={3}><RevenueMetric label="Contribuição atribuída ao destaque" value={`${Number(recoveryTreatmentEstimate.estimated_incremental_platform_contribution || 0) >= 0 ? "+" : ""}${money(recoveryTreatmentEstimate.estimated_incremental_platform_contribution)}`} detail="Estimativa causal da contribuição incremental no grupo tratado" /></Col>}
            </Row>
            {!recoveryExperimentMature && <Alert variant="secondary" className="mt-3 mb-0">
              Experimento ainda <strong>em coleta</strong>. Faltam {Number(recoveryControl?.remaining_exposed_orders_to_maturity || 0).toLocaleString("pt-BR")} exposições no controle e {Number(recoveryProminent?.remaining_exposed_orders_to_maturity || 0).toLocaleString("pt-BR")} no destaque para a leitura mínima. Não altere a estratégia com base nesta amostra parcial.
            </Alert>}
            {recoveryExperimentMature && <Alert variant={recoveryDecisionStatus === "winner" ? "success" : recoveryDecisionStatus === "harmful" ? "danger" : "warning"} className="mt-3 mb-0">
              <strong>{recoveryDecisionUi.label}.</strong> {recoveryDecisionReason[recoveryDecision.reason] || "A API central ainda não encontrou evidência suficiente para mudar o padrão."} O efeito observado foi de <strong>{recoveryIncrementalPaidRate >= 0 ? "+" : ""}{percent(recoveryIncrementalPaidRate)}</strong> pagamentos por 100 pedidos expostos e <strong>{recoveryIncrementalContribution >= 0 ? "+" : ""}{money(recoveryIncrementalContribution)}</strong> de contribuição líquida por pedido exposto. {recoveryDecision.requires_manual_review ? "A mudança continua exigindo revisão humana antes de qualquer rollout." : ""}
            </Alert>}
            {recoveryObservedProjection && <Alert variant="info" className="mt-2 mb-0">
              <strong>Impacto econômico no volume observado:</strong> se o efeito incremental medido se mantivesse nos {Number(recoveryObservedProjection.observed_exposed_orders || 0).toLocaleString("pt-BR")} pedidos já expostos, a estimativa seria de <strong>{Number(recoveryObservedProjection.projected_incremental_paid_orders || 0) >= 0 ? "+" : ""}{Number(recoveryObservedProjection.projected_incremental_paid_orders || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} pagamentos</strong>{recoveryObservedProjection.projected_incremental_gmv != null ? <>, <strong>{Number(recoveryObservedProjection.projected_incremental_gmv || 0) >= 0 ? "+" : ""}{money(recoveryObservedProjection.projected_incremental_gmv)}</strong> de GMV</> : null} e <strong>{Number(recoveryObservedProjection.projected_incremental_platform_contribution || 0) >= 0 ? "+" : ""}{money(recoveryObservedProjection.projected_incremental_platform_contribution)}</strong> de contribuição líquida. É uma projeção diagnóstica, não receita realizada; o rollout continua dependente dos guardrails e de revisão humana.
            </Alert>}
            {recoveryTreatmentEstimate && <Alert variant="success" className="mt-2 mb-0">
              <strong>Impacto atribuído ao tratamento:</strong> considerando apenas os {Number(recoveryTreatmentEstimate.treatment_exposed_orders || 0).toLocaleString("pt-BR")} pedidos que realmente receberam o destaque, a diferença randomizada estima <strong>{Number(recoveryTreatmentEstimate.estimated_incremental_paid_orders || 0) >= 0 ? "+" : ""}{Number(recoveryTreatmentEstimate.estimated_incremental_paid_orders || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} pagamentos</strong>, <strong>{Number(recoveryTreatmentEstimate.estimated_incremental_gmv || 0) >= 0 ? "+" : ""}{money(recoveryTreatmentEstimate.estimated_incremental_gmv)}</strong> de GMV e <strong>{Number(recoveryTreatmentEstimate.estimated_incremental_platform_contribution || 0) >= 0 ? "+" : ""}{money(recoveryTreatmentEstimate.estimated_incremental_platform_contribution)}</strong> de contribuição incremental atribuível ao tratamento. É uma estimativa causal do experimento, não receita contabilizada.
            </Alert>}
            <Card className="mt-3 border-0 bg-dark-subtle">
              <Card.Body>
                <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
                  <div>
                    <span className="cut-ticket-kicker">Decisão de rollout</span>
                    <h3 className="h5 mb-1">Prontidão econômica e de conversão</h3>
                  </div>
                  <Badge bg={recoveryRolloutReadiness.status === "ready_for_review" || recoveryRolloutReadiness.status === "ready" ? "success" : recoveryRolloutReadiness.status === "blocked" ? "danger" : recoveryRolloutReadiness.status === "hold" ? "warning" : "secondary"}>
                    {recoveryRolloutReadiness.status === "ready_for_review" ? "Pronto para revisão" : recoveryRolloutReadiness.status === "ready" ? "Pronto" : recoveryRolloutReadiness.status === "blocked" ? "Rollout bloqueado" : recoveryRolloutReadiness.status === "hold" ? "Manter controle" : "Coletando dados"}
                  </Badge>
                </div>
                <StatusLine ok={recoveryRolloutReadiness.mature} title="Amostra madura" detail="O rollout só é avaliado depois do volume mínimo definido pela API central." />
                <StatusLine ok={recoveryRolloutReadiness.guardrails.conversion} title="Conversão protegida" detail="O intervalo de confiança precisa sustentar que a variante não reduz pagamentos." />
                <StatusLine ok={recoveryRolloutReadiness.guardrails.contribution} title="Contribuição líquida positiva" detail="A variante precisa melhorar a contribuição por pedido exposto, não apenas o GMV bruto." />
                <StatusLine ok={recoveryRolloutReadiness.eligible} title="Elegível para rollout" detail="A elegibilidade vem da decisão genérica da API e nunca ignora os guardrails financeiros." />
                <Alert variant={recoveryRolloutReadiness.status === "blocked" ? "danger" : recoveryRolloutReadiness.status === "ready_for_review" || recoveryRolloutReadiness.status === "ready" ? "success" : "secondary"} className="mt-2 mb-0">
                  <strong>Ação agora:</strong> {recoveryRolloutReadiness.recommendedAction === "review_rollout" ? "revisar humanamente a expansão do destaque antes de qualquer rollout." : recoveryRolloutReadiness.recommendedAction === "rollout_prominent" ? "a variante está apta para expansão segundo os guardrails atuais." : recoveryRolloutReadiness.recommendedAction === "keep_control" ? "manter o controle; não expandir a variante com a evidência atual." : "continuar coletando dados sem alterar a estratégia."} Nenhuma cobrança, preço ou taxa é alterada automaticamente.
                </Alert>
              </Card.Body>
            </Card>
          </div>}

          {(revenueFunnel.payment_methods || []).length > 0 && <div className="table-responsive mt-4"><Table variant="dark" hover className="align-middle mb-0"><thead><tr><th>Pagamento</th><th>Checkouts</th><th>Pagos</th><th>Conversão</th><th>GMV</th><th>Receita plataforma</th><th>Receita líquida</th><th>Margem/GMV</th><th>GMV em risco</th></tr></thead><tbody>{revenueFunnel.payment_methods.map((row) => <tr key={row.payment_method}><td>{paymentMethodLabel[row.payment_method] || row.payment_method}</td><td>{row.orders_created}</td><td>{row.orders_paid}</td><td>{percent(row.conversion_rate)}</td><td>{money(row.gross_revenue)}</td><td>{money(row.platform_revenue)}</td><td>{money(row.platform_contribution_after_processing ?? (Number(row.platform_revenue || 0) - Number((row.processor_fees_borne_by_platform ?? row.processor_fees) || 0)))}</td><td>{percent(row.platform_contribution_margin)}</td><td>{money(row.gross_at_risk)}</td></tr>)}</tbody></Table></div>}
        </Card.Body></Card>}

        {merchantConnected && <Alert variant="secondary" className="mt-4 mb-0">
          <strong>Recebimento direto ativo.</strong> O saldo das novas vendas pagas não fica disponível para saque na Cutinapp. Consulte a conta Mercado Pago conectada para disponibilidade, tarifas do provedor e movimentação financeira. Repasses antigos continuam preservados no histórico da API para auditoria.
        </Alert>}
      </>}
    </Container>
  </div>;
}
