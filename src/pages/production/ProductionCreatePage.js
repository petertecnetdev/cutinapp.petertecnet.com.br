import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Card, Col, Collapse, Container, Form, Modal, Row } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import LocationFields from "../../components/location/LocationFields";
import cutinappService from "../../services/CutinappService";
import { runBestEffort } from "../../utils/bestEffort";
import { apiDiagnostic } from "../../utils/apiErrorMessage";

const DRAFT_KEY = "cutinapp:production-create:draft:v2";
const DRAFT_VERSION = 2;
const CREATE_RECOVERY_DELAYS = [700, 1800];

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
const normalizeText = (value) => String(value || "").trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const cityId = (city) => city?.ibge_code ?? city?.city_id ?? city?.id ?? city?.code ?? "";
const cityName = (city) => city?.name ?? city?.city ?? city?.nome ?? "";
const cityUf = (city) => city?.uf ?? city?.state_code ?? city?.state?.uf ?? "";
const wait = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs));

const readDraft = () => {
  if (typeof window === "undefined") return initialForm;
  try {
    const stored = JSON.parse(window.localStorage.getItem(DRAFT_KEY) || "null");
    if (!stored || stored.version !== DRAFT_VERSION || !stored.form) return initialForm;
    return { ...initialForm, ...stored.form, logo: null, background: null };
  } catch (_) {
    return initialForm;
  }
};

const draftableForm = (form) => {
  const serializable = { ...form };
  delete serializable.logo;
  delete serializable.background;
  return serializable;
};

const isUncertainCreationFailure = (error) => {
  const status = Number(error?.status || 0);
  if ([408, 409, 425, 429].includes(status) || status >= 500) return true;
  return ["transport", "timeout", "server", "conflict", "rate_limit"].includes(String(error?.kind || ""));
};

