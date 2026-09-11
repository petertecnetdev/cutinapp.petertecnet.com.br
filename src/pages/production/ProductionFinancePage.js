/* eslint-disable react/prop-types */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Row, Table } from "react-bootstrap";
import { ThemeProvider } from "@aws-amplify/ui-react";
import { FaceLivenessDetectorCore } from "@aws-amplify/ui-react-liveness";
import "@aws-amplify/ui-react/styles.css";
import { useLocation, useNavigate } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import commerceService from "../../services/CommerceService";
import cutinappService from "../../services/CutinappService";
import financeService from "../../services/FinanceService";
import { estimateNetRevenueEconomics } from "../../utils/netRevenueEconomics";
import { evaluateRecoveryRolloutReadiness } from "../../utils/recoveryRolloutReadiness";

const money = (value) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
const percent = (value) => `${Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`;
const dateTime = (value) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
const payoutStatus = {
  pending: { label: "Solicitado", bg: "warning" },
  processing: { label: "Enviando Pix", bg: "info" },
  provider_unknown: { label: "Em conciliação", bg: "warning" },
  paid: { label: "Pago", bg: "success" },
  failed: { label: "Falhou", bg: "danger" },
  cancelled: { label: "Cancelado", bg: "secondary" },
};
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
  const [productions, setProductions] = useState([]);
  const [productionId, setProductionId] = useState(params.get("production") || "");
  const [finance, setFinance] = useState(null);
  const [summary, setSummary] = useState(null);
  const [revenueFunnel, setRevenueFunnel] = useState(null);
  const [revenueDays, setRevenueDays] = useState(30);
  const [identityForm, setIdentityForm] = useState({ legal_name: "", document_number: "", birthdate: "" });
  const [frontDocument, setFrontDocument] = useState(null);
  const [backDocument, setBackDocument] = useState(null);
  const [pixType, setPixType] = useState("CPF");
  const [pixKey, setPixKey] = useState("");
  const [payoutAmount, setPayoutAmount] = useState("");
  const [liveness, setLiveness] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadFinance = useCallback(async (id) => {
    const [financeOverview, financial, funnel] = await Promise.all([
      financeService.overview(id),
      commerceService.financialSummary(id),
      commerceService.revenueFunnel(id, revenueDays),
    ]);
    setFinance(financeOverview);
    setSummary(financial);
    setRevenueFunnel(funnel);
    setPayoutAmount(String(financeOverview?.balance?.available || ""));

    const identity = financeOverview?.identity;
    const prefill = identity?.profile_prefill || {};
    const beneficiary = identity?.beneficiary || {};
    setIdentityForm((current) => ({
      legal_name: beneficiary.legal_name || prefill.legal_name || current.legal_name || "",
      document_number: current.document_number || "",
      birthdate: beneficiary.birthdate || prefill.birthdate || current.birthdate || "",
    }));
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
    setLoading(true); setError(""); setSuccess(""); setLiveness(null);
    loadFinance(productionId)
      .catch((err) => active && setError(err?.message || "Não foi possível carregar os recebimentos."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [productionId, loadFinance]);

  const production = productions.find((row) => String(row.id) === String(productionId));
  const identity = finance?.identity;
  const beneficiary = identity?.beneficiary;
  const verification = identity?.verification;
  const destination = finance?.destination;
  const balance = finance?.balance || {};
  const identityVerified = beneficiary?.status === "verified";
  const documentUploaded = Boolean(verification?.document_front_uploaded);
  const livenessVerified = verification?.liveness_status === "passed" && verification?.face_match_status === "passed";
  const pixVerified = Boolean(destination?.verified_at && ["active", "cooling"].includes(destination?.status));
  const available = Number(balance.available || 0);
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
  const checkoutStepLabel = {
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

  const run = async (task, successMessage) => {
    setWorking(true); setError(""); setSuccess("");
    try {
      const result = await task();
      setSuccess(result?.message || successMessage || "Atualização concluída.");
      await loadFinance(productionId);
      return result;
    } catch (err) {
      const validation = err?.response?.data?.errors;
      const firstValidation = validation && Object.values(validation).flat()[0];
      setError(firstValidation || err?.response?.data?.message || err?.message || "Não foi possível concluir esta etapa.");
      return null;
    } finally {
      setWorking(false);
    }
  };

  const saveIdentity = () => run(
    () => financeService.saveIdentity(productionId, {
      legal_name: identityForm.legal_name || undefined,
      document_type: "CPF",
      document_number: identityForm.document_number || undefined,
      birthdate: identityForm.birthdate || undefined,
    }),
    "Dados de identidade confirmados."
  );

  const uploadDocuments = () => {
    if (!frontDocument) { setError("Envie uma foto da frente do documento com foto."); return; }
    run(() => financeService.uploadDocument(productionId, frontDocument, backDocument), "Documento enviado.");
  };

  const startLiveness = async () => {
    setWorking(true); setError(""); setSuccess("");
    try {
      const session = await financeService.startLiveness(productionId);
      setLiveness(session);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Não foi possível iniciar a prova de vida.");
    } finally {
      setWorking(false);
    }
  };

  const finishLiveness = useCallback(async () => {
    if (!liveness?.session_id || !productionId) return;
    setWorking(true); setError("");
    try {
      const response = await financeService.completeLiveness(productionId, liveness.session_id);
      setLiveness(null);
      setSuccess(response?.message || "Identidade confirmada.");
      await loadFinance(productionId);
    } catch (err) {
      setLiveness(null);
      setError(err?.response?.data?.message || err?.message || "A prova de vida não foi aprovada. Tente novamente.");
      await loadFinance(productionId);
    } finally {
      setWorking(false);
    }
  }, [liveness, productionId, loadFinance]);

  const credentialProvider = useCallback(async () => {
    const credentials = liveness?.credentials || {};
    return {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
      expiration: credentials.expiration ? new Date(credentials.expiration) : undefined,
    };
  }, [liveness]);

  const savePix = () => {
    if (!pixKey.trim()) { setError("Informe a chave Pix que receberá os repasses."); return; }
    run(() => financeService.savePix(productionId, pixType, pixKey.trim()), "Chave Pix verificada.")
      .then((result) => result && setPixKey(""));
  };

  const requestPayout = () => {
    const amount = Number(String(payoutAmount).replace(",", "."));
    if (!amount || amount <= 0) { setError("Informe um valor válido para receber."); return; }
    run(() => financeService.requestPayout(productionId, amount), "Repasse Pix iniciado.");
  };

  return <div className="cut-app-page">
    <NavlogComponent />
    {(loading || working) && <ProcessingIndicatorComponent label={working ? "Protegendo sua operação" : "Atualizando recebimentos"} />}
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

      <Card className="cut-production-card mb-4"><Card.Body className="p-4">
        <Form.Group><Form.Label>Produção</Form.Label><Form.Select value={productionId} onChange={(event) => setProductionId(event.target.value)}><option value="">Selecione</option>{productions.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</Form.Select></Form.Group>
      </Card.Body></Card>

      {productionId && <>
        <Row className="g-4">
          <Col lg={5}><Card className="cut-production-card h-100"><Card.Body className="p-4">
            <span className="cut-eyebrow">Segurança financeira</span>
            <h2 className="mt-2 mb-3">Ativação do recebimento</h2>
            <p className="text-secondary">Isso é feito uma vez. Depois de aprovado, você usa apenas sua chave Pix para receber.</p>
            <StatusLine ok={Boolean(beneficiary)} title="Dados do titular" detail={beneficiary?.document_masked || "Usaremos os dados da sua conta."} />
            <StatusLine ok={documentUploaded} title="Documento com foto" detail={verification?.document_status === "face_confirmed" ? "Documento confirmado pela biometria facial." : "RG, CNH ou outro documento oficial com foto."} />
            <StatusLine ok={livenessVerified} title="Reconhecimento facial e prova de vida" detail={livenessVerified ? "Identidade facial confirmada." : "Evita uso de foto, vídeo ou identidade de terceiros."} />
            <StatusLine ok={pixVerified} title="Chave Pix" detail={destination ? `${destination.pix_key_masked} • ${destination.holder_name || "titular verificado"}` : "Pode ser de qualquer instituição participante do Pix."} />
            {destination?.status === "cooling" && <Alert variant="warning" className="mt-3 mb-0">A chave foi alterada recentemente. As vendas continuam ativas, mas novos repasses ficam protegidos até {dateTime(destination.cooling_until)}.</Alert>}
          </Card.Body></Card></Col>

          <Col lg={7}><Card className="cut-production-card h-100"><Card.Body className="p-4">
            <span className="cut-eyebrow">Resumo financeiro</span><h2 className="mt-2 mb-4">{production?.name || "Produção"}</h2>
            <Row className="g-3">
              <Col sm={6}><RevenueMetric label="Volume bruto" value={money(summary?.gross_sales)} /></Col>
              <Col sm={6}><RevenueMetric label="Crédito do produtor" value={money(balance.producer_credit)} /></Col>
              <Col sm={6}><RevenueMetric label="Aguardando liberação" value={money(balance.pending_release)} /></Col>
              <Col sm={6}><RevenueMetric label="Reserva de segurança" value={money(balance.security_reserve)} /></Col>
            </Row>
            <Alert variant={finance?.ready_for_sales ? "success" : "warning"} className="mt-4 mb-0">
              {finance?.ready_for_sales
                ? "Vendas pagas habilitadas. O comprador paga normalmente e seus valores ficam registrados para repasse na chave Pix verificada."
                : "Conclua a verificação abaixo e cadastre sua chave Pix para ativar vendas pagas."}
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

          {Number(checkoutJourneyFunnel.journeys || 0) > 0 && <div className="mt-4">
            <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
              <div>
                <span className="cut-eyebrow">Funil real de checkout</span>
                <h3 className="h5 mt-2 mb-1">Onde compradores e GMV estão sendo perdidos</h3>
                <p className="text-secondary small mb-0">Jornadas anônimas correlacionadas pela API central, do checkout aberto até pagamento aprovado e emissão do ingresso.</p>
              </div>
              <Badge bg="info">{Number(checkoutJourneyFunnel.journeys || 0).toLocaleString("pt-BR")} jornadas</Badge>
            </div>
            <Row className="g-3">
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

        {!identityVerified && <Card className="cut-production-card mt-4"><Card.Body className="p-4">
          <span className="cut-eyebrow">Etapa 1</span><h2 className="mt-2">Confirme quem receberá</h2>
          <p className="text-secondary">Se seus dados já estiverem completos na conta Peter, você só confirma. Não pedimos conta bancária.</p>
          <Row className="g-3">
            <Col md={5}><Form.Group><Form.Label>Nome completo</Form.Label><Form.Control value={identityForm.legal_name} onChange={(e) => setIdentityForm((v) => ({ ...v, legal_name: e.target.value }))} placeholder="Nome civil completo" /></Form.Group></Col>
            <Col md={3}><Form.Group><Form.Label>CPF</Form.Label><Form.Control value={identityForm.document_number} onChange={(e) => setIdentityForm((v) => ({ ...v, document_number: e.target.value }))} placeholder={identity?.profile_prefill?.has_document_number ? "CPF já salvo na conta" : "000.000.000-00"} /></Form.Group></Col>
            <Col md={4}><Form.Group><Form.Label>Data de nascimento</Form.Label><Form.Control type="date" value={identityForm.birthdate} onChange={(e) => setIdentityForm((v) => ({ ...v, birthdate: e.target.value }))} /></Form.Group></Col>
          </Row>
          <Button className="mt-3" onClick={saveIdentity} disabled={working}>Confirmar dados</Button>
        </Card.Body></Card>}

        {beneficiary && !documentUploaded && <Card className="cut-production-card mt-4"><Card.Body className="p-4">
          <span className="cut-eyebrow">Etapa 2</span><h2 className="mt-2">Documento com foto</h2>
          <p className="text-secondary">Envie fotos nítidas. Os arquivos ficam privados e são usados para a verificação de identidade.</p>
          <Row className="g-3"><Col md={6}><Form.Group><Form.Label>Frente do documento</Form.Label><Form.Control type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFrontDocument(e.target.files?.[0] || null)} /></Form.Group></Col><Col md={6}><Form.Group><Form.Label>Verso, se houver</Form.Label><Form.Control type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setBackDocument(e.target.files?.[0] || null)} /></Form.Group></Col></Row>
          <Form.Text className="d-block mt-3 text-secondary">Ao enviar, você autoriza o tratamento dos dados estritamente para verificação de identidade, prevenção a fraude e segurança dos recebimentos.</Form.Text>
          <Button className="mt-3" onClick={uploadDocuments} disabled={working || !frontDocument}>Enviar documento</Button>
        </Card.Body></Card>}

        {documentUploaded && !identityVerified && !liveness && <Card className="cut-production-card mt-4"><Card.Body className="p-4">
          <span className="cut-eyebrow">Etapa 3</span><h2 className="mt-2">Prova de vida</h2>
          <p className="text-secondary">A câmera fará uma verificação rápida de presença real e comparará o rosto com o documento enviado.</p>
          <Button onClick={startLiveness} disabled={working}>Iniciar reconhecimento facial</Button>
        </Card.Body></Card>}

        {liveness && <Card className="cut-production-card mt-4"><Card.Body className="p-4">
          <span className="cut-eyebrow">Verificação facial segura</span><h2 className="mt-2 mb-3">Siga as instruções da câmera</h2>
          <div style={{ maxWidth: 620, margin: "0 auto" }}>
            <ThemeProvider>
              <FaceLivenessDetectorCore
                sessionId={liveness.session_id}
                region={liveness.region}
                onAnalysisComplete={finishLiveness}
                onError={(livenessError) => {
                  setError(livenessError?.error?.message || "Não foi possível concluir a prova de vida.");
                  setLiveness(null);
                }}
                onUserCancel={() => setLiveness(null)}
                config={{ credentialProvider }}
              />
            </ThemeProvider>
          </div>
        </Card.Body></Card>}

        {identityVerified && <Card className="cut-production-card mt-4"><Card.Body className="p-4">
          <span className="cut-eyebrow">Etapa 4</span><h2 className="mt-2">Sua chave Pix</h2>
          {destination && <Alert variant={destination.status === "active" ? "success" : "warning"}>Destino atual: <strong>{destination.pix_key_masked}</strong> — {destination.holder_name}. A chave foi consultada e vinculada ao CPF verificado.</Alert>}
          <Row className="g-3 align-items-end">
            <Col md={3}><Form.Group><Form.Label>Tipo</Form.Label><Form.Select value={pixType} onChange={(e) => setPixType(e.target.value)}><option value="CPF">CPF</option><option value="CNPJ">CNPJ</option><option value="EMAIL">E-mail</option><option value="PHONE">Telefone</option><option value="EVP">Chave aleatória</option></Form.Select></Form.Group></Col>
            <Col md={6}><Form.Group><Form.Label>Chave Pix</Form.Label><Form.Control value={pixKey} onChange={(e) => setPixKey(e.target.value)} placeholder="Informe sua chave Pix" /></Form.Group></Col>
            <Col md={3}><Button className="w-100" onClick={savePix} disabled={working || !pixKey.trim()}>{destination ? "Alterar chave" : "Verificar chave"}</Button></Col>
          </Row>
          {destination && <Form.Text className="d-block mt-3 text-secondary">Trocas de chave recebem uma trava temporária de segurança para impedir que uma conta invadida desvie seus valores.</Form.Text>}
        </Card.Body></Card>}

        <Card className="cut-production-card mt-4"><Card.Body className="p-4">
          <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4"><div><span className="cut-eyebrow">Saldo</span><h2 className="mt-2 mb-1">Receber na sua chave Pix</h2><p className="text-secondary mb-0">Somente valores já liberados podem ser enviados. A reserva ajuda a cobrir cancelamentos, reembolsos e contestações.</p></div><Badge bg={finance?.ready_for_payout ? "success" : "warning"}>{finance?.ready_for_payout ? "Pix ativo" : "Aguardando ativação"}</Badge></div>
          <Row className="g-3 mb-4">
            <Col md={3}><RevenueMetric label="Crédito" value={money(balance.producer_credit)} /></Col>
            <Col md={3}><RevenueMetric label="Reserva" value={money(balance.security_reserve)} /></Col>
            <Col md={3}><RevenueMetric label="Em processamento" value={money(balance.payout_pending)} /></Col>
            <Col md={3}><RevenueMetric label="Disponível" value={money(available)} /></Col>
          </Row>

          {finance?.ready_for_payout && available > 0 && <div className="d-flex flex-column flex-md-row gap-2 align-items-md-end mb-4"><Form.Group className="flex-grow-1"><Form.Label>Valor a receber</Form.Label><Form.Control type="number" min="0.01" step="0.01" max={available} value={payoutAmount} onChange={(event) => setPayoutAmount(event.target.value)} /></Form.Group><Button onClick={requestPayout} disabled={working}>Receber via Pix</Button></div>}
          {!finance?.ready_for_payout && <Alert variant="secondary">Conclua a verificação e ative sua chave Pix para receber.</Alert>}
          {finance?.ready_for_payout && available <= 0 && <Alert variant="secondary">Ainda não há saldo liberado para repasse.</Alert>}

          {(finance?.payouts || []).length > 0 && <div className="table-responsive mt-4"><Table variant="dark" hover className="align-middle mb-0"><thead><tr><th>Referência</th><th>Solicitado em</th><th>Valor</th><th>Status</th></tr></thead><tbody>{finance.payouts.map((row) => { const status = payoutStatus[row.status] || { label: row.status, bg: "secondary" }; return <tr key={row.id}><td><small>{row.reference}</small></td><td>{dateTime(row.requested_at)}</td><td><strong>{money(row.amount)}</strong></td><td><Badge bg={status.bg}>{status.label}</Badge></td></tr>; })}</tbody></Table></div>}
        </Card.Body></Card>
      </>}
    </Container>
  </div>;
}
