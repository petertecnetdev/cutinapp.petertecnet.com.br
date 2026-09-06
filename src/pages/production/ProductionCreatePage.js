import React, { useMemo, useState } from "react";
import { Alert, Button, Card, Col, Collapse, Container, Form, Row } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import LocationFields from "../../components/location/LocationFields";
import cutinappService from "../../services/CutinappService";
import { runBestEffort } from "../../utils/bestEffort";

const initialForm = {
  name: "",
  fantasy: "",
  type: "independent",
  cnpj: "",
  phone: "",
  description: "",
  city_id: "",
  city: "",
  uf: "",
  cep: "",
  address: "",
  address_number: "",
  neighborhood: "",
  address_complement: "",
  address_reference: "",
  location_public: 0,
  website_url: "",
  instagram_url: "",
  logo: null,
  background: null,
};

const normalizeCnpj = (value) => String(value || "").replace(/\D/g, "");

const trackProducerActivation = (type, production, metadata = {}) => {
  try {
    window.PeterTecnetTelemetry?.track?.(type, {
      label: production?.name || "Produção",
      target: String(production?.id || ""),
      metadata: {
        production_id: Number(production?.id || 0),
        ...metadata,
      },
    });
  } catch (_) {
    // Telemetry must never interrupt producer activation.
  }
};