const trackProducerActivation = (type, production, metadata = {}) => {
  try {
    window.PeterTecnetTelemetry?.track?.(type, {
      label: production?.name || "Produção",
      target: String(production?.id || "production_create"),
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
  const [form, setForm] = useState(readDraft);
  const [showOptionalDetails, setShowOptionalDetails] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [diagnostic, setDiagnostic] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [logoPreview, setLogoPreview] = useState("");
  const [backgroundPreview, setBackgroundPreview] = useState("");
  const [success, setSuccess] = useState(null);
  const submitLock = useRef(false);
  const createdAtRef = useRef(0);

  const cnpjDigits = normalizeCnpj(form.cnpj);
  const cnpjInvalid = submitted && cnpjDigits !== "" && cnpjDigits.length !== 14;
  const canSubmit = useMemo(() => form.name.trim().length >= 2 && !loading, [form.name, loading]);

  useEffect(() => {
    if (typeof window === "undefined" || success) return undefined;
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(DRAFT_KEY, JSON.stringify({
          version: DRAFT_VERSION,
          savedAt: new Date().toISOString(),
          form: draftableForm(form),
        }));
      } catch (_) {
        // Storage restrictions must never block producer onboarding.
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [form, success]);

  useEffect(() => {
    if (!success?.id) return undefined;
    const timer = window.setTimeout(() => {
      navigate(`/event/create?productionId=${success.id}`, {
        replace: true,
        state: {
          productionCreated: true,
          productionRecovered: Boolean(success.recovered),
          productionOptionalSyncWarning: Boolean(success.optionalSyncWarning),
        },
      });
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [navigate, success]);

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

  const resolveTypedCityBestEffort = async (currentForm) => {
    if (!currentForm.city || currentForm.city_id) return { form: currentForm, resolved: Boolean(currentForm.city_id) };
    try {
      const cities = await cutinappService.locationCities(currentForm.uf || "", currentForm.city.trim());
      const cityQuery = normalizeText(currentForm.city);
      const ufQuery = String(currentForm.uf || "").trim().toUpperCase();
      const matches = (Array.isArray(cities) ? cities : []).filter((candidate) => {
        if (!cityId(candidate) || normalizeText(cityName(candidate)) !== cityQuery) return false;
        return !ufQuery || String(cityUf(candidate) || "").toUpperCase() === ufQuery;
      });
      if (matches.length !== 1) return { form: currentForm, resolved: false };
      const selected = matches[0];
      const resolvedForm = {
        ...currentForm,
        city: cityName(selected),
        city_id: String(cityId(selected)),
        uf: cityUf(selected) || currentForm.uf,
      };
      setForm(resolvedForm);
      return { form: resolvedForm, resolved: true };
    } catch (_) {
      return { form: currentForm, resolved: false };
    }
  };

  const essentialPayload = () => {
    const payload = new FormData();
    payload.append("name", form.name.trim());
    return payload;
  };

  const createWithRecovery = async (payload) => {
    let lastError = null;
    for (let attempt = 0; attempt <= CREATE_RECOVERY_DELAYS.length; attempt += 1) {
      try {
        const response = await cutinappService.createProduction(payload);
        return { response, recovered: attempt > 0 };
      } catch (err) {
        lastError = err;
        if (!isUncertainCreationFailure(err) || attempt >= CREATE_RECOVERY_DELAYS.length) break;
        trackProducerActivation("producer_production_create_recovery_attempt", { name: form.name }, {
          attempt: attempt + 1,
          status: Number(err?.status || 0) || null,
          kind: err?.kind || null,
          request_id: err?.requestId || null,
        });
        await wait(CREATE_RECOVERY_DELAYS[attempt]);
      }
    }

    if (lastError && isUncertainCreationFailure(lastError)) {
      try {
        const productions = await cutinappService.myProductions();
        const cutoff = createdAtRef.current - (5 * 60 * 1000);
        const candidates = productions.filter((production) => {
          if (normalizeText(production?.name) !== normalizeText(form.name)) return false;
          const created = Date.parse(production?.created_at || "");
          return Number.isFinite(created) ? created >= cutoff : false;
        });
        if (candidates.length === 1) {
          return { response: { production: candidates[0] }, recovered: true };
        }
      } catch (_) {
        // The original error remains the authoritative diagnostic.
      }
    }
    throw lastError;
  };

  const syncOptionalDetails = async (id, production, currentForm) => {
    let warning = false;
    const cnpj = normalizeCnpj(currentForm.cnpj);
    const cityResolution = await resolveTypedCityBestEffort(currentForm);
    const resolvedForm = cityResolution.form;

    const profilePayload = new FormData();
    const basicFields = ["fantasy", "phone", "description", "website_url", "instagram_url"];
    basicFields.forEach((key) => {
      const value = resolvedForm[key];
      if (value !== null && String(value || "").trim() !== "") profilePayload.append(key, value);
    });
    if (cnpj.length === 14) profilePayload.append("cnpj", cnpj);
    if (cityResolution.resolved) {
      ["city", "uf", "address"].forEach((key) => {
        const value = resolvedForm[key];
        if (value !== null && String(value || "").trim() !== "") profilePayload.append(key, value);
      });
    }
    if (resolvedForm.logo) profilePayload.append("logo", resolvedForm.logo);
    if (resolvedForm.background) profilePayload.append("background", resolvedForm.background);

    if (Array.from(profilePayload.keys()).length > 0) {
      const synced = await runBestEffort(
        () => cutinappService.updateProduction(id, profilePayload),
        (syncError) => {
          warning = true;
          trackProducerActivation("producer_production_optional_profile_sync_failed", production, {
            status: Number(syncError?.status || 0) || null,
            request_id: syncError?.requestId || null,
          });
        }
      );
      if (!synced) warning = true;
    }

    const experiencePayload = {
      type: resolvedForm.type,
      location_public: Boolean(resolvedForm.location_public),
    };
    if (!resolvedForm.city || cityResolution.resolved) {
      Object.assign(experiencePayload, {
        city_id: resolvedForm.city_id || null,
        city: resolvedForm.city || null,
        uf: resolvedForm.uf || null,
        cep: resolvedForm.cep || null,
        address: resolvedForm.address || null,
        address_number: resolvedForm.address_number || null,
        neighborhood: resolvedForm.neighborhood || null,
        address_complement: resolvedForm.address_complement || null,
        address_reference: resolvedForm.address_reference || null,
      });
    } else {
      warning = true;
      trackProducerActivation("producer_production_city_sync_deferred", production, {
        typed_city: resolvedForm.city,
        activation_stage: "production_created",
      });
    }

    const experienceSynced = await runBestEffort(
      () => cutinappService.updateProductionExperience(id, experiencePayload),
      (syncError) => {
        warning = true;
        trackProducerActivation("producer_production_experience_sync_failed", production, {
          status: Number(syncError?.status || 0) || null,
          request_id: syncError?.requestId || null,
        });
      }
    );
    if (!experienceSynced) warning = true;

    if (cnpj && cnpj.length !== 14) warning = true;
    return warning;
  };

  const showFormError = (message, errors = {}, err = null) => {
    setFieldErrors(errors);
    setDiagnostic(apiDiagnostic(err));
    setError(message || "Não foi possível criar a produção.");
  };

  const submit = async (event) => {
    event.preventDefault();
    if (submitLock.current) return;
    submitLock.current = true;
    setSubmitted(true);
    setError("");
    setDiagnostic(null);
    setFieldErrors({});

    if (form.name.trim().length < 2) {
      const errors = { name: ["Informe um nome com pelo menos 2 caracteres."] };
      showFormError("Informe o nome da produção para continuar.", errors);
      trackProducerActivation("producer_production_create_validation_failed", { name: form.name }, { fields: ["name"] });
      submitLock.current = false;
      return;
    }

    createdAtRef.current = Date.now();
    setLoading(true);
    trackProducerActivation("producer_production_create_started", { name: form.name }, {
      onboarding_path: showOptionalDetails ? "detailed" : "quick",
    });

    try {
      const { response, recovered } = await createWithRecovery(essentialPayload());
      const production = response?.production || null;
      const id = Number(production?.id || 0);
      if (!id) throw new Error("A produção foi criada, mas a API não retornou o identificador necessário para continuar.");

      const optionalSyncWarning = await syncOptionalDetails(id, { ...production, id, name: production?.name || form.name }, form);
      try {
        window.localStorage.removeItem(DRAFT_KEY);
      } catch (_) {
        // Storage restrictions do not affect successful creation.
      }

      const duration = Date.now() - createdAtRef.current;
      trackProducerActivation("producer_production_create_success", { ...production, id }, {
        duration_ms: duration,
        recovered,
        optional_sync_warning: optionalSyncWarning,
        next_step: "event_create",
      });
      trackProducerActivation("producer_production_created", { ...production, id }, {
        duration_ms: duration,
        recovered,
        onboarding_path: showOptionalDetails ? "detailed" : "quick",
        next_step: "event_create",
      });
      if (recovered) {
        trackProducerActivation("producer_production_create_recovered", { ...production, id }, { duration_ms: duration });
      }

      setSuccess({ id, name: production?.name || form.name.trim(), recovered, optionalSyncWarning });
    } catch (err) {
      const errors = err?.errors || err?.response?.data?.errors || {};
      const message = err?.message || err?.response?.data?.message || "Não foi possível criar a produção.";
      showFormError(message, errors, err);
      trackProducerActivation("producer_production_create_failed", { name: form.name }, {
        duration_ms: Date.now() - createdAtRef.current,
        status: Number(err?.status || 0) || null,
        kind: err?.kind || null,
        code: err?.code || null,
        request_id: err?.requestId || null,
      });
      if (err?.kind) {
        trackProducerActivation(`producer_production_create_${err.kind}`, { name: form.name }, {
          status: Number(err?.status || 0) || null,
          request_id: err?.requestId || null,
        });
      }
      if (Object.keys(errors).some((field) => field !== "name")) setShowOptionalDetails(true);
    } finally {
      setLoading(false);
      submitLock.current = false;
    }
  };

  const continueToEvent = () => {
    if (!success?.id) return;
    navigate(`/event/create?productionId=${success.id}`, {
      replace: true,
      state: {
        productionCreated: true,
        productionRecovered: Boolean(success.recovered),
        productionOptionalSyncWarning: Boolean(success.optionalSyncWarning),
      },
    });
  };

  const modalMessages = Object.values(fieldErrors).flat().filter(Boolean);

  return (
    <div className="cut-app-page">
      <NavlogComponent />
      {loading && <ProcessingIndicatorComponent label="Criando produção" />}

      <Modal show={Boolean(error)} onHide={() => setError("")} centered backdrop="static">
        <Modal.Header closeButton>
          <Modal.Title>Não foi possível criar a produção</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="mb-2">{error}</p>
          {modalMessages.length > 0 && (
            <div className="alert alert-warning mb-3" role="alert">
              {modalMessages.map((message, index) => <div key={`${message}-${index}`}>{message}</div>)}
            </div>
          )}
          {diagnostic && (
            <div className="small text-secondary" data-testid="api-diagnostic">
              Código de diagnóstico: {diagnostic.requestId || diagnostic.code || `HTTP-${diagnostic.status || "N/A"}`}
              {diagnostic.status ? ` · HTTP ${diagnostic.status}` : ""}
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="primary" onClick={() => setError("")}>Entendi, vou corrigir</Button>
        </Modal.Footer>
      </Modal>

      <Modal show={Boolean(success)} onHide={() => {}} centered backdrop="static" keyboard={false}>
        <Modal.Header>
          <Modal.Title>Produção criada com sucesso</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="mb-2"><strong>{success?.name}</strong> já está cadastrada.</p>
          <p className="mb-0">Agora vamos criar seu primeiro evento.</p>
          {success?.recovered && <Alert variant="info" className="mt-3 mb-0">A Cutinapp confirmou automaticamente uma tentativa que havia ficado sem resposta. Nenhuma produção duplicada foi criada.</Alert>}
          {success?.optionalSyncWarning && <Alert variant="warning" className="mt-3 mb-0">A produção foi criada normalmente. Algum dado opcional ficou para ser completado depois e não bloqueia a criação do evento.</Alert>}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="primary" onClick={continueToEvent}>Criar primeiro evento</Button>
        </Modal.Footer>
      </Modal>

      <Container className="cut-page-container py-4 py-lg-5">
        <div className="cut-page-heading">
          <div>
            <span className="cut-eyebrow">Área do produtor</span>
            <h1>Comece sua produção em poucos segundos</h1>
            <p>Para criar o primeiro evento, informe apenas o nome da produção. Os demais dados podem ser completados agora ou depois.</p>
          </div>
        </div>

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
                        <Form.Control name="name" value={form.name} onChange={change} autoFocus autoComplete="organization" placeholder="Ex.: Peter Eventos" isInvalid={submitted && form.name.trim().length < 2} />
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
                    <span>O nome cria a produção imediatamente. Cidade, CNPJ, imagens e demais dados são sincronizados depois e nunca impedem esta etapa.</span>
                  </div>

                  <div className="d-flex flex-wrap gap-2 mt-4">
                    <Button type="submit" disabled={!canSubmit || loading}>{loading ? "Criando..." : "Criar produção e começar o evento"}</Button>
                    <Button type="button" variant="outline-light" aria-expanded={showOptionalDetails} aria-controls="production-optional-details" onClick={() => {
                      setShowOptionalDetails((current) => !current);
                      trackProducerActivation("producer_production_details_toggled", { name: form.name }, { open: !showOptionalDetails });
                    }}>
                      {showOptionalDetails ? "Ocultar dados opcionais" : "Completar dados opcionais"}
                    </Button>
                  </div>

                  <Collapse in={showOptionalDetails}>
                    <div id="production-optional-details">
                      <hr className="my-4" />
                      <h2 className="cut-section-title">Dados opcionais</h2>
                      <p className="text-secondary">Use estes campos para enriquecer o perfil público. Se algum serviço auxiliar estiver indisponível, a produção será criada mesmo assim.</p>

                      <Row className="g-3">
                        <Col md={6}><Form.Group><Form.Label>Nome fantasia</Form.Label><Form.Control name="fantasy" value={form.fantasy} onChange={change} /></Form.Group></Col>
                        <Col md={6}>
                          <Form.Group>
                            <Form.Label>CNPJ</Form.Label>
                            <Form.Control name="cnpj" value={form.cnpj} onChange={change} inputMode="numeric" isInvalid={cnpjInvalid} />
                            <Form.Control.Feedback type="invalid">O CNPJ não será salvo agora. Informe 14 dígitos ou complete depois; isso não bloqueia a criação.</Form.Control.Feedback>
                          </Form.Group>
                        </Col>
                        <Col md={6}><Form.Group><Form.Label>Telefone</Form.Label><Form.Control name="phone" value={form.phone} onChange={change} inputMode="tel" /></Form.Group></Col>
                        <Col xs={12}><Form.Group><Form.Label>Descrição</Form.Label><Form.Control as="textarea" rows={4} name="description" value={form.description} onChange={change} /></Form.Group></Col>
                      </Row>

                      <h2 className="cut-section-title mt-4">Localização comercial</h2>
                      <LocationFields value={form} onChange={setForm} showPublicToggle />

                      <Row className="g-3 mt-1">
                        <Col md={6}><Form.Group><Form.Label>Site</Form.Label><Form.Control name="website_url" value={form.website_url} onChange={change} /></Form.Group></Col>
                        <Col md={6}><Form.Group><Form.Label>Instagram</Form.Label><Form.Control name="instagram_url" value={form.instagram_url} onChange={change} /></Form.Group></Col>
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
                    <div className="cut-info-box"><strong>1. Produção</strong><span>Agora: somente o nome é obrigatório.</span></div>
                    <div className="cut-info-box"><strong>2. Evento</strong><span>Data, local e informações públicas.</span></div>
                    <div className="cut-info-box"><strong>3. Ingressos</strong><span>Crie o primeiro lote e defina o preço.</span></div>
                    <div className="cut-info-box"><strong>4. Publicação</strong><span>Coloque o evento no ar e compartilhe o link.</span></div>
                  </div>
                  <p className="text-secondary mt-3 mb-0">O formulário é salvo automaticamente neste navegador até a produção ser criada.</p>
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
