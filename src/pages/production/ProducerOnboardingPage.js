import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, ProgressBar, Row, Spinner } from "react-bootstrap";
import { useLocation, useNavigate } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import cutinappService from "../../services/CutinappService";
import "./producer-onboarding.css";

const statusMeta = {
  awaiting_activation: { label: "Aguardando ativação", variant: "warning" },
  awaiting_agreement: { label: "Contrato pendente", variant: "warning" },
  awaiting_payout: { label: "Recebimentos pendentes", variant: "warning" },
  awaiting_payments: { label: "Checkout em configuração", variant: "info" },
  ready_to_sell: { label: "Pronto para vender", variant: "success" },
};

export default function ProducerOnboardingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const requestedProductionId = useMemo(
    () => new URLSearchParams(location.search).get("productionId") || "",
    [location.search],
  );
  const [productions, setProductions] = useState([]);
  const [productionId, setProductionId] = useState(requestedProductionId);
  const [onboarding, setOnboarding] = useState(null);
  const [loadingProductions, setLoadingProductions] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoadingProductions(true);
    cutinappService.myProductions()
      .then((rows) => {
        if (!active) return;
        const items = Array.isArray(rows) ? rows : [];
        setProductions(items);
        const requested = items.find((item) => String(item.id) === String(requestedProductionId));
        const selected = requested || items[0] || null;
        if (selected?.id) setProductionId(String(selected.id));
      })
      .catch((err) => active && setError(err?.response?.data?.message || err?.message || "Não foi possível carregar suas produções."))
      .finally(() => active && setLoadingProductions(false));
    return () => { active = false; };
  }, [requestedProductionId]);

  const refresh = useCallback(async () => {
    if (!productionId) {
      setOnboarding(null);
      return;
    }
    setLoadingStatus(true);
    setError("");
    try {
      const data = await cutinappService.producerOnboarding(productionId);
      setOnboarding(data);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Não foi possível carregar o onboarding.");
    } finally {
      setLoadingStatus(false);
    }
  }, [productionId]);

  useEffect(() => { refresh(); }, [refresh]);

  const actionFor = (step) => {
    if (!step || !productionId) return null;
    if (step.key === "production") return { label: "Abrir produção", path: `/production/${productionId}` };
    if (step.key === "event") {
      return onboarding?.first_event?.id
        ? { label: "Revisar primeiro evento", path: `/event/edit/${onboarding.first_event.id}` }
        : { label: "Criar primeiro evento", path: `/event/create?productionId=${productionId}` };
    }
    if (step.key === "agreement") return { label: "Revisar e assinar contrato", path: `/producer/contracts?productionId=${productionId}` };
    if (step.key === "payout") return { label: "Configurar recebimentos", path: `/producer/finance?production=${productionId}&focus=activation` };
    return null;
  };

  const meta = statusMeta[onboarding?.status] || { label: "Em configuração", variant: "secondary" };
  const percentage = Number(onboarding?.completion?.percentage || 0);

  if (loadingProductions) return <ProcessingFallback />;

  return (
    <div className="cut-app-page producer-onboarding-page">
      <NavlogComponent />
      <Container className="cut-page-container py-4 py-lg-5">
        <div className="producer-onboarding-hero">
          <div>
            <span className="cut-eyebrow">Onboarding do produtor</span>
            <h1>Deixamos a estrutura pronta. Você assume daqui.</h1>
            <p>Conclua contrato e recebimentos uma única vez. Depois, você poderá criar e administrar seus próximos eventos diretamente na Cutinapp.</p>
          </div>
          <Badge bg={meta.variant} className="producer-onboarding-status">{meta.label}</Badge>
        </div>

        {error && <Alert variant="danger">{error}</Alert>}

        {productions.length === 0 ? (
          <Card className="cut-panel"><Card.Body className="p-4">
            <h2>Nenhuma produção vinculada</h2>
            <p>Quando uma produção for vinculada à sua conta, o acompanhamento da configuração aparecerá aqui.</p>
            <Button onClick={() => navigate("/production/create")}>Criar produção</Button>
          </Card.Body></Card>
        ) : (
          <>
            <Card className="cut-panel mb-4"><Card.Body>
              <Form.Label>Produção</Form.Label>
              <Form.Select value={productionId} onChange={(event) => setProductionId(event.target.value)}>
                {productions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </Form.Select>
            </Card.Body></Card>

            {loadingStatus ? <div className="text-center py-5"><Spinner animation="border" /></div> : onboarding && (
              <>
                <Card className="cut-panel producer-onboarding-progress mb-4">
                  <Card.Body className="p-4">
                    <div className="d-flex justify-content-between align-items-end gap-3 mb-2">
                      <div><small>Configuração comercial</small><h2 className="mb-0">{onboarding.organization?.name}</h2></div>
                      <strong>{onboarding.completion?.completed}/{onboarding.completion?.total}</strong>
                    </div>
                    <ProgressBar now={percentage} label={`${percentage}%`} />
                    {onboarding.can_sell_tickets
                      ? <Alert variant="success" className="mt-3 mb-0"><strong>Vendas liberadas.</strong> Contrato, recebimentos e checkout estão regulares.</Alert>
                      : <Alert variant="warning" className="mt-3 mb-0"><strong>Vendas ainda bloqueadas.</strong> Conclua os itens pendentes abaixo. Você pode continuar preparando seus eventos enquanto isso.</Alert>}
                  </Card.Body>
                </Card>

                <Row className="g-3">
                  {(onboarding.steps || []).map((step, index) => {
                    const action = actionFor(step);
                    return (
                      <Col xs={12} md={6} key={step.key}>
                        <Card className={`cut-panel producer-onboarding-step ${step.complete ? "is-complete" : "is-pending"}`}>
                          <Card.Body className="p-4">
                            <div className="producer-onboarding-step__top">
                              <span className="producer-onboarding-step__number">{step.complete ? <i className="fa-solid fa-check" /> : index + 1}</span>
                              <Badge bg={step.complete ? "success" : "secondary"}>{step.complete ? "Concluído" : "Pendente"}</Badge>
                            </div>
                            <h3>{step.label}</h3>
                            <p>{step.detail}</p>
                            {action && <Button variant={step.complete ? "outline-light" : "primary"} onClick={() => navigate(action.path)}>{action.label}</Button>}
                          </Card.Body>
                        </Card>
                      </Col>
                    );
                  })}
                </Row>

                <Card className="cut-panel mt-4"><Card.Body className="p-4">
                  <div className="producer-onboarding-actions">
                    <div>
                      <h2>Próximos eventos</h2>
                      <p className="mb-0">Use o primeiro evento como referência e depois crie ou duplique novas edições sem depender do agente.</p>
                    </div>
                    <div className="d-flex flex-wrap gap-2">
                      {onboarding.first_event?.id && <Button variant="outline-light" onClick={() => navigate(`/event/edit/${onboarding.first_event.id}`)}>Revisar primeiro evento</Button>}
                      <Button onClick={() => navigate(`/event/create?productionId=${productionId}`)}>Criar próximo evento</Button>
                      <Button variant="outline-light" onClick={refresh}>Atualizar status</Button>
                    </div>
                  </div>
                </Card.Body></Card>
              </>
            )}
          </>
        )}
      </Container>
    </div>
  );
}

function ProcessingFallback() {
  return <div className="cut-app-page"><NavlogComponent /><div className="text-center py-5"><Spinner animation="border" /><div className="mt-2">Carregando onboarding</div></div></div>;
}
