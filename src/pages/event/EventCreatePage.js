import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import { useLocation, useNavigate } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import CityAutocompleteControl from "../../components/location/CityAutocompleteControl";
import eventService from "../../services/EventService";
import cutinappService from "../../services/CutinappService";
import { storageUrl } from "../../config";
import { AuthContext } from "../../context/AuthContext";
import { clearEventCreationDraft, readEventCreationDraft, writeEventCreationDraft } from "../../utils/eventCreationDraft";
import { showImportantAlert, showProducerAgreementRequired } from "../../utils/sweetAlert";

const pad = (value) => String(value).padStart(2, "0");
const toLocalInput = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;

const toDateInput = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const suggestedEditionDate = (event) => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(12, 0, 0, 0);

  const source = new Date(event?.start_date || "");
  if (Number.isNaN(source.getTime())) return toDateInput(tomorrow);

  source.setDate(source.getDate() + 7);
  source.setHours(12, 0, 0, 0);
  return toDateInput(source > tomorrow ? source : tomorrow);
};

const formatEventDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data não informada";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const eventCoverUrl = (image) => {
  if (!image) return "";
  const value = String(image);
  if (/^https?:\/\//i.test(value)) return value;
  return `${storageUrl}${value.replace(/^\//, "")}`;
};

const eventInitials = (title) => String(title || "EV")
  .trim()
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0]?.toUpperCase())
  .join("") || "EV";

