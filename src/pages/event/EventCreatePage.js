import React, { useContext, useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import { useLocation, useNavigate } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import eventService from "../../services/EventService";
import cutinappService from "../../services/CutinappService";
import { AuthContext } from "../../context/AuthContext";
import { clearEventCreationDraft, readEventCreationDraft, writeEventCreationDraft } from "../../utils/eventCreationDraft";

const pad = (value) => String(value).padStart(2, "0");
const toLocalInput = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;

const minimumEventStart = () => {
  const date = new Date(Date.now() + 5 * 60 * 1000);
  date.setSeconds(0, 0);
  return date;
};

const defaultStart = () => {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0);
  return toLocalInput(date);
};

const addHours = (value, hours = 2) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  date.setHours(date.getHours() + hours);
  return toLocalInput(date);
};

const createInitialForm = () => {
  const start = defaultStart();
  return {
    production_id: "",
    title: "",
    description: "",
    address: "",
    google_maps_url: "",
    city: "",
    uf: "",
    venue: "",
    start_date: start,
    end_date: addHours(start, 2),
    max_attendees: "",
    contact_email: "",
    contact_phone: "",
    image: null,
  };
};

const firstError = (errors, field) => {
  const value = errors?.[field];
  if (Array.isArray(value)) return value[0] || "";
  return typeof value === "string" ? value : "";
};

const productionAddress = (production) => {
  if (!production) return "";
  if (production.formatted_address) return production.formatted_address;

  const street = [production.address, production.address_number]
    .filter((value) => String(value || "").trim())
    .join(", ");
  const details = [production.neighborhood, production.address_complement]
    .filter((value) => String(value || "").trim())
    .join(" - ");

  return [street, details].filter(Boolean).join(" · ") || production.location || "";
};

