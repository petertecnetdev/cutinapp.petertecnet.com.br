import React, { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Col, Container, Form, Modal, Row } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import ProductionNextEventHero from "../../components/production/ProductionNextEventHero";
import LocationFields from "../../components/location/LocationFields";
import { FormattedTextEditor } from "../../components/editor/FormattedText";
import cutinappService from "../../services/CutinappService";
import { runBestEffort } from "../../utils/bestEffort";
import "./production-experience.css";
import "./production-inline-editor.css";
import "./production-view-evolution.css";
import "./production-editor-evolution.css";

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

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  useEffect(() => () => {
    if (logoPreview?.startsWith("blob:")) URL.revokeObjectURL(logoPreview);
    if (backgroundPreview?.startsWith("blob:")) URL.revokeObjectURL(backgroundPreview);
  }, [logoPreview, backgroundPreview]);

  const cnpjDigits = normalizeCnpj(form.cnpj);
  const cnpjInvalid = submitted && cnpjDigits !== "" && cnpjDigits.length !== 14;
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

  const resolveTypedCity = async (currentForm) => {
    if (!currentForm.city || currentForm.city_id) return currentForm;

    const cities = await cutinappService.locationCities(currentForm.uf || "", currentForm.city.trim());
    const cityQuery = normalizeText(currentForm.city);
    const ufQuery = String(currentForm.uf || "").trim().toUpperCase();
    const matches = (Array.isArray(cities) ? cities : []).filter((candidate) => {
      if (!cityId(candidate) || normalizeText(cityName(candidate)) !== cityQuery) return false;
      return !ufQuery || String(cityUf(candidate) || "").toUpperCase() === ufQuery;
    });

    const selected = matches.length === 1 ? matches[0] : null;
    if (!selected) return currentForm;

    const resolved = {
      ...currentForm,
      city: cityName(selected),
      city_id: String(cityId(selected)),
      uf: cityUf(selected) || currentForm.uf,
    };
    setForm(resolved);
    return resolved;
  };

  const showFormError = (message, errors = {}) => {
    setFieldErrors(errors);
    setError(message || "Não foi possível criar a produção.");
  };

  const submit = async (event) => {
    event.preventDefault();
    setSubmitted(true);
    setError("");
    setFieldErrors({});

    const nameInvalid = form.name.trim().length < 2;
    const cnpjInvalidNow = cnpjDigits !== "" && cnpjDigits.length !== 14;
    if (nameInvalid || cnpjInvalidNow) {
      const errors = {};
      if (nameInvalid) errors.name = ["Informe um nome com pelo menos 2 caracteres."];
      if (cnpjInvalidNow) errors.cnpj = ["Informe 14 dígitos ou deixe o CNPJ vazio."];
      if (cnpjInvalidNow) setShowOptionalDetails(true);
      showFormError("Revise os campos destacados antes de continuar.", errors);
      return;
    }

    setLoading(true);
    try {
      let resolvedForm = form;
      if (form.city && !form.city_id) {
        try {
          resolvedForm = await resolveTypedCity(form);
        } catch (_) {
          throw Object.assign(new Error("Não foi possível consultar a cidade informada. Tente novamente ou selecione a cidade pela lista."), {
            errors: { city: ["Não conseguimos validar a cidade neste momento."] },
          });
        }
      }

      if ((resolvedForm.city || resolvedForm.uf) && !resolvedForm.city_id) {
        setShowOptionalDetails(true);
        throw Object.assign(new Error("Não conseguimos confirmar a cidade. Selecione a opção correta na lista de cidades para continuar."), {
          errors: { city: ["Selecione uma cidade válida da lista oficial."] },
        });
      }

      const payload = new FormData();
      Object.entries(resolvedForm).forEach(([key, value]) => {
        if (value !== null && String(value).trim() !== "") payload.append(key, value);
      });

      const response = await cutinappService.createProduction(payload);
      const production = response?.production || null;
      const id = Number(production?.id || 0);
      if (!id) throw new Error("A produção foi criada, mas não conseguimos abrir seus dados.");

      const experiencePayload = {
        type: resolvedForm.type,
        city_id: resolvedForm.city_id || null,
        city: resolvedForm.city || null,
        uf: resolvedForm.uf || null,
        cep: resolvedForm.cep || null,
        address: resolvedForm.address || null,
        address_number: resolvedForm.address_number || null,
        neighborhood: resolvedForm.neighborhood || null,
        address_complement: resolvedForm.address_complement || null,
        address_reference: resolvedForm.address_reference || null,
        location_public: Boolean(resolvedForm.location_public),
      };

      const experienceSynced = await runBestEffort(
        () => cutinappService.updateProductionExperience(id, experiencePayload),
        (syncError) => {
          trackProducerActivation("producer_production_experience_sync_failed", { ...production, id, name: production?.name || resolvedForm.name }, {
            activation_stage: "production_created",
            next_step: "event_create",
            status: Number(syncError?.status || syncError?.response?.status || 0) || null,
          });
        }
      );

      const usedQuickPath = !showOptionalDetails;
      trackProducerActivation("producer_production_created", { ...production, id, name: production?.name || resolvedForm.name }, {
        activation_stage: "production_created",
        next_step: "event_create",
        onboarding_path: usedQuickPath ? "quick" : "detailed",
      });
      if (usedQuickPath) {
        trackProducerActivation("producer_quick_production_created", { ...production, id, name: production?.name || resolvedForm.name }, {
          activation_stage: "production_created",
          next_step: "event_create",
        });
      }

      navigate(`/event/create?productionId=${id}`, {
        replace: true,
        state: { productionCreated: true, productionExperienceSynced: experienceSynced },
      });
    } catch (err) {
      const errors = err?.errors || err?.response?.data?.errors || {};
      const message = err?.message || err?.response?.data?.message || "Não foi possível criar a produção.";
      showFormError(message, errors);
      if (Object.keys(errors).some((field) => field !== "name" && field !== "type")) {
        setShowOptionalDetails(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const modalMessages = Object.values(fieldErrors).flat().filter(Boolean);

  const displayName = form.name.trim() || "Sua produção";
  const pageBackground = backgroundPreview || logoPreview;
  const pageStyle = pageBackground ? { "--cut-production-page-bg": `url(${JSON.stringify(pageBackground)})` } : undefined;
  const heroStyle = backgroundPreview ? {
    "--cut-production-editor-hero-image": `url(${JSON.stringify(backgroundPreview)})`,
    "--cut-production-public-hero-image": `url(${JSON.stringify(backgroundPreview)})`,
  } : undefined;
  const mapQuery = form.location_public
    ? (form.formatted_address || [form.address, form.address_number, form.neighborhood, form.city, form.uf].filter(Boolean).join(", "))
    : "";
  const mapEmbedUrl = mapQuery ? `https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed` : "";
  const nameError = submitted && form.name.trim().length < 2;
  const fieldMessage = (name) => Array.isArray(fieldErrors?.[name]) ? fieldErrors[name][0] : fieldErrors?.[name] || "";

  return (
    <div className="cut-app-page cut-production-themed-page cut-production-inline-editor" style={pageStyle}>
      <NavlogComponent />
      {loading && <ProcessingIndicatorComponent label="Criando produção" />}

      <Modal show={Boolean(error)} onHide={() => setError("")} centered backdrop="static">
        <Modal.Header closeButton><Modal.Title>Não foi possível criar a produção</Modal.Title></Modal.Header>
        <Modal.Body>
          <p className="mb-2">{error}</p>
          {modalMessages.length > 0 && <div className="alert alert-warning mb-0" role="alert">{modalMessages.map((message, index) => <div key={`${message}-${index}`}>{message}</div>)}</div>}
        </Modal.Body>
        <Modal.Footer><Button variant="primary" onClick={() => setError("")}>Entendi, vou corrigir</Button></Modal.Footer>
      </Modal>

      <Form onSubmit={submit} noValidate>
        <section className="cut-profile-hero cut-production-themed-page__hero cut-production-themed-page__hero--public cut-production-inline-editor__hero" style={heroStyle}>
          <input id="production-create-cover" className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" data-pt-image-enhancer="off" data-media-library="off" aria-label="Selecionar capa da produção" onChange={(event) => chooseImage("background", event)} />
          <input id="production-create-logo" className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" data-pt-image-enhancer="off" data-media-library="off" aria-label="Selecionar logo da produção" onChange={(event) => chooseImage("logo", event)} />

          <Container className="cut-page-container">
            <div className="cut-production-inline-editor__modebar">
              <div className="cut-production-inline-editor__modecopy">
                <span className="cut-production-inline-editor__modepill"><i className="fa-solid fa-plus" /> Nova produção</span>
                <span className="cut-production-inline-editor__saveState is-dirty">Você está montando a página pública</span>
                <small>O que aparece aqui é a estrutura que o visitante verá.</small>
              </div>
              <div className="cut-production-inline-editor__modeActions">
                <Button type="button" variant="outline-light" onClick={() => navigate("/production/mine")}><i className="fa-solid fa-xmark me-2" />Cancelar</Button>
                <Button type="submit" disabled={!canSubmit || loading}><i className="fa-solid fa-check me-2" />{loading ? "Criando..." : "Criar produção"}</Button>
              </div>
            </div>

            <div className="cut-profile-hero__content cut-production-public-identity cut-production-inline-editor__identity">
              <div className="cut-production-inline-editor__avatarWrap">
                <div className="cut-profile-avatar cut-profile-avatar--square cut-production-public-logo">
                  {logoPreview ? <img src={logoPreview} alt={displayName} /> : <span>{displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "P"}</span>}
                </div>
                <label className="cut-production-inline-editor__imageButton is-logo" htmlFor="production-create-logo" title="Adicionar logo" aria-label="Adicionar logo da produção"><i className="fa-solid fa-camera" /></label>
              </div>

              <div className="cut-production-inline-editor__heroCopy cut-production-public-hero-copy">
                <span className="cut-eyebrow">Produção Cutinapp</span>
                <Form.Control
                  name="name"
                  value={form.name}
                  onChange={change}
                  autoFocus
                  autoComplete="organization"
                  placeholder="Nome da produção"
                  className="cut-production-inline-editor__titleInput"
                  isInvalid={nameError || Boolean(fieldMessage("name"))}
                  aria-label="Nome da produção"
                />
                {(nameError || fieldMessage("name")) && <div className="cut-production-inline-editor__fieldError">{fieldMessage("name") || "Informe um nome com pelo menos 2 caracteres."}</div>}

                <div className="cut-production-inline-editor__locationLine">
                  <Form.Control name="city" value={form.city} onChange={change} placeholder="Cidade" aria-label="Cidade" />
                  <span>-</span>
                  <Form.Control name="uf" value={form.uf} onChange={change} placeholder="UF" aria-label="Estado" maxLength={2} />
                </div>

                <div className="cut-social-stats">
                  <span>0 seguidores</span>
                  <span><i className="fa-regular fa-eye" /> prévia da página</span>
                  <span>0 próximos eventos</span>
                </div>

                <div className="cut-card-actions mt-3 cut-production-inline-editor__heroActions">
                  <label className="btn btn-outline-light" htmlFor="production-create-cover"><i className="fa-regular fa-image me-2" />{backgroundPreview ? "Trocar capa" : "Adicionar capa"}</label>
                  <Button type="button" variant="outline-light" onClick={() => setShowOptionalDetails((current) => !current)}><i className="fa-solid fa-sliders me-2" />{showOptionalDetails ? "Ocultar dados" : "Dados e links"}</Button>
                </div>
              </div>
            </div>
          </Container>
        </section>

        <Container className="cut-page-container py-5">
          {showOptionalDetails && (
            <Card className="cut-panel cut-production-inline-editor__adminPanel mb-4">
              <Card.Body className="p-4">
                <div className="cut-production-inline-editor__sectionHead">
                  <div><span className="cut-eyebrow">Dados da produção</span><h2 className="cut-section-title mt-2">Informações administrativas e links</h2><p>Esses campos complementam a página sem transformar a criação em um formulário separado.</p></div>
                  <Button type="button" variant="outline-light" onClick={() => setShowOptionalDetails(false)}><i className="fa-solid fa-xmark me-2" />Fechar</Button>
                </div>
                <Row className="g-3">
                  <Col md={6}><Form.Group><Form.Label>Nome fantasia</Form.Label><Form.Control name="fantasy" value={form.fantasy} onChange={change} /></Form.Group></Col>
                  <Col md={3}><Form.Group><Form.Label>Tipo</Form.Label><Form.Select name="type" value={form.type} onChange={change}><option value="independent">Produção independente</option><option value="fixed">Espaço fixo / casa própria</option></Form.Select></Form.Group></Col>
                  <Col md={3}><Form.Group><Form.Label>CNPJ</Form.Label><Form.Control name="cnpj" value={form.cnpj} onChange={change} inputMode="numeric" isInvalid={cnpjInvalid} /><Form.Control.Feedback type="invalid">Informe 14 dígitos ou deixe vazio.</Form.Control.Feedback></Form.Group></Col>
                  <Col md={4}><Form.Group><Form.Label>Telefone</Form.Label><Form.Control name="phone" value={form.phone} onChange={change} inputMode="tel" /></Form.Group></Col>
                  <Col md={4}><Form.Group><Form.Label>Instagram</Form.Label><Form.Control name="instagram_url" value={form.instagram_url} onChange={change} placeholder="https://instagram.com/..." /></Form.Group></Col>
                  <Col md={4}><Form.Group><Form.Label>Site</Form.Label><Form.Control name="website_url" value={form.website_url} onChange={change} placeholder="https://..." /></Form.Group></Col>
                </Row>
              </Card.Body>
            </Card>
          )}

          <div className="cut-production-public-about">
            <Card className="cut-panel cut-production-inline-editor__viewCard">
              <Card.Body className="p-4 p-lg-5">
                <span className="cut-eyebrow">Sobre a produção</span>
                <h2 className="cut-section-title mt-2">{form.fantasy?.trim() || displayName}</h2>
                <div className="cut-production-inline-editor__inlinePanel">
                  <FormattedTextEditor
                    value={form.description}
                    onChange={(description) => setForm((current) => ({ ...current, description }))}
                    placeholder="Conte o que torna esta produção, casa ou projeto especial."
                    maxLength={10000}
                  />
                  <small>Esta descrição aparecerá exatamente nesta área da página pública.</small>
                </div>
              </Card.Body>
            </Card>

            <Card className="cut-panel cut-production-location-card cut-production-inline-editor__viewCard">
              <Card.Body className="p-4">
                <span className="cut-eyebrow">Localização</span>
                <h2 className="cut-section-title mt-2">Onde acontece</h2>
                <div className="cut-production-inline-editor__inlinePanel cut-production-inline-editor__locationEditor">
                  <LocationFields value={form} onChange={setForm} showPublicToggle />
                </div>
                {mapEmbedUrl ? <iframe title={`Prévia do mapa de ${displayName}`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" src={mapEmbedUrl} /> : <p className="text-muted mt-3 mb-0">Quando você publicar a localização, o mapa aparecerá aqui para os visitantes.</p>}
              </Card.Body>
            </Card>
          </div>

          <ProductionNextEventHero
            event={null}
            production={{ name: displayName, city: form.city, uf: form.uf }}
            emptyTitle="Seu primeiro evento entra aqui"
            emptyText="Ao criar a produção, você seguirá direto para o primeiro evento. Depois disso, esta área exibirá a próxima experiência exatamente como na página pública."
          />

          <section className="cut-production-inline-editor__galleryEntry" aria-label="Prévia da galeria">
            <div><span className="cut-eyebrow">Galeria da produção</span><strong>Fotos do espaço e experiências</strong><small>Depois de criar a produção, você poderá adicionar, organizar e destacar fotos exatamente nesta área.</small></div>
            <div><Button type="button" variant="outline-light" disabled><i className="fa-regular fa-images me-2" />Disponível após criar</Button></div>
          </section>

          {Object.keys(fieldErrors).length > 0 && <Alert variant="warning" className="mt-4">{Object.values(fieldErrors).flat().map((message, index) => <div key={index}>{message}</div>)}</Alert>}

          <div className="cut-production-inline-editor__footerActions">
            <div><strong>Página pronta para nascer</strong><span>Crie a produção e continue para o primeiro evento sem perder o contexto visual.</span></div>
            <div>
              <Button variant="outline-light" type="button" onClick={() => navigate("/production/mine")}>Cancelar</Button>
              <Button type="submit" disabled={!canSubmit || loading}>{loading ? "Criando..." : "Criar produção e começar o evento"}</Button>
            </div>
          </div>
        </Container>
      </Form>
    </div>
  );
}