const REUSE_EVENTS_PER_PAGE = 8;

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
  const [existingEvents, setExistingEvents] = useState([]);
  const [existingEventsLoading, setExistingEventsLoading] = useState(false);
  const [reusePickerOpen, setReusePickerOpen] = useState(false);
  const [reusePage, setReusePage] = useState(1);
  const [reuseLastPage, setReuseLastPage] = useState(1);
  const [reuseTotal, setReuseTotal] = useState(0);
  const [reuseLoadError, setReuseLoadError] = useState("");
  const [reuseReloadKey, setReuseReloadKey] = useState(0);
  const [reuseEventId, setReuseEventId] = useState("");
  const [reuseDate, setReuseDate] = useState("");
  const [reuseSearch, setReuseSearch] = useState("");
  const [reuseSearchQuery, setReuseSearchQuery] = useState("");
  const [selectedReuseEvent, setSelectedReuseEvent] = useState(null);
  const [reusingEvent, setReusingEvent] = useState(false);
  const minStart = useMemo(() => toLocalInput(minimumEventStart()), []);
  const draftOwnerId = Number(user?.id || 0);
  const agreementChecksRef = useRef(new Set());

  const agreementUrl = (productionId) => {
    const returnTo = `/event/create?productionId=${encodeURIComponent(String(productionId))}`;
    return `/producer/contracts?productionId=${encodeURIComponent(String(productionId))}&returnTo=${encodeURIComponent(returnTo)}`;
  };

  const openAgreement = (productionId) => {
    if (!productionId) return;
    navigate(agreementUrl(productionId));
  };

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
    if (!draftRestored) return;
    setDraftRestored(false);
    void showImportantAlert({
      title: "Rascunho recuperado",
      text: "Recuperamos o preenchimento deste evento para você continuar de onde parou.",
      icon: "info",
      confirmButtonText: "Continuar",
    });
  }, [draftRestored]);

  useEffect(() => {
    const productionId = String(form.production_id || "");
    if (!productionId || loadingProductions || agreementChecksRef.current.has(productionId)) return undefined;

    agreementChecksRef.current.add(productionId);
    let active = true;

    cutinappService.producerContract(productionId)
      .then(async (contract) => {
        if (!active || contract?.accepted) return;
        const production = productions.find((item) => String(item.id) === productionId);
        const result = await showProducerAgreementRequired({
          productionName: production?.name || "esta produção",
        });
        if (active && result?.isConfirmed) openAgreement(productionId);
      })
      .catch(() => {
        agreementChecksRef.current.delete(productionId);
      });

    return () => { active = false; };
  }, [form.production_id, loadingProductions, productions]);

  useEffect(() => {
    if (!error) return;
    const message = error;
    const productionId = String(form.production_id || "");
    const requiresAgreement = /termo de adesão|primeiro evento/i.test(message);
    setError("");

    void (async () => {
      if (requiresAgreement && productionId) {
        const production = productions.find((item) => String(item.id) === productionId);
        const result = await showProducerAgreementRequired({
          productionName: production?.name || "esta produção",
        });
        if (result?.isConfirmed) openAgreement(productionId);
        return;
      }

      await showImportantAlert({
        title: "Não foi possível continuar",
        text: message,
        icon: "error",
        confirmButtonText: "Entendi",
      });
    })();
  }, [error, form.production_id, productions]);

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

  const changeCityLocation = ({ city, uf, selected }) => {
    setForm((current) => ({
      ...current,
      city,
      uf: selected ? uf : "",
    }));

    setFieldErrors((current) => {
      if (!current.city && !(selected && current.uf)) return current;
      const next = { ...current };
      delete next.city;
      if (selected) delete next.uf;
      return next;
    });
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

  useEffect(() => {
    const handleGeneratedCover = (event) => {
      const file = event?.detail?.file;
      if (!(file instanceof File)) return;
      if (file.size > 5 * 1024 * 1024) {
        setFieldErrors((current) => ({ ...current, image: ["A imagem do evento deve ter no máximo 5 MB."] }));
        return;
      }
      setForm((current) => ({ ...current, image: file }));
      setFieldErrors((current) => {
        if (!current.image) return current;
        const next = { ...current };
        delete next.image;
        return next;
      });
      setPreview((current) => {
        if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
        return URL.createObjectURL(file);
      });
    };
    window.addEventListener("cutinapp:event-cover-selected", handleGeneratedCover);
    return () => window.removeEventListener("cutinapp:event-cover-selected", handleGeneratedCover);
  }, []);

  useEffect(() => {
    if (!reusePickerOpen) return undefined;

    const normalized = reuseSearch.trim();
    const timer = window.setTimeout(() => {
      setReusePage(1);
      setReuseSearchQuery(normalized);
    }, 320);

    return () => window.clearTimeout(timer);
  }, [reusePickerOpen, reuseSearch]);

  useEffect(() => {
    if (!reusePickerOpen) return undefined;

    let active = true;
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    setExistingEventsLoading(true);
    setReuseLoadError("");

    eventService.myEventsPage({
      page: reusePage,
      per_page: REUSE_EVENTS_PER_PAGE,
      q: reuseSearchQuery || undefined,
      mode: "picker",
    }, {
      signal: controller?.signal,
    })
      .then((pagination) => {
        if (!active) return;
        setExistingEvents(Array.isArray(pagination?.data) ? pagination.data : []);
        setReuseLastPage(Math.max(1, Number(pagination?.last_page) || 1));
        setReuseTotal(Math.max(0, Number(pagination?.total) || 0));
      })
      .catch((err) => {
        if (!active || err?.name === "CanceledError" || err?.code === "ERR_CANCELED") return;
        setExistingEvents([]);
        setReuseLastPage(1);
        setReuseTotal(0);
        setReuseLoadError(err?.message || "Não foi possível carregar seus eventos.");
      })
      .finally(() => {
        if (active) setExistingEventsLoading(false);
      });

    return () => {
      active = false;
      controller?.abort();
    };
  }, [reusePickerOpen, reusePage, reuseSearchQuery, reuseReloadKey]);

  const reusePages = useMemo(() => {
    const size = 5;
    let start = Math.max(1, reusePage - Math.floor(size / 2));
    let end = Math.min(reuseLastPage, start + size - 1);
    start = Math.max(1, end - size + 1);
    return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
  }, [reusePage, reuseLastPage]);

  const toggleReusePicker = () => {
    if (reusePickerOpen) {
      setReusePickerOpen(false);
      return;
    }

    setReusePage(1);
    setReuseLoadError("");
    setReusePickerOpen(true);
  };

  const chooseReuseEvent = (eventId) => {
    const source = existingEvents.find((item) => String(item.id) === String(eventId)) || null;
    setReuseEventId(eventId);
    setSelectedReuseEvent(source);
    setReuseDate(source ? suggestedEditionDate(source) : "");
  };

  const changeReusePage = (page) => {
    const nextPage = Math.min(Math.max(1, Number(page) || 1), reuseLastPage);
    if (nextPage === reusePage || existingEventsLoading) return;
    setReusePage(nextPage);
  };

  const reuseExistingEvent = async () => {
    if (!selectedReuseEvent) {
      await showImportantAlert({
        title: "Escolha um evento",
        text: "Selecione o evento que será usado como modelo para a nova edição.",
        icon: "warning",
        confirmButtonText: "Entendi",
      });
      return;
    }

    if (!reuseDate) {
      await showImportantAlert({
        title: "Escolha a nova data",
        text: "Informe a data da nova edição. O horário e a duração serão reaproveitados do evento original.",
        icon: "warning",
        confirmButtonText: "Entendi",
      });
      return;
    }

    if (toDateInput(selectedReuseEvent.start_date) === reuseDate) {
      await showImportantAlert({
        title: "Escolha outra data",
        text: "A nova edição precisa ter uma data diferente do evento original.",
        icon: "warning",
        confirmButtonText: "Entendi",
      });
      return;
    }

    setReusingEvent(true);
    try {
      const response = await eventService.duplicate(selectedReuseEvent.id, reuseDate);
      const duplicatedId = Number(response?.event?.id || 0);
      if (!duplicatedId) throw new Error("A nova edição foi criada, mas a API não retornou o identificador do evento.");
      navigate(`/event/edit/${duplicatedId}?duplicated=1&sourceEventId=${selectedReuseEvent.id}`, { replace: true });
    } catch (err) {
      const dateMessage = Array.isArray(err?.errors?.date) ? err.errors.date[0] : err?.errors?.date;
      await showImportantAlert({
        title: "Não foi possível criar a nova edição",
        text: dateMessage || err?.message || "Tente novamente em instantes.",
        icon: "error",
        confirmButtonText: "Entendi",
      });
    } finally {
      setReusingEvent(false);
    }
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
      {(loading || loadingProductions || reusingEvent) && <ProcessingIndicatorComponent label={reusingEvent ? "Criando nova edição" : loading ? "Criando evento" : "Carregando produções"} />}

      <Container className="cut-page-container py-4 py-lg-5">
        <div className="cut-page-heading"><div><span className="cut-eyebrow">Área do produtor</span><h1>Novo evento</h1><p>Crie do zero ou reaproveite um evento existente e altere somente a data da nova edição.</p></div></div>

        <Card className="cut-panel cut-event-reuse-card mb-4">
          <Card.Body className="p-4">
            <div className="cut-event-reuse-head">
              <div className="cut-event-reuse-icon"><i className="fa-regular fa-copy" /></div>
              <div className="cut-event-reuse-head-copy">
                <span className="cut-eyebrow">Atalho para eventos recorrentes</span>
                <h2 className="cut-section-title mb-1">Usar um evento já criado</h2>
                <p className="mb-0">
                  {reusePickerOpen
                    ? "Escolha um evento, informe a nova data e a Cutinapp reaproveita o restante para você."
                    : "Os eventos só são carregados quando você abrir a seleção, deixando esta página mais rápida."}
                </p>
              </div>
              <Button
                type="button"
                variant={reusePickerOpen ? "outline-light" : "primary"}
                className="cut-event-reuse-toggle"
                onClick={toggleReusePicker}
                aria-expanded={reusePickerOpen}
                aria-controls="cut-event-reuse-picker"
              >
                <i className={reusePickerOpen ? "fa-solid fa-chevron-up" : "fa-regular fa-images"} />
                <span>{reusePickerOpen ? "Fechar seleção" : "Selecionar evento"}</span>
              </Button>
            </div>

            {reusePickerOpen && (
              <div id="cut-event-reuse-picker" className="cut-event-reuse-picker mt-4">
                <div className="cut-event-reuse-toolbar">
                  <div>
                    <strong>Escolha visualmente o evento</strong>
                    <span>
                      {existingEventsLoading
                        ? "Carregando somente esta página de eventos..."
                        : reuseTotal > 0
                          ? reuseTotal + " evento(s) encontrado(s) · página " + reusePage + " de " + reuseLastPage
                          : "Pesquise pelo evento, produção, cidade ou local."}
                    </span>
                  </div>
                  <div className="cut-event-reuse-search">
                    <i className="fa-solid fa-magnifying-glass" />
                    <Form.Control
                      value={reuseSearch}
                      onChange={(event) => setReuseSearch(event.target.value)}
                      placeholder="Buscar evento, produção, cidade ou local"
                      aria-label="Buscar evento para reutilizar"
                      disabled={reusingEvent}
                    />
                  </div>
                </div>

                {existingEventsLoading && (
                  <div className="cut-event-reuse-loading" role="status" aria-live="polite">
                    <i className="fa-solid fa-circle-notch fa-spin" aria-hidden="true" />
                    <div>
                      <strong>Carregando eventos</strong>
                      <span>Buscando apenas {REUSE_EVENTS_PER_PAGE} por vez para manter a página leve.</span>
                    </div>
                  </div>
                )}

                {!existingEventsLoading && reuseLoadError && (
                  <div className="cut-event-reuse-error" role="alert">
                    <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
                    <div>
                      <strong>Não foi possível carregar os eventos</strong>
                      <span>{reuseLoadError}</span>
                    </div>
                    <Button type="button" variant="outline-light" size="sm" onClick={() => setReuseReloadKey((value) => value + 1)}>
                      Tentar novamente
                    </Button>
                  </div>
                )}

                {!existingEventsLoading && !reuseLoadError && existingEvents.length > 0 && (
                  <>
                    <div className="cut-event-reuse-gallery" role="listbox" aria-label="Eventos disponíveis para reutilizar">
                      {existingEvents.map((item) => {
                        const selected = String(item.id) === String(reuseEventId);
                        const cover = eventCoverUrl(item.image);
                        return (
                          <button
                            key={item.id}
                            type="button"
                            className={"cut-event-reuse-option " + (selected ? "is-selected" : "")}
                            onClick={() => chooseReuseEvent(String(item.id))}
                            disabled={reusingEvent}
                            role="option"
                            aria-selected={selected}
                          >
                            <span className="cut-event-reuse-cover">
                              {cover ? (
                                <img src={cover} alt="" loading="lazy" />
                              ) : (
                                <span className="cut-event-reuse-fallback" aria-hidden="true">{eventInitials(item.title)}</span>
                              )}
                              <span className={"cut-event-reuse-state " + (item.is_published ? "is-published" : "is-draft")}>
                                {item.is_published ? "Publicado" : "Rascunho"}
                              </span>
                              <span className="cut-event-reuse-check" aria-hidden="true">
                                <i className={selected ? "fa-solid fa-circle-check" : "fa-regular fa-circle"} />
                              </span>
                            </span>
                            <span className="cut-event-reuse-option-body">
                              <strong>{item.title}</strong>
                              <span className="cut-event-reuse-production">{item.production?.name || "Produção"}</span>
                              <span className="cut-event-reuse-detail"><i className="fa-regular fa-calendar" /> {formatEventDate(item.start_date)}</span>
                              {(item.city || item.venue) && <span className="cut-event-reuse-detail"><i className="fa-solid fa-location-dot" /> {[item.venue, item.city].filter(Boolean).join(" · ")}</span>}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {reuseLastPage > 1 && (
                      <nav className="cut-event-reuse-pagination" aria-label="Paginação dos eventos">
                        <Button
                          type="button"
                          variant="outline-light"
                          size="sm"
                          disabled={reusePage <= 1}
                          onClick={() => changeReusePage(reusePage - 1)}
                          aria-label="Página anterior"
                        >
                          <i className="fa-solid fa-chevron-left" />
                          <span>Anterior</span>
                        </Button>

                        <div className="cut-event-reuse-page-numbers">
                          {reusePages.map((page) => (
                            <button
                              key={page}
                              type="button"
                              className={page === reusePage ? "is-active" : ""}
                              onClick={() => changeReusePage(page)}
                              aria-current={page === reusePage ? "page" : undefined}
                              aria-label={"Ir para página " + page}
                            >
                              {page}
                            </button>
                          ))}
                        </div>

                        <Button
                          type="button"
                          variant="outline-light"
                          size="sm"
                          disabled={reusePage >= reuseLastPage}
                          onClick={() => changeReusePage(reusePage + 1)}
                          aria-label="Próxima página"
                        >
                          <span>Próxima</span>
                          <i className="fa-solid fa-chevron-right" />
                        </Button>
                      </nav>
                    )}
                  </>
                )}

                {!existingEventsLoading && !reuseLoadError && existingEvents.length === 0 && (
                  <div className="cut-event-reuse-empty">
                    <i className="fa-regular fa-calendar-xmark" />
                    <strong>{reuseSearchQuery ? "Nenhum evento encontrado" : "Você ainda não possui eventos para reutilizar"}</strong>
                    <span>{reuseSearchQuery ? "Tente outro nome, produção, cidade ou local." : "Crie este evento normalmente e ele poderá ser reutilizado nas próximas edições."}</span>
                  </div>
                )}
              </div>
            )}

            {selectedReuseEvent && (
              <div className="cut-event-reuse-selection mt-3">
                <div className="cut-event-reuse-selection-main">
                  <span className="cut-event-reuse-selection-thumb">
                    {eventCoverUrl(selectedReuseEvent.image)
                      ? <img src={eventCoverUrl(selectedReuseEvent.image)} alt="" />
                      : <span>{eventInitials(selectedReuseEvent.title)}</span>}
                  </span>
                  <div>
                    <span className="cut-eyebrow">Evento selecionado</span>
                    <strong>{selectedReuseEvent.title}</strong>
                    <small>{selectedReuseEvent.production?.name || "Produção"} · original em {formatEventDate(selectedReuseEvent.start_date)}</small>
                  </div>
                </div>
                <div className="cut-event-reuse-selection-action">
                  <Form.Group>
                    <Form.Label>Nova data</Form.Label>
                    <Form.Control
                      type="date"
                      min={toDateInput(new Date(Date.now() + 24 * 60 * 60 * 1000))}
                      value={reuseDate}
                      onChange={(event) => setReuseDate(event.target.value)}
                      disabled={reusingEvent}
                    />
                  </Form.Group>
                  <Button
                    type="button"
                    className="cut-event-reuse-action"
                    onClick={reuseExistingEvent}
                    disabled={!reuseDate || reusingEvent}
                  >
                    <i className="fa-regular fa-copy me-2" />
                    {reusingEvent ? "Criando..." : "Criar nova edição"}
                  </Button>
                </div>
                <div className="cut-event-reuse-tags">
                  <span><i className="fa-regular fa-image" /> Arte</span>
                  <span><i className="fa-solid fa-ticket" /> Ingressos</span>
                  <span><i className="fa-solid fa-bag-shopping" /> Produtos</span>
                  <span><i className="fa-solid fa-people-group" /> Line-up</span>
                </div>
                <small className="cut-event-reuse-note">A nova edição reaproveita os dados do evento. Vendas, participantes, check-ins e histórico começam zerados.</small>
              </div>
            )}
          </Card.Body>
        </Card>

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
                <Col md={8}>
                  <Form.Group className="cut-autocomplete">
                    <Form.Label>Cidade *</Form.Label>
                    <CityAutocompleteControl
                      value={form.city}
                      onChange={changeCityLocation}
                      isInvalid={invalid("city", requiredInvalid.city)}
                      placeholder="Digite ao menos 2 letras"
                      required
                    />
                    {invalid("city", requiredInvalid.city) && <div className="invalid-feedback d-block">{firstError(fieldErrors, "city") || "Informe a cidade do evento."}</div>}
                    <Form.Text>Selecione a cidade na lista para preencher a UF automaticamente.</Form.Text>
                  </Form.Group>
                </Col>
                <Col md={4}><Form.Group><Form.Label>UF *</Form.Label><Form.Control maxLength={2} name="uf" value={form.uf} onChange={change} placeholder="UF" isInvalid={invalid("uf", requiredInvalid.uf || ufInvalid)} /><Form.Control.Feedback type="invalid">{firstError(fieldErrors, "uf") || "Use 2 letras."}</Form.Control.Feedback></Form.Group></Col>

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

              <Col lg={4}><Card className="cut-panel h-100"><Card.Body className="p-4"><h2 className="cut-section-title">Imagem do evento</h2>{preview ? <img src={preview} alt="Prévia do evento" className="cut-upload-preview cut-upload-preview--event" /> : <div className="cut-upload-placeholder"><i className="fa-regular fa-image" /><span>Adicione uma capa 16:9</span></div>}<Form.Control className="mt-3" name="image" data-event-image-input="true" type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseImage} isInvalid={invalid("image")} /><Form.Control.Feedback type="invalid">{firstError(fieldErrors, "image")}</Form.Control.Feedback><Form.Text>JPG, PNG ou WebP, até 5 MB.</Form.Text><div className="cut-info-box mt-4"><strong>Próxima etapa</strong><span>Depois de salvar, você configura o primeiro lote de ingressos e segue direto para a publicação.</span></div></Card.Body></Card></Col>
            </Row>

            <div className="cut-form-actions mt-4"><Button type="button" variant="outline-light" disabled={loading} onClick={() => navigate("/event/manage")}>Cancelar</Button><Button type="submit" disabled={loading}>{loading ? "Criando..." : "Criar rascunho e configurar primeiro lote"}</Button></div>
          </Form>
        )}
      </Container>
    </div>
  );
}
