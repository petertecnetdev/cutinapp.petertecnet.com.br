import React, { useEffect, useState } from "react";
import { Alert, Badge, Card, Col, Container, Row, Spinner } from "react-bootstrap";
import NavlogComponent from "../../components/NavlogComponent";
import appApiClient from "../../services/AppApiClient";

const money = (value) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

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
  ] : [];

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
        </div>
        {(paymentHealth.critical_orders ?? 0) > 0 && <Alert variant="warning">
          Há {paymentHealth.critical_orders} pedido(s) pendente(s) há mais de {paymentHealth.critical_after_minutes ?? 60} minutos, somando {money(paymentHealth.critical_volume)}.
        </Alert>}
        <Row className="g-3">
          {healthCards.map(([label, value]) => <Col xs={12} sm={6} lg key={label}><Card className="cut-panel h-100"><Card.Body><span className="cut-eyebrow">{label}</span><div className="fs-5 fw-bold mt-2">{value}</div></Card.Body></Card></Col>)}
        </Row>
        {paymentHealth.oldest_pending_at && <small className="text-secondary d-block mt-3">Pendente mais antigo: {new Date(paymentHealth.oldest_pending_at).toLocaleString("pt-BR")}</small>}
      </section>}

      {!loading && data?.generated_at && <small className="text-secondary d-block mt-4">Atualizado em {new Date(data.generated_at).toLocaleString("pt-BR")}</small>}
    </Container>
  </div>;
}
