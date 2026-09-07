import React, { useEffect, useState } from "react";
import { Alert, Badge, Card, Col, Container, Row, Spinner } from "react-bootstrap";
import NavlogComponent from "../../components/NavlogComponent";
import appApiClient from "../../services/AppApiClient";

const money = (value) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function ApplicationAdminFinancePage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    appApiClient.get("/admin/finance")
      .then((response) => active && setData(response.data?.data || null))
      .catch((err) => active && setError(err?.response?.data?.message || err?.message || "Não foi possível carregar o financeiro global."))
      .finally(() => active && setLoading(false));
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
      {!loading && data?.generated_at && <small className="text-secondary d-block mt-4">Atualizado em {new Date(data.generated_at).toLocaleString("pt-BR")}</small>}
    </Container>
  </div>;
}
