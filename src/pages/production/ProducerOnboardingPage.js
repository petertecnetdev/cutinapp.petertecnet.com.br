import React, { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, ProgressBar, Row } from "react-bootstrap";
import { useLocation, useNavigate } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import onboardingService from "../../services/OnboardingService";

const stepMeta = [
  ["account", "Conta criada", "Seu acesso está vinculado à Cutinapp."],
  ["organization", "Produção cadastrada", "Os dados básicos da sua produção já estão configurados."],
  ["initial_event", "Primeiro evento preparado", "Use este evento como referência para as próximas edições."],
  ["agreement", "Contrato assinado", "Obrigatório para publicar eventos com ingressos pagos."],
  ["payout", "Recebimentos e Pix ativados", "Obrigatório para receber os valores das vendas."],
];

const statusLabel = {
  awaiting_owner: "Aguardando produtor",
  awaiting_agreement: "Contrato pendente",
  awaiting_payout: "Recebimentos pendentes",
  ready_to_sell: "Pronto para vender",
};

export default function ProducerOnboardingPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const requestedId = useMemo(() => new URLSearchParams(location.search).get("productionId") || "", [location.search]);
  const [items, setItems] = useState([]);
  const [productionId, setProductionId] = useState(requestedId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    onboardingService.mine()
      .then((rows) => {
        if (!active) return;
        setItems(Array.isArray(rows) ? rows : []);
        const requested = (rows || []).find((row) => String(row.organization?.id) === String(requestedId));
        const first = requested || rows?.[0] || null;
        if (first?.organization?.id) setProductionId(String(first.organization.id));
      })
      .catch((err) => active && setError(err?.message || "Não foi possível carregar seu onboarding."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [requestedId, reloadKey]);

  const onboarding = items.find((row) => String(row.organization?.id) === String(productionId)) || null;

  return <div className="cut-app-page">
    <NavlogComponent />
    <Container className="cut-page-container py-4 py-lg-5">
      <div className="cut-page-heading">
        <div>
          <span className="cut-eyebrow">Configuração da produção</span>
          <h1>Coloque sua produção pronta para vender</h1>
          <p>A configuração inicial já foi adiantada. Conclua as etapas abaixo e depois administre seus próprios eventos diretamente pela Cutinapp.</p>
        </div>
        {onboarding && <Badge bg={onboarding.sales_ready ? "success" : "warning"}>
          {statusLabel[onboarding.status] || onboarding.status}
        </Badge>}
      </div>

      {error && <Alert variant="danger" className="d-flex flex-wrap align-items-center justify-content-between gap-3">
        <span>{error}</span>
        <Button variant="outline-danger" size="sm" onClick={() => setReloadKey((value) => value + 1)} disabled={loading}>
          Tentar novamente
        </Button>
      </Alert>}
      {loading && <div className="py-5"><ProcessingIndicatorComponent fullscreen={false} label="Carregando configuração da produção" /></div>}

      {!loading && !error && items.length === 0 && <Card className="cut-empty-state"><Card.Body>
        <h2>Nenhuma produção encontrada</h2>
        <p>Quando uma produção for vinculada à sua conta, o acompanhamento aparecerá aqui.</p>
      </Card.Body></Card>}

      {!loading && items.length > 1 && <Card className="cut-panel mb-4"><Card.Body>
        <Form.Label>Produção</Form.Label>
        <Form.Select value={productionId} onChange={(event) => setProductionId(event.target.value)}>
          {items.map((row) => <option key={row.organization.id} value={row.organization.id}>{row.organization.name}</option>)}
        </Form.Select>
      </Card.Body></Card>}

      {onboarding && <>
        <Card className="cut-panel mb-4"><Card.Body className="p-4">
          <div className="d-flex flex-wrap justify-content-between gap-3 align-items-end mb-3">
            <div><span className="cut-eyebrow">{onboarding.organization.name}</span><h2 className="cut-section-title mt-2 mb-0">Seu progresso</h2></div>
            <strong>{onboarding.completed_steps}/{onboarding.total_steps} etapas</strong>
          </div>
          <ProgressBar now={onboarding.progress} label={`${onboarding.progress}%`} />
        </Card.Body></Card>

        <Row className="g-3">
          {stepMeta.map(([key, title, detail]) => {
            const done = Boolean(onboarding.steps?.[key]);
            return <Col md={6} xl={4} key={key}><Card className="cut-panel h-100"><Card.Body className="p-4">
              <div className="d-flex justify-content-between gap-3">
                <div><span className="cut-eyebrow">Etapa</span><h2 className="cut-section-title mt-2">{title}</h2></div>
                <Badge bg={done ? "success" : "secondary"}>{done ? "Concluída" : "Pendente"}</Badge>
              </div>
              <p className="text-secondary mb-0">{detail}</p>
              {!done && key === "agreement" && <Button className="mt-3" onClick={() => navigate(`/producer/contracts?productionId=${onboarding.organization.id}`)}>Assinar contrato</Button>}
              {!done && key === "payout" && <Button className="mt-3" onClick={() => navigate(`/producer/finance?production=${onboarding.organization.id}&focus=activation`)}>Configurar recebimentos</Button>}
            </Card.Body></Card></Col>;
          })}
        </Row>

        <Card className="cut-panel mt-4"><Card.Body className="p-4">
          {onboarding.sales_ready ? <Alert variant="success" className="mb-3">
            <strong>Produção pronta para vender.</strong> Contrato e recebimentos estão válidos. Revise o primeiro evento, configure os ingressos e publique.
          </Alert> : <Alert variant="warning" className="mb-3">
            A produção pode ser preparada normalmente, mas eventos com ingressos pagos permanecem bloqueados para publicação até contrato e recebimentos estarem concluídos.
          </Alert>}
          <div className="d-flex flex-wrap gap-2">
            {onboarding.initial_event?.id && <Button onClick={() => navigate(`/event/edit/${onboarding.initial_event.id}`)}>Revisar primeiro evento</Button>}
            <Button variant="outline-light" onClick={() => navigate("/event/manage")}>Meus eventos</Button>
            {onboarding.agreement_signed && <Button variant="outline-light" onClick={() => navigate(`/event/create?productionId=${onboarding.organization.id}`)}>Criar próximo evento</Button>}
          </div>
        </Card.Body></Card>
      </>}
    </Container>
  </div>;
}
