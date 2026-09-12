import React, { useEffect, useState } from "react";
import { Alert, Badge, Card, Col, Container, Row, Spinner } from "react-bootstrap";
import NavlogComponent from "../../components/NavlogComponent";
import appApiClient from "../../services/AppApiClient";

const money = (value) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const percent = (value) => `${(Number(value || 0) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const multiplier = (value) => value == null ? "—" : `${Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}×`;
const duration = (seconds) => {
  if (seconds == null) return "—";
  const value = Math.max(0, Number(seconds) || 0);
  if (value < 60) return `${Math.round(value)}s`;
  if (value < 3600) return `${Math.round(value / 60)} min`;
  const hours = Math.floor(value / 3600);
  const minutes = Math.round((value % 3600) / 60);
  return minutes ? `${hours}h ${minutes}min` : `${hours}h`;
};

const riskMeta = {
  healthy: { label: "Saudável", variant: "success" },
  attention: { label: "Atenção", variant: "warning" },
  critical: { label: "Crítico", variant: "danger" },
};

const trendMeta = {
  normal: { label: "Dentro do padrão", variant: "success" },
  anomaly: { label: "Anomalia detectada", variant: "danger" },
  insufficient_history: { label: "Coletando histórico", variant: "secondary" },
  history_unavailable: { label: "Histórico indisponível", variant: "secondary" },
};

export default function ApplicationAdminFinancePage() {
  const [data, setData] = useState(null);
  const [paymentHealth, setPaymentHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    Promise.allSettled([
      appApiClient.get("/admin/finance"),
      appApiClient.get("/admin/finance/payment-health"),
    ]).then(([financeResult, healthResult]) => {
      if (!active) return;

      if (financeResult.status === "rejected") {
        const err = financeResult.reason;
        setError(err?.response?.data?.message || err?.message || "Não foi possível carregar o financeiro global.");
        return;
      }

      setData(financeResult.value.data?.data || null);
      if (healthResult.status === "fulfilled") {
        setPaymentHealth(healthResult.value.data?.data || null);
      }
    }).finally(() => active && setLoading(false));

    return () => { active = false; };
  }, []);

  const cards = [
    ["GMV", money(data?.gmv)],
    ["Volume pago", money(data?.paid_volume)],
    ["Pendente", money(data?.pending_volume)],
    ["Reembolsado/chargeback", money(data?.refunded_volume)],
    ["Pedidos", data?.orders_total ?? 0],
    ["Pedidos pagos", data?.orders_paid ?? 0],
  ];

  const healthCards = paymentHealth ? [
    ["Pendentes Commerce", `${paymentHealth.pending_orders ?? 0} · ${money(paymentHealth.pending_volume)}`],
    [`Atenção > ${paymentHealth.attention_after_minutes ?? 15} min`, `${paymentHealth.attention_orders ?? 0} · ${money(paymentHealth.attention_volume)}`],
    [`Críticos > ${paymentHealth.critical_after_minutes ?? 60} min`, `${paymentHealth.critical_orders ?? 0} · ${money(paymentHealth.critical_volume)}`],
    ["Expirados ainda pendentes", `${paymentHealth.expired_orders ?? 0} · ${money(paymentHealth.expired_volume)}`],
    ["Pendentes no provedor", `${paymentHealth.provider_pending_payments ?? 0} · ${money(paymentHealth.provider_pending_volume)}`],
    ["Volume em risco", money(paymentHealth.at_risk_volume)],
  ] : [];

  const currentRisk = riskMeta[paymentHealth?.risk_level] || riskMeta.healthy;
  const trend = paymentHealth?.trend;
  const incidents = paymentHealth?.incidents;
  const currentTrend = trendMeta[trend?.status] || trendMeta.history_unavailable;
  const trendReady = ["normal", "anomaly"].includes(trend?.status);

  return <div className="cut-app-page">
    <NavlogComponent />
    <Container className="cut-page-container py-4 py-lg-5">
      <div className="cut-page-heading align-items-start">
        <div><span className="cut-eyebrow">Cutinapp Owner · escopo global</span><h1>Financeiro da plataforma</h1><p>Visão consolidada da Cutinapp inteira. Nenhuma métrica depende da produção associada ao usuário logado.</p></div>
        <Badge bg="danger">GLOBAL</Badge>
      </div>
      {error && <Alert variant="danger">{error}</Alert>}
      {loading ? <div className="text-center py-5"><Spinner /><p className="mt-2">Consolidando o financeiro global...</p></div> : <Row className="g-3">
        {cards.map(([label, value]) => <Col xs={6} lg={4} key={label}><Card className="cut-panel h-100"><Card.Body><span className="cut-eyebrow">{label}</span><div className="fs-3 fw-bold mt-2">{value}</div></Card.Body></Card></Col>)}
      </Row>}

      {!loading && paymentHealth && <section className="mt-4" aria-labelledby="payment-health-title">
        <div className="cut-page-heading align-items-start mb-3">
          <div>
            <span className="cut-eyebrow">Checkout · monitoramento operacional</span>
            <h2 id="payment-health-title" className="h4 mb-1">Saúde dos pagamentos pendentes</h2>
            <p className="mb-0">Pedidos envelhecendo no estado pendente indicam receita em risco e prioridade de diagnóstico; não representam receita perdida confirmada.</p>
          </div>
          <div className="d-flex gap-2 flex-wrap justify-content-end">
            <Badge bg={currentRisk.variant}>{currentRisk.label}</Badge>
            {trend && <Badge bg={currentTrend.variant}>{currentTrend.label}</Badge>}
          </div>
        </div>
        {trend?.is_anomaly && <Alert variant="danger">
          <strong>Anomalia contra o baseline da própria Cutinapp.</strong> O comportamento atual do funil de pagamento fugiu do padrão recente. Investigue webhook, provedor, reconciliação e fulfillment antes que o desvio se transforme em perda de vendas.
        </Alert>}
        {paymentHealth.risk_level === "critical" && <Alert variant="danger">
          Risco crítico no funil de pagamento: {paymentHealth.critical_orders ?? 0} pedido(s) crítico(s), {money(paymentHealth.at_risk_volume)} em volume sob risco operacional. Priorize reconciliação, webhook e fulfillment.
        </Alert>}
        {paymentHealth.risk_level === "attention" && <Alert variant="warning">
          Há sinais de atenção no funil de pagamento. Existem pedidos ou pagamentos envelhecendo e que precisam ser acompanhados antes de virarem perda de conversão.
        </Alert>}
        <Row className="g-3">
          {healthCards.map(([label, value]) => <Col xs={12} sm={6} lg key={label}><Card className="cut-panel h-100"><Card.Body><span className="cut-eyebrow">{label}</span><div className="fs-5 fw-bold mt-2">{value}</div></Card.Body></Card></Col>)}
        </Row>

        {trend && <Card className="cut-panel mt-3">
          <Card.Body>
            <div className="d-flex justify-content-between gap-3 flex-wrap align-items-start mb-3">
              <div>
                <span className="cut-eyebrow">Agora × baseline</span>
                <h3 className="h5 mb-1">Tendência do risco de pagamento</h3>
                <p className="text-secondary mb-0">Comparação com as últimas {trend.window_hours ?? 24} horas, excluindo a hora mais recente para não contaminar a referência.</p>
              </div>
              <Badge bg={currentTrend.variant}>{currentTrend.label}</Badge>
            </div>
            {trendReady ? <Row className="g-3">
              <Col xs={12} md={4}>
                <div className="border rounded-3 p-3 h-100">
                  <span className="cut-eyebrow">Taxa crítica</span>
                  <div className="fs-5 fw-bold mt-2">{percent(paymentHealth.critical_rate)}</div>
                  <small className="text-secondary">Baseline {percent(trend.baseline_critical_rate)} · {multiplier(trend.critical_rate_multiplier)}</small>
                </div>
              </Col>
              <Col xs={12} md={4}>
                <div className="border rounded-3 p-3 h-100">
                  <span className="cut-eyebrow">Volume em risco</span>
                  <div className="fs-5 fw-bold mt-2">{money(paymentHealth.at_risk_volume)}</div>
                  <small className="text-secondary">Baseline {money(trend.baseline_at_risk_volume)} · {multiplier(trend.at_risk_volume_multiplier)}</small>
                </div>
              </Col>
              <Col xs={12} md={4}>
                <div className="border rounded-3 p-3 h-100">
                  <span className="cut-eyebrow">Backlog pendente</span>
                  <div className="fs-5 fw-bold mt-2">{paymentHealth.pending_orders ?? 0}</div>
                  <small className="text-secondary">Baseline {Number(trend.baseline_pending_orders || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} · {trend.samples ?? 0} amostras</small>
                </div>
              </Col>
            </Row> : <Alert variant="secondary" className="mb-0">
              {trend?.status === "insufficient_history"
                ? `O baseline ainda está sendo formado (${trend.samples ?? 0} amostras). A detecção automática será ativada quando houver histórico suficiente.`
                : "O histórico de pagamentos ainda não está disponível para comparação."}
            </Alert>}
          </Card.Body>
        </Card>}

        {incidents && <Card className="cut-panel mt-3">
          <Card.Body>
            <div className="d-flex justify-content-between gap-3 flex-wrap align-items-start mb-3">
              <div>
                <span className="cut-eyebrow">Incidentes · últimos {incidents.window_days ?? 30} dias</span>
                <h3 className="h5 mb-1">Confiabilidade do funil de pagamento</h3>
                <p className="text-secondary mb-0">MTTR, recorrência e pico de volume financeiro exposto após anomalias detectadas pelo baseline.</p>
              </div>
              {incidents.active && <Badge bg="danger">Incidente ativo</Badge>}
            </div>

            {incidents.active && <Alert variant="danger">
              Incidente ativo há <strong>{duration(incidents.active.duration_seconds)}</strong>, com pico de <strong>{money(incidents.active.peak_at_risk_volume)}</strong> em volume sob risco.
            </Alert>}

            <Row className="g-3">
              <Col xs={6} lg={3}><div className="border rounded-3 p-3 h-100"><span className="cut-eyebrow">Incidentes</span><div className="fs-5 fw-bold mt-2">{incidents.incidents ?? 0}</div></div></Col>
              <Col xs={6} lg={3}><div className="border rounded-3 p-3 h-100"><span className="cut-eyebrow">MTTR</span><div className="fs-5 fw-bold mt-2">{duration(incidents.average_duration_seconds)}</div></div></Col>
              <Col xs={6} lg={3}><div className="border rounded-3 p-3 h-100"><span className="cut-eyebrow">Maior duração</span><div className="fs-5 fw-bold mt-2">{duration(incidents.max_duration_seconds)}</div></div></Col>
              <Col xs={6} lg={3}><div className="border rounded-3 p-3 h-100"><span className="cut-eyebrow">Maior GMV exposto</span><div className="fs-5 fw-bold mt-2">{money(incidents.peak_at_risk_volume)}</div></div></Col>
            </Row>

            {(incidents.recent || []).length > 0 && <div className="mt-3">
              <span className="cut-eyebrow d-block mb-2">Últimos incidentes recuperados</span>
              <div className="d-grid gap-2">
                {incidents.recent.map((incident, index) => <div className="border rounded-3 p-3" key={`${incident.started_at || "incident"}-${index}`}>
                  <div className="d-flex justify-content-between gap-2 flex-wrap">
                    <strong>{incident.started_at ? new Date(incident.started_at).toLocaleString("pt-BR") : "Horário indisponível"}</strong>
                    <Badge bg="success">Recuperado em {duration(incident.duration_seconds)}</Badge>
                  </div>
                  <small className="text-secondary d-block mt-1">Pico {money(incident.peak_at_risk_volume)} · {incident.peak_critical_orders ?? 0} crítico(s) · fechamento em {money(incident.closing_at_risk_volume)}</small>
                </div>)}
              </div>
            </div>}
          </Card.Body>
        </Card>}

        {paymentHealth.oldest_pending_at && <small className="text-secondary d-block mt-3">Pendente mais antigo: {new Date(paymentHealth.oldest_pending_at).toLocaleString("pt-BR")}{paymentHealth.oldest_pending_age_minutes != null ? ` · ${paymentHealth.oldest_pending_age_minutes} min` : ""}</small>}
      </section>}

      {!loading && data?.generated_at && <small className="text-secondary d-block mt-4">Atualizado em {new Date(data.generated_at).toLocaleString("pt-BR")}</small>}
    </Container>
  </div>;
}
