import React, { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import { useLocation, useNavigate } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import commerceService from "../../services/CommerceService";
import cutinappService from "../../services/CutinappService";

const money = (value) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));

export default function ProductionFinancePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const [productions, setProductions] = useState([]);
  const [productionId, setProductionId] = useState(params.get("production") || "");
  const [account, setAccount] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");

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
    if (!productionId) return;
    let active = true;
    setLoading(true); setError("");
    Promise.all([
      commerceService.paymentAccount(productionId),
      commerceService.financialSummary(productionId),
    ])
      .then(([paymentAccount, financial]) => {
        if (!active) return;
        setAccount(paymentAccount);
        setSummary(financial);
      })
      .catch((err) => active && setError(err?.message || "Não foi possível carregar o financeiro da produção."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [productionId]);

  const production = productions.find((row) => String(row.id) === String(productionId));
  const connected = account?.provider === "mercadopago" && account?.status === "connected";
  const connectedNotice = params.get("mercadopago") === "connected";

  const connect = async () => {
    if (!productionId) return;
    setConnecting(true); setError("");
    try {
      const response = await commerceService.connectMercadoPago(productionId);
      if (!response?.authorization_url) throw new Error("A API não retornou a autorização do Mercado Pago.");
      window.location.assign(response.authorization_url);
    } catch (err) {
      setError(err?.message || "Não foi possível iniciar a conexão com o Mercado Pago.");
      setConnecting(false);
    }
  };

  return <div className="cut-app-page">
    <NavlogComponent />
    {loading && <ProcessingIndicatorComponent label="Atualizando financeiro" />}
    <Container className="cut-page-container py-4 py-lg-5">
      <div className="cut-page-heading">
        <div>
          <span className="cut-eyebrow">Área do produtor</span>
          <h1>Recebimentos</h1>
          <p>Conecte o Mercado Pago para receber automaticamente sua parte das vendas. A Peter Tecnet acompanha e audita as transações pelo Admin Center.</p>
        </div>
        <Button variant="outline-light" onClick={() => navigate("/production/mine")}>Minhas produções</Button>
      </div>

      {connectedNotice && <Alert variant="success">Mercado Pago conectado com sucesso.</Alert>}
      {error && <Alert variant="danger">{error}</Alert>}

      <Card className="cut-production-card mb-4">
        <Card.Body className="p-4">
          <Form.Group>
            <Form.Label>Produção</Form.Label>
            <Form.Select value={productionId} onChange={(event) => setProductionId(event.target.value)}>
              <option value="">Selecione</option>
              {productions.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
            </Form.Select>
          </Form.Group>
        </Card.Body>
      </Card>

      {productionId && <Row className="g-4">
        <Col lg={5}>
          <Card className="cut-production-card h-100">
            <Card.Body className="p-4">
              <span className="cut-eyebrow">Conta de recebimento</span>
              <h2 className="mt-2 mb-3">Mercado Pago</h2>
              <p>{production?.name || "Produção selecionada"}</p>
              <div className="d-flex align-items-center gap-2 mb-3">
                <Badge bg={connected ? "success" : "warning"}>{connected ? "Conectado" : "Não conectado"}</Badge>
                {account?.provider_recipient_id && <small>Conta #{account.provider_recipient_id}</small>}
              </div>
              <p className="text-secondary">A autorização é feita diretamente no Mercado Pago. A Cutinapp não solicita senha nem credenciais bancárias do produtor.</p>
              <Button onClick={connect} disabled={connecting} className="w-100">
                {connecting ? "Abrindo Mercado Pago..." : connected ? "Reconectar Mercado Pago" : "Conectar Mercado Pago"}
              </Button>
            </Card.Body>
          </Card>
        </Col>
        <Col lg={7}>
          <Card className="cut-production-card h-100">
            <Card.Body className="p-4">
              <span className="cut-eyebrow">Resumo financeiro</span>
              <h2 className="mt-2 mb-4">Vendas da produção</h2>
              <Row className="g-3">
                <Col sm={6}><div className="cut-ticket-option h-100"><div><span className="cut-ticket-kicker">Volume bruto</span><strong>{money(summary?.gross_sales)}</strong></div></div></Col>
                <Col sm={6}><div className="cut-ticket-option h-100"><div><span className="cut-ticket-kicker">Comissão da plataforma</span><strong>{money(summary?.platform_fees)}</strong></div></div></Col>
                <Col sm={6}><div className="cut-ticket-option h-100"><div><span className="cut-ticket-kicker">Taxas do provedor</span><strong>{money(summary?.processor_fees)}</strong></div></div></Col>
                <Col sm={6}><div className="cut-ticket-option h-100"><div><span className="cut-ticket-kicker">Crédito do produtor</span><strong>{money(summary?.producer_earned)}</strong></div></div></Col>
              </Row>
              <Alert variant="info" className="mt-4 mb-0">Repasse por split automático do Mercado Pago. Não é necessário solicitar saque manual pela Cutinapp.</Alert>
            </Card.Body>
          </Card>
        </Col>
      </Row>}
    </Container>
  </div>;
}