export default function ProductionCreatePage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [showOptionalDetails, setShowOptionalDetails] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [logoPreview, setLogoPreview] = useState("");
  const [backgroundPreview, setBackgroundPreview] = useState("");

  const cnpjDigits = normalizeCnpj(form.cnpj);
  const cnpjInvalid = submitted && cnpjDigits !== "" && cnpjDigits.length !== 14;
  const locationInvalid = submitted && Boolean((form.city || form.uf) && !form.city_id);
  const canSubmit = useMemo(() => form.name.trim().length >= 2 && !loading, [form.name, loading]);

  const change = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  };

  const chooseImage = (field, event) => {
    const file = event.target.files?.[0] || null;
    setForm((current) => ({ ...current, [field]: file }));
    const setter = field === "logo" ? setLogoPreview : setBackgroundPreview;
    setter(file ? URL.createObjectURL(file) : "");
  };

  const submit = async (event) => {
    event.preventDefault();
    setSubmitted(true);
    setError("");
    setFieldErrors({});

    if (!canSubmit || cnpjInvalid || locationInvalid) {
      setError(locationInvalid
        ? "Selecione a cidade pela lista oficial antes de continuar."
        : "Revise os campos destacados antes de continuar.");
      if (cnpjInvalid || locationInvalid) setShowOptionalDetails(true);
      return;
    }

    setLoading(true);
    try {
      const payload = new FormData();
      Object.entries(form).forEach(([key, value]) => {
        if (value !== null && String(value).trim() !== "") payload.append(key, value);
      });

      const response = await cutinappService.createProduction(payload);
      const production = response?.production || null;
      const id = Number(production?.id || 0);
      if (!id) throw new Error("A produção foi criada, mas não conseguimos abrir seus dados.");

      const experiencePayload = {
        type: form.type,
        city_id: form.city_id || null,
        city: form.city || null,
        uf: form.uf || null,
        cep: form.cep || null,
        address: form.address || null,
        address_number: form.address_number || null,
        neighborhood: form.neighborhood || null,
        address_complement: form.address_complement || null,
        address_reference: form.address_reference || null,
        location_public: Boolean(form.location_public),
      };

      const experienceSynced = await runBestEffort(
        () => cutinappService.updateProductionExperience(id, experiencePayload),
        (syncError) => {
          trackProducerActivation("producer_production_experience_sync_failed", { ...production, id, name: production?.name || form.name }, {
            activation_stage: "production_created",
            next_step: "event_create",
            status: Number(syncError?.status || syncError?.response?.status || 0) || null,
          });
        }
      );

      const usedQuickPath = !showOptionalDetails;
      trackProducerActivation("producer_production_created", { ...production, id, name: production?.name || form.name }, {
        activation_stage: "production_created",
        next_step: "event_create",
        onboarding_path: usedQuickPath ? "quick" : "detailed",
      });
      if (usedQuickPath) {
        trackProducerActivation("producer_quick_production_created", { ...production, id, name: production?.name || form.name }, {
          activation_stage: "production_created",
          next_step: "event_create",
        });
      }

      navigate(`/event/create?productionId=${id}`, {
        replace: true,
        state: { productionCreated: true, productionExperienceSynced: experienceSynced },
      });
    } catch (err) {
      setFieldErrors(err?.errors || {});
      setError(err?.message || "Não foi possível criar a produção.");
      if (Object.keys(err?.errors || {}).some((field) => field !== "name" && field !== "type")) {
        setShowOptionalDetails(true);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="cut-app-page">
      <NavlogComponent />
      {loading && <ProcessingIndicatorComponent label="Criando produção" />}
      <Container className="cut-page-container py-4 py-lg-5">
        <div className="cut-page-heading">
          <div>
            <span className="cut-eyebrow">Área do produtor</span>
            <h1>Comece sua produção em poucos segundos</h1>
            <p>Para criar o primeiro evento, informe apenas o nome da produção. Os demais dados podem ser completados agora ou depois.</p>
          </div>
        </div>

        {error && <Alert variant="danger">{error}</Alert>}

        <Form onSubmit={submit} noValidate>
          <Row className="g-4">
            <Col lg={8}>
              <Card className="cut-panel">
                <Card.Body className="p-4 p-lg-5">
                  <div className="d-flex flex-column flex-md-row justify-content-between gap-3 align-items-md-start">
                    <div>
                      <span className="cut-eyebrow">Etapa essencial</span>
                      <h2 className="cut-section-title mt-2">Identifique sua produção</h2>
                      <p className="text-secondary mb-0">Você poderá editar o perfil da produção a qualquer momento.</p>
                    </div>
                    <span className="badge text-bg-success">1 campo obrigatório</span>
                  </div>

                  <Row className="g-3 mt-1">
                    <Col md={8}>
                      <Form.Group>
                        <Form.Label>Nome da produção *</Form.Label>
                        <Form.Control
                          name="name"
                          value={form.name}
                          onChange={change}
                          autoFocus
                          autoComplete="organization"
                          placeholder="Ex.: Peter Eventos"
                          isInvalid={submitted && form.name.trim().length < 2}
                        />
                        <Form.Control.Feedback type="invalid">Informe um nome com pelo menos 2 caracteres.</Form.Control.Feedback>
                      </Form.Group>
                    </Col>
                    <Col md={4}>
                      <Form.Group>
                        <Form.Label>Tipo</Form.Label>
                        <Form.Select name="type" value={form.type} onChange={change}>
                          <option value="independent">Produção independente</option>
                          <option value="fixed">Espaço fixo / casa própria</option>
                        </Form.Select>
                      </Form.Group>
                    </Col>
                  </Row>

                  <div className="cut-info-box mt-4">
                    <strong>Fluxo rápido para o primeiro evento</strong>
                    <span>Ao criar a produção, você seguirá automaticamente para o cadastro do evento e depois para o primeiro lote de ingressos.</span>
                  </div>

                  <div className="d-flex flex-wrap gap-2 mt-4">
                    <Button type="submit" disabled={!canSubmit || loading}>
                      {loading ? "Criando..." : "Criar produção e começar o evento"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline-light"
                      aria-expanded={showOptionalDetails}
                      aria-controls="production-optional-details"
                      onClick={() => {
                        setShowOptionalDetails((current) => !current);
                        try {
                          window.PeterTecnetTelemetry?.track?.("producer_production_details_toggled", {
                            label: showOptionalDetails ? "Ocultar dados opcionais" : "Completar dados opcionais",
                            target: "production_create",
                            metadata: { activation_stage: "production_create" },
                          });
                        } catch (_) {
                          // Telemetry must never interrupt producer onboarding.
                        }
                      }}
                    >
                      {showOptionalDetails ? "Ocultar dados opcionais" : "Completar dados opcionais"}
                    </Button>
                  </div>

                  <Collapse in={showOptionalDetails}>
                    <div id="production-optional-details">
                      <hr className="my-4" />
                      <h2 className="cut-section-title">Dados opcionais</h2>
                      <p className="text-secondary">Use estes campos para enriquecer o perfil público e facilitar a operação. Eles não bloqueiam a criação do primeiro evento.</p>

                      <Row className="g-3">
                        <Col md={6}>
                          <Form.Group>
                            <Form.Label>Nome fantasia</Form.Label>
                            <Form.Control name="fantasy" value={form.fantasy} onChange={change} />
                          </Form.Group>
                        </Col>
                        <Col md={6}>
                          <Form.Group>
                            <Form.Label>CNPJ</Form.Label>
                            <Form.Control name="cnpj" value={form.cnpj} onChange={change} inputMode="numeric" isInvalid={cnpjInvalid} />
                            <Form.Control.Feedback type="invalid">Informe 14 dígitos ou deixe o CNPJ vazio.</Form.Control.Feedback>
                          </Form.Group>
                        </Col>
                        <Col md={6}>
                          <Form.Group>
                            <Form.Label>Telefone</Form.Label>
                            <Form.Control name="phone" value={form.phone} onChange={change} inputMode="tel" />
                          </Form.Group>
                        </Col>
                        <Col xs={12}>
                          <Form.Group>
                            <Form.Label>Descrição</Form.Label>
                            <Form.Control as="textarea" rows={4} name="description" value={form.description} onChange={change} />
                          </Form.Group>
                        </Col>
                      </Row>

                      <h2 className="cut-section-title mt-4">Localização comercial</h2>
                      <LocationFields value={form} onChange={setForm} showPublicToggle />

                      <Row className="g-3 mt-1">
                        <Col md={6}>
                          <Form.Group>
                            <Form.Label>Site</Form.Label>
                            <Form.Control name="website_url" value={form.website_url} onChange={change} />
                          </Form.Group>
                        </Col>
                        <Col md={6}>
                          <Form.Group>
                            <Form.Label>Instagram</Form.Label>
                            <Form.Control name="instagram_url" value={form.instagram_url} onChange={change} />
                          </Form.Group>
                        </Col>
                      </Row>

                      <Row className="g-3 mt-2">
                        <Col md={6}>
                          <Form.Label>Logo</Form.Label>
                          {logoPreview && <img className="cut-upload-preview cut-upload-preview--logo mb-3" src={logoPreview} alt="Prévia da logo" />}
                          <Form.Control type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => chooseImage("logo", event)} />
                        </Col>
                        <Col md={6}>
                          <Form.Label>Capa</Form.Label>
                          {backgroundPreview && <img className="cut-upload-preview mb-3" src={backgroundPreview} alt="Prévia da capa" />}
                          <Form.Control type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => chooseImage("background", event)} />
                        </Col>
                      </Row>

                      {Object.keys(fieldErrors).length > 0 && (
                        <Alert variant="warning" className="mt-3">
                          {Object.values(fieldErrors).flat().map((message, index) => <div key={index}>{message}</div>)}
                        </Alert>
                      )}
                    </div>
                  </Collapse>
                </Card.Body>
              </Card>
            </Col>

            <Col lg={4}>
              <Card className="cut-panel h-100">
                <Card.Body className="p-4">
                  <span className="cut-eyebrow">Ativação</span>
                  <h2 className="cut-section-title mt-2">Do cadastro à venda</h2>
                  <div className="d-grid gap-3 mt-3">
                    <div className="cut-info-box"><strong>1. Produção</strong><span>Agora: nome e tipo.</span></div>
                    <div className="cut-info-box"><strong>2. Evento</strong><span>Data, local e informações públicas.</span></div>
                    <div className="cut-info-box"><strong>3. Ingressos</strong><span>Crie o primeiro lote e defina o preço.</span></div>
                    <div className="cut-info-box"><strong>4. Publicação</strong><span>Coloque o evento no ar e compartilhe o link.</span></div>
                  </div>
                  <p className="text-secondary mt-3 mb-0">Nenhum plano ou cobrança adicional é criado neste fluxo. A monetização continua vinculada às vendas e serviços do evento.</p>
                </Card.Body>
              </Card>
            </Col>
          </Row>

          <div className="cut-form-actions mt-4">
            <Button variant="outline-light" type="button" onClick={() => navigate("/production/mine")}>Cancelar</Button>
            <Button type="submit" disabled={!canSubmit || loading}>{loading ? "Criando..." : "Criar produção e começar o evento"}</Button>
          </div>
        </Form>
      </Container>
    </div>
  );
}