const priceLabel = (value) => {
  const price = Number(value);
  if (!Number.isFinite(price)) return "";
  return price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

export default function EventCreatePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const [form, setForm] = useState(createInitialForm);
  const [productions, setProductions] = useState([]);
  const [productionItems, setProductionItems] = useState([]);
  const [useProductionItems, setUseProductionItems] = useState(false);
  const [productionTemplateApplied, setProductionTemplateApplied] = useState(false);
  const [loadingProductionData, setLoadingProductionData] = useState(false);
  const [loadingProductionItems, setLoadingProductionItems] = useState(false);
  const [itemLoadError, setItemLoadError] = useState("");
  const [preview, setPreview] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingProductions, setLoadingProductions] = useState(true);
  const [quickProductionName, setQuickProductionName] = useState("");
  const [creatingQuickProduction, setCreatingQuickProduction] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [optionalDetailsOpen, setOptionalDetailsOpen] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const minStart = useMemo(() => toLocalInput(minimumEventStart()), []);
  const draftOwnerId = Number(user?.id || 0);

  useEffect(() => {
    if (!draftOwnerId) return;
    const draft = readEventCreationDraft(draftOwnerId);
    if (!draft?.form) return;

    setForm((current) => ({ ...current, ...draft.form, image: null }));
    setUseProductionItems(Boolean(draft.useProductionItems));
    setDraftRestored(true);
    try {
      window.PeterTecnetTelemetry?.track?.("producer_event_draft_restored", {
        label: "Rascunho de criação de evento recuperado",
        target: String(draft.form.production_id || "event_creation"),
        metadata: { activation_stage: "event_creation", next_step: "create_ticket" },
      });
    } catch (_) {
      // Telemetry must never interrupt producer onboarding.
    }
  }, [draftOwnerId]);

  useEffect(() => {
    if (!draftOwnerId || loading) return;
    const hasMeaningfulInput = Boolean(
      form.production_id || form.title.trim() || form.description.trim() || form.address.trim() || form.city.trim()
    );
    if (!hasMeaningfulInput) return;

    const timer = window.setTimeout(() => {
      writeEventCreationDraft(draftOwnerId, { form, useProductionItems });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [draftOwnerId, form, useProductionItems, loading]);

  useEffect(() => {
    let active = true;
    const selectedProduction = new URLSearchParams(location.search).get("productionId") || "";

    cutinappService.myProductions()
      .then(async (items) => {
        if (!active) return;
        setProductions(items);
        const requested = items.some((item) => String(item.id) === selectedProduction) ? selectedProduction : "";
        const fallback = requested || (items.length === 1 ? String(items[0].id) : "");
        setForm((current) => ({ ...current, production_id: fallback }));

        if (!fallback) return;

        const fallbackProduction = items.find((item) => String(item.id) === fallback);
        let production = fallbackProduction;
        try {
          production = await cutinappService.getProduction(fallback);
        } catch (fetchError) {
          if (!fallbackProduction) throw fetchError;
        }
        if (!active || !production) return;

        setForm((current) => ({
          ...current,
          production_id: fallback,
          title: current.title || production?.name || "",
          description: current.description || production?.description || "",
          venue: current.venue || production?.fantasy || production?.name || "",
          address: current.address || productionAddress(production),
          google_maps_url: current.google_maps_url || production?.google_maps_url || "",
          city: current.city || production?.city || "",
          uf: current.uf || String(production?.uf || "").toUpperCase().slice(0, 2),
          max_attendees: current.max_attendees || production?.capacity || "",
          contact_email: current.contact_email || production?.contact_email || production?.email || "",
          contact_phone: current.contact_phone || production?.contact_phone || production?.phone || "",
        }));
        setProductionTemplateApplied(true);
        try {
          window.PeterTecnetTelemetry?.track?.("producer_event_template_auto_applied", {
            label: "Dados da produção aplicados automaticamente",
            target: fallback,
            metadata: {
              activation_stage: "event_creation",
              next_step: "create_ticket",
              template_source: requested ? "requested_production" : "single_production",
            },
          });
        } catch (_) {
          // Telemetry must never interrupt producer onboarding.
        }
      })
      .catch((err) => active && setError(err?.message || "Não foi possível carregar suas produções."))
      .finally(() => active && setLoadingProductions(false));

    return () => { active = false; };
  }, [location.search]);

  useEffect(() => {
    if (!form.production_id) {
      setProductionItems([]);
      setUseProductionItems(false);
      setItemLoadError("");
      return undefined;
    }

    let active = true;
    setLoadingProductionItems(true);
    setItemLoadError("");

    cutinappService.productionItems(form.production_id)
      .then((items) => {
        if (!active) return;
        setProductionItems(items.filter((item) => item?.status === undefined || Boolean(item.status)));
      })
      .catch((err) => {
        if (!active) return;
        setProductionItems([]);
        setUseProductionItems(false);
        setItemLoadError(err?.message || "Não foi possível consultar os itens desta produção.");
      })
      .finally(() => active && setLoadingProductionItems(false));

    return () => { active = false; };
  }, [form.production_id]);

  useEffect(() => () => {
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
  }, [preview]);

  const startDate = form.start_date ? new Date(form.start_date) : null;
  const endDate = form.end_date ? new Date(form.end_date) : null;
  const minimumStartDate = minimumEventStart();
  const startTooSoonInvalid = submitted && startDate && startDate.getTime() < minimumStartDate.getTime();
  const dateInvalid = submitted && startDate && endDate && endDate.getTime() <= startDate.getTime();
  const ufInvalid = submitted && form.uf.trim().length !== 2;
  const capacityInvalid = submitted && form.max_attendees !== "" && Number(form.max_attendees) < 1;

  const requiredInvalid = submitted && {
    production_id: !form.production_id,
    title: form.title.trim().length < 2,
    description: !form.description.trim(),
    address: !form.address.trim(),
    city: !form.city.trim(),
    uf: !form.uf.trim(),
    start_date: !form.start_date || startTooSoonInvalid,
    end_date: !form.end_date || dateInvalid,
  };

  const canSubmit = useMemo(() => Boolean(
    form.production_id &&
    form.title.trim().length >= 2 &&
    form.description.trim() &&
    form.address.trim() &&
    form.city.trim() &&
    form.uf.trim().length === 2 &&
    form.start_date &&
    form.end_date
  ) && !loading, [form, loading]);

  const change = (event) => {
    const { name, value } = event.target;
    const normalized = name === "uf" ? value.toUpperCase().slice(0, 2) : value;

    if (name === "production_id") {
      setProductionTemplateApplied(false);
      setUseProductionItems(false);
    }

    setForm((current) => {
      const next = { ...current, [name]: normalized };
      if (name === "start_date" && normalized) {
        const suggestedEnd = addHours(normalized, 2);
        if (!current.end_date || new Date(current.end_date) <= new Date(normalized)) {
          next.end_date = suggestedEnd;
        }
      }
      return next;
    });

    setFieldErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });

    if (name === "production_id" && normalized) {
      void autoApplyProductionData(normalized);
    }
  };

  const autoApplyProductionData = async (productionId) => {
    if (!productionId) return;

    setLoadingProductionData(true);
    setError("");
    try {
      const fallback = productions.find((item) => String(item.id) === String(productionId));
      let production = fallback;
      try {
        production = await cutinappService.getProduction(productionId);
      } catch (fetchError) {
        if (!fallback) throw fetchError;
      }

      setForm((current) => {
        if (String(current.production_id) !== String(productionId)) return current;
        return {
          ...current,
          title: current.title || production?.name || "",
          description: current.description || production?.description || "",
          venue: current.venue || production?.fantasy || production?.name || "",
          address: current.address || productionAddress(production),
          google_maps_url: current.google_maps_url || production?.google_maps_url || "",
          city: current.city || production?.city || "",
          uf: current.uf || String(production?.uf || "").toUpperCase().slice(0, 2),
          max_attendees: current.max_attendees || production?.capacity || "",
          contact_email: current.contact_email || production?.contact_email || production?.email || "",
          contact_phone: current.contact_phone || production?.contact_phone || production?.phone || "",
        };
      });

      setProductionTemplateApplied(true);
      try {
        window.PeterTecnetTelemetry?.track?.("producer_event_template_auto_applied", {
          label: "Dados da produção aplicados automaticamente",
          target: String(productionId),
          metadata: {
            activation_stage: "event_creation",
            next_step: "create_ticket",
            template_source: "production_selection",
          },
        });
      } catch (_) {
        // Telemetry must never interrupt producer onboarding.
      }
    } catch (_) {
      // Automatic prefill is a convenience; manual entry must remain available.
    } finally {
      setLoadingProductionData(false);
    }
  };

  const applyProductionData = async () => {
    if (!form.production_id || loadingProductionData) return;

    setLoadingProductionData(true);
    setError("");
    try {
      const fallback = productions.find((item) => String(item.id) === String(form.production_id));
      let production = fallback;
      try {
        production = await cutinappService.getProduction(form.production_id);
      } catch (fetchError) {
        if (!fallback) throw fetchError;
      }

      setForm((current) => ({
        ...current,
        title: production?.name || current.title,
        description: production?.description || current.description,
        venue: production?.fantasy || production?.name || current.venue,
        address: productionAddress(production) || current.address,
        google_maps_url: production?.google_maps_url || current.google_maps_url,
        city: production?.city || current.city,
        uf: String(production?.uf || current.uf || "").toUpperCase().slice(0, 2),
        max_attendees: production?.capacity || current.max_attendees,
        contact_email: production?.contact_email || production?.email || current.contact_email,
        contact_phone: production?.contact_phone || production?.phone || current.contact_phone,
      }));

      setFieldErrors((current) => {
        const next = { ...current };
        ["title", "description", "venue", "address", "google_maps_url", "city", "uf", "max_attendees", "contact_email", "contact_phone"].forEach((field) => delete next[field]);
        return next;
      });
      setProductionTemplateApplied(true);
    } catch (err) {
      setError(err?.message || "Não foi possível usar os dados da produção neste evento.");
    } finally {
      setLoadingProductionData(false);
    }
  };

  const createQuickProduction = async (event) => {
    event.preventDefault();
    const name = quickProductionName.trim();
    if (name.length < 2 || creatingQuickProduction) return;

    setCreatingQuickProduction(true);
    setError("");
    try {
      const payload = new FormData();
      payload.append("name", name);
      payload.append("type", "independent");

      const response = await cutinappService.createProduction(payload);
      const production = response?.production || null;
      const productionId = Number(production?.id || 0);
      if (!productionId) throw new Error("A produção foi criada, mas não conseguimos vinculá-la ao evento.");

      const normalizedProduction = { ...production, id: productionId, name: production?.name || name };
      setProductions((current) => [...current, normalizedProduction]);
      setForm((current) => ({
        ...current,
        production_id: String(productionId),
        title: current.title || normalizedProduction.name,
        venue: current.venue || normalizedProduction.name,
      }));
      setQuickProductionName("");

      try {
        window.PeterTecnetTelemetry?.track?.("producer_inline_production_created", {
          label: normalizedProduction.name,
          target: String(productionId),
          metadata: {
            production_id: productionId,
            activation_stage: "event_creation",
            onboarding_path: "inline_quick",
            next_step: "event_create",
          },
        });
      } catch (_) {
        // Telemetry must never interrupt producer activation.
      }
    } catch (err) {
      setError(err?.message || "Não foi possível criar a produção agora.");
    } finally {
      setCreatingQuickProduction(false);
    }
  };

  const chooseImage = (event) => {
    const file = event.target.files?.[0] || null;
    if (file && file.size > 5 * 1024 * 1024) {
      setFieldErrors((current) => ({ ...current, image: ["A imagem do evento deve ter no máximo 5 MB."] }));
      return;
    }
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    setForm((current) => ({ ...current, image: file }));
    setPreview(file ? URL.createObjectURL(file) : "");
  };

  const submit = async (event) => {
    event.preventDefault();
    setSubmitted(true);
    setError("");
    setFieldErrors({});

    if (!canSubmit || dateInvalid || startTooSoonInvalid || ufInvalid || capacityInvalid) {
      if (startTooSoonInvalid) setError("Escolha um horário futuro para o início do evento.");
      else if (dateInvalid) setError("O término do evento precisa ser posterior ao início.");
      else setError("Revise os campos destacados antes de continuar.");
      return;
    }

    setLoading(true);
    try {
      const payload = new FormData();
      Object.entries(form).forEach(([key, value]) => {
        if (value !== null && String(value).trim() !== "") payload.append(key, value);
      });
      payload.append("use_production_items", useProductionItems ? "1" : "0");

      const response = await eventService.store(payload);
      const eventId = Number(response?.event?.id || 0);
      if (!eventId) throw new Error("A API informou sucesso, mas não retornou o evento criado.");
      if (response?.event?.is_published !== false) throw new Error("O evento deveria ter sido criado como rascunho, mas a API retornou outro estado.");
      if (draftOwnerId) clearEventCreationDraft(draftOwnerId);
      navigate(`/ticket/create?eventId=${eventId}`, { replace: true });
    } catch (err) {
      const errors = err?.errors || {};
      setFieldErrors(errors);
      if (["google_maps_url", "max_attendees", "contact_email", "contact_phone"].some((field) => errors?.[field])) {
        setOptionalDetailsOpen(true);
      }
      setError(err?.message || "Não foi possível criar o evento.");
    } finally {
      setLoading(false);
    }
  };

  const invalid = (field, local = false) => Boolean(local || firstError(fieldErrors, field));
  const selectedProduction = productions.find((item) => String(item.id) === String(form.production_id));

  return (
    <div className="cut-app-page">
      <NavlogComponent />
      {(loading || loadingProductions) && <ProcessingIndicatorComponent label={loading ? "Criando evento" : "Carregando produções"} />}

      <Container className="cut-page-container py-4 py-lg-5">
        <div className="cut-page-heading"><div><span className="cut-eyebrow">Área do produtor</span><h1>Novo evento</h1><p>Escolha a produção e reaproveite os dados que já estão cadastrados. Depois, altere somente o que for diferente neste evento.</p></div></div>
        {error && <Alert variant="danger">{error}</Alert>}
        {draftRestored && <Alert variant="info" dismissible onClose={() => setDraftRestored(false)}>Recuperamos o preenchimento deste evento para você continuar de onde parou.</Alert>}

        {!loadingProductions && productions.length === 0 ? (
          <Card className="cut-panel mx-auto" style={{ maxWidth: 720 }}>
            <Card.Body className="p-4 p-lg-5">
              <span className="cut-eyebrow">Ativação rápida</span>
              <h2 className="cut-section-title mt-2">Crie sua produção sem sair do evento</h2>
              <p className="text-secondary">Informe somente o nome agora. Assim que a produção for criada, você continua neste mesmo cadastro de evento e segue para o primeiro lote.</p>
              <Form onSubmit={createQuickProduction} className="mt-4">
                <Form.Group>
                  <Form.Label>Nome da produção *</Form.Label>
                  <Form.Control
                    value={quickProductionName}
                    onChange={(event) => setQuickProductionName(event.target.value)}
                    placeholder="Ex.: Peter Eventos"
                    autoComplete="organization"
                    autoFocus
                    minLength={2}
                    disabled={creatingQuickProduction}
                  />
                </Form.Group>
                <div className="d-flex flex-column flex-sm-row gap-2 mt-3">
                  <Button type="submit" disabled={quickProductionName.trim().length < 2 || creatingQuickProduction}>
                    {creatingQuickProduction ? "Criando produção..." : "Criar e continuar neste evento"}
                  </Button>
                  <Button type="button" variant="outline-light" onClick={() => navigate("/production/create")}>
                    Completar cadastro da produção
                  </Button>
                </div>
              </Form>
              <div className="cut-info-box mt-4">
                <strong>Sem cobrança para começar</strong>
                <span>A criação da produção não ativa plano ou taxa. A monetização continua vinculada às vendas e serviços do evento.</span>
              </div>
            </Card.Body>
          </Card>
        ) : (
          <Form onSubmit={submit} noValidate>
            <Row className="g-4">
              <Col lg={8}><Card className="cut-panel h-100"><Card.Body className="p-4 p-lg-5"><h2 className="cut-section-title">Informações do evento</h2><Row className="g-3">
                <Col xs={12}><Form.Group><Form.Label>Produção *</Form.Label><Form.Select name="production_id" value={form.production_id} onChange={change} isInvalid={invalid("production_id", requiredInvalid.production_id)}><option value="">Selecione</option>{productions.map((production) => <option key={production.id} value={production.id}>{production.name}</option>)}</Form.Select><Form.Control.Feedback type="invalid">{firstError(fieldErrors, "production_id") || "Selecione a produção responsável."}</Form.Control.Feedback></Form.Group></Col>

                {form.production_id && <Col xs={12}><div className="cut-info-box d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3"><div><strong>{productionTemplateApplied ? "Dados da produção aplicados" : "Cadastro rápido"}</strong><span>{productionTemplateApplied ? "Os campos continuam editáveis. Mude apenas o que for diferente neste evento." : `Use nome, descrição, local, endereço e contato de ${selectedProduction?.name || "sua produção"} como ponto de partida.`}</span></div><Button type="button" variant={productionTemplateApplied ? "outline-light" : "primary"} disabled={loadingProductionData} onClick={applyProductionData}>{loadingProductionData ? "Carregando..." : productionTemplateApplied ? "Aplicar novamente" : "Usar dados da produção"}</Button></div></Col>}

                <Col xs={12}><Form.Group><Form.Label>Nome do evento *</Form.Label><Form.Control name="title" value={form.title} onChange={change} placeholder="Ex.: Noite de Lançamento" isInvalid={invalid("title", requiredInvalid.title)} /><Form.Control.Feedback type="invalid">{firstError(fieldErrors, "title") || "Informe o nome do evento."}</Form.Control.Feedback></Form.Group></Col>
                <Col xs={12}><Form.Group><Form.Label>Descrição *</Form.Label><Form.Control as="textarea" rows={5} name="description" value={form.description} onChange={change} isInvalid={invalid("description", requiredInvalid.description)} /><Form.Control.Feedback type="invalid">{firstError(fieldErrors, "description") || "Descreva o evento."}</Form.Control.Feedback></Form.Group></Col>
                <Col md={6}><Form.Group><Form.Label>Início *</Form.Label><Form.Control type="datetime-local" min={minStart} name="start_date" value={form.start_date} onChange={change} isInvalid={invalid("start_date", requiredInvalid.start_date)} /><Form.Text>Eventos de hoje são permitidos. Escolha um horário futuro.</Form.Text><Form.Control.Feedback type="invalid">{firstError(fieldErrors, "start_date") || (startTooSoonInvalid ? "Escolha um horário futuro." : "Informe quando o evento começa.")}</Form.Control.Feedback></Form.Group></Col>
                <Col md={6}><Form.Group><Form.Label>Término *</Form.Label><Form.Control type="datetime-local" min={form.start_date || minStart} name="end_date" value={form.end_date} onChange={change} isInvalid={invalid("end_date", requiredInvalid.end_date)} /><Form.Text>É sugerido automaticamente 2 horas após o início.</Form.Text><Form.Control.Feedback type="invalid">{firstError(fieldErrors, "end_date") || (dateInvalid ? "O término precisa ser posterior ao início." : "Informe quando o evento termina.")}</Form.Control.Feedback></Form.Group></Col>
                <Col md={5}><Form.Group><Form.Label>Local</Form.Label><Form.Control name="venue" value={form.venue} onChange={change} placeholder="Nome do espaço" isInvalid={invalid("venue")} /><Form.Control.Feedback type="invalid">{firstError(fieldErrors, "venue")}</Form.Control.Feedback></Form.Group></Col>
                <Col md={7}><Form.Group><Form.Label>Endereço *</Form.Label><Form.Control name="address" value={form.address} onChange={change} placeholder="Rua, número e complemento" isInvalid={invalid("address", requiredInvalid.address)} /><Form.Control.Feedback type="invalid">{firstError(fieldErrors, "address") || "Informe o endereço do evento."}</Form.Control.Feedback></Form.Group></Col>
                <Col md={8}><Form.Group><Form.Label>Cidade *</Form.Label><Form.Control name="city" value={form.city} onChange={change} isInvalid={invalid("city", requiredInvalid.city)} /><Form.Control.Feedback type="invalid">{firstError(fieldErrors, "city") || "Informe a cidade do evento."}</Form.Control.Feedback></Form.Group></Col>
                <Col md={4}><Form.Group><Form.Label>UF *</Form.Label><Form.Control maxLength={2} name="uf" value={form.uf} onChange={change} isInvalid={invalid("uf", requiredInvalid.uf || ufInvalid)} /><Form.Control.Feedback type="invalid">{firstError(fieldErrors, "uf") || "Use 2 letras."}</Form.Control.Feedback></Form.Group></Col>

                <Col xs={12}>
                  <div className="cut-info-box">
                    <strong>Essencial concluído primeiro</strong>
                    <span>Maps, capacidade, contatos e itens são opcionais. Você pode completar esses detalhes agora ou depois, sem bloquear a criação do primeiro lote.</span>
                    <Button
                      type="button"
                      variant="outline-light"
                      size="sm"
                      className="mt-3 align-self-start"
                      aria-expanded={optionalDetailsOpen}
                      onClick={() => {
                        const nextOpen = !optionalDetailsOpen;
                        setOptionalDetailsOpen(nextOpen);
                        if (nextOpen) {
                          try {
                            window.PeterTecnetTelemetry?.track?.("producer_event_optional_details_opened", {
                              label: "Detalhes opcionais do evento abertos",
                              target: String(form.production_id || "event_creation"),
                              metadata: { activation_stage: "event_creation", next_step: "create_ticket" },
                            });
                          } catch (_) {
                            // Telemetry must never interrupt producer onboarding.
                          }
                        }
                      }}
                    >
                      {optionalDetailsOpen ? "Ocultar detalhes opcionais" : "Adicionar detalhes opcionais"}
                    </Button>
                  </div>
                </Col>

                {optionalDetailsOpen && <>
                  <Col xs={12}><Form.Group><Form.Label>Link do Google Maps</Form.Label><Form.Control type="url" name="google_maps_url" value={form.google_maps_url} onChange={change} placeholder="https://maps.app.goo.gl/... ou https://www.google.com/maps/..." isInvalid={invalid("google_maps_url")} /><Form.Text>Cole o link do local no Google Maps para facilitar a chegada do participante.</Form.Text><Form.Control.Feedback type="invalid">{firstError(fieldErrors, "google_maps_url")}</Form.Control.Feedback></Form.Group></Col>
                  <Col md={6}><Form.Group><Form.Label>Capacidade</Form.Label><Form.Control type="number" min="1" max="1000000" name="max_attendees" value={form.max_attendees} onChange={change} isInvalid={invalid("max_attendees", capacityInvalid)} /><Form.Text>Deixe vazio se não quiser controlar capacidade geral.</Form.Text><Form.Control.Feedback type="invalid">{firstError(fieldErrors, "max_attendees") || "A capacidade deve ser maior que zero."}</Form.Control.Feedback></Form.Group></Col>
                  <Col md={6}><Form.Group><Form.Label>E-mail de contato</Form.Label><Form.Control type="email" name="contact_email" value={form.contact_email} onChange={change} isInvalid={invalid("contact_email")} /><Form.Control.Feedback type="invalid">{firstError(fieldErrors, "contact_email")}</Form.Control.Feedback></Form.Group></Col>
                  <Col md={6}><Form.Group><Form.Label>Telefone de contato</Form.Label><Form.Control name="contact_phone" value={form.contact_phone} onChange={change} isInvalid={invalid("contact_phone")} /><Form.Control.Feedback type="invalid">{firstError(fieldErrors, "contact_phone")}</Form.Control.Feedback></Form.Group></Col>

                  {form.production_id && <Col xs={12}><div className="cut-info-box"><div className="d-flex align-items-start justify-content-between gap-3 flex-wrap"><div><strong>Itens da produção</strong><span>{loadingProductionItems ? "Consultando os itens cadastrados..." : productionItems.length > 0 ? `${productionItems.length} item(ns) ativo(s) estão disponíveis. Você pode usar os mesmos itens neste evento sem cadastrá-los novamente.` : "Esta produção ainda não possui itens ativos para reaproveitar."}</span></div><Form.Check type="switch" id="use-production-items" label="Usar os mesmos itens" checked={useProductionItems} disabled={loadingProductionItems || productionItems.length === 0} onChange={(event) => setUseProductionItems(event.target.checked)} /></div>{itemLoadError && <div className="text-warning small mt-2">{itemLoadError}</div>}{useProductionItems && productionItems.length > 0 && <div className="d-flex flex-wrap gap-2 mt-3">{productionItems.slice(0, 8).map((item) => <span key={item.id} className="badge rounded-pill text-bg-dark">{item.name}{item.price !== null && item.price !== undefined ? ` · ${priceLabel(item.price)}` : ""}</span>)}{productionItems.length > 8 && <span className="badge rounded-pill text-bg-dark">+{productionItems.length - 8} itens</span>}</div>}</div></Col>}
                </>}
              </Row></Card.Body></Card></Col>

              <Col lg={4}><Card className="cut-panel h-100"><Card.Body className="p-4"><h2 className="cut-section-title">Imagem do evento</h2>{preview ? <img src={preview} alt="Prévia do evento" className="cut-upload-preview cut-upload-preview--event" /> : <div className="cut-upload-placeholder"><i className="fa-regular fa-image" /><span>Adicione uma capa 16:9</span></div>}<Form.Control className="mt-3" type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseImage} isInvalid={invalid("image")} /><Form.Control.Feedback type="invalid">{firstError(fieldErrors, "image")}</Form.Control.Feedback><Form.Text>JPG, PNG ou WebP, até 5 MB.</Form.Text><div className="cut-info-box mt-4"><strong>Próxima etapa</strong><span>Depois de salvar, você configura o primeiro lote de ingressos e segue direto para a publicação.</span></div></Card.Body></Card></Col>
            </Row>

            <div className="cut-form-actions mt-4"><Button type="button" variant="outline-light" disabled={loading} onClick={() => navigate("/event/manage")}>Cancelar</Button><Button type="submit" disabled={loading}>{loading ? "Criando..." : "Criar rascunho e configurar primeiro lote"}</Button></div>
          </Form>
        )}
      </Container>
    </div>
  );
}
