import React, { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Container, Dropdown, Form, Modal, ProgressBar } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import eventService from "../../services/EventService";
import eventBulkService from "../../services/EventBulkService";
import cutinappService from "../../services/CutinappService";
import { storageUrl } from "../../config";
import { sellableTicketCount } from "../../utils/eventSalesReadiness";
import ProducerEventCard from "../../components/event/ProducerEventCard";
import { EventQuickView } from "../../components/event/EventManagerEnhancements";
import {
  EVENT_MANAGER_PINS_KEY,
  EVENT_MANAGER_PREFERENCES_KEY,
  compareSmartRanks,
  eventHealth,
  eventOperationalMetrics,
  eventPerformance,
  eventTemporalGroup,
  moneyBR,
  smartEventRank,
} from "../../utils/eventManagerInsights";
import "./EventManagePage.css";
import "./EventManagePageSorting.css";

const collator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

const WEEK_DAYS = [
  { value: 1, label: "Segunda-feira" },
  { value: 2, label: "Terça-feira" },
  { value: 3, label: "Quarta-feira" },
  { value: 4, label: "Quinta-feira" },
  { value: 5, label: "Sexta-feira" },
  { value: 6, label: "Sábado" },
  { value: 0, label: "Domingo" },
];

const SORT_COLUMNS = [
  { key: "smart", label: "Prioridade" },
  { key: "event", label: "Evento" },
  { key: "production", label: "Produção" },
  { key: "date", label: "Data" },
  { key: "location", label: "Local" },
  { key: "status", label: "Status" },
  { key: "tickets", label: "Ingressos" },
  { key: "revenue", label: "Faturamento" },
  { key: "sales", label: "Vendas" },
  { key: "health", label: "Saúde" },
  { key: "readiness", label: "Preparação" },
  { key: "nextAction", label: "Próxima ação" },
];

const formatDate = (value) => value
  ? new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
  : "Data não informada";

const toDateInput = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const mediaUrl = (path) => {
  if (!path) return "";
  const value = String(path);
  if (/^https?:\/\//i.test(value)) return value;
  return `${storageUrl}${value.replace(/^\//, "")}`;
};

const eventLocation = (event) => event?.venue || event?.address || event?.city || "Não informado";

const initialsFor = (value, fallback = "EV") => {
  const initials = String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return initials || fallback;
};

const suggestedDuplicateDate = (event) => {
  const source = new Date(event?.start_date);
  const candidate = Number.isNaN(source.getTime()) ? new Date() : new Date(source);
  candidate.setDate(candidate.getDate() + 7);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  if (candidate < tomorrow) return toDateInput(tomorrow);
  return toDateInput(candidate);
};

const buildProducerShareUrl = (event, channel) => {
  if (!event?.slug) return "";
  const url = new URL(`/event/${event.slug}`, window.location.origin);
  url.searchParams.set("utm_source", "cutinapp_producer");
  url.searchParams.set("utm_medium", String(channel || "share"));
  url.searchParams.set("utm_campaign", "first_sale");
  url.searchParams.set("utm_content", String(event.id || event.slug));
  return url.toString();
};

const writeClipboard = async (text) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!copied) throw new Error("Clipboard indisponível");
};

const trackProducerActivation = (type, event, metadata = {}) => {
  try {
    window.PeterTecnetTelemetry?.track?.(type, {
      label: event?.title || "Evento",
      target: event?.slug || String(event?.id || ""),
      metadata: {
        event_id: Number(event?.id || 0),
        production_id: Number(event?.production?.id || event?.production_id || 0),
        ...metadata,
      },
    });
  } catch (_) {
    // Telemetry must never interrupt producer activation.
  }
};

const hasEventBasics = (event) => Boolean(
  String(event?.title || "").trim()
  && event?.start_date
  && String(event?.venue || event?.address || "").trim()
);

const isBulkPublishable = (event) => Boolean(
  event
  && !event.is_cancelled
  && !event.is_published
  && hasEventBasics(event)
  && sellableTicketCount(event) > 0
);

const getSalesReadiness = (event) => {
  const hasBasics = hasEventBasics(event);
  const hasTickets = Number(event?.tickets_count || 0) > 0;
  const hasSellableTickets = sellableTicketCount(event) > 0;
  const isPublished = Boolean(event?.is_published);
  const completed = [hasBasics, hasSellableTickets, isPublished].filter(Boolean).length;

  if (!hasBasics) {
    return {
      completed,
      title: "Completar dados",
      label: "Faltam data, horário ou local.",
      action: "Completar",
      icon: "fa-solid fa-pen",
      route: `/event/edit/${event.id}`,
    };
  }

  if (!hasTickets) {
    return {
      completed,
      title: "Criar ingressos",
      label: "Crie o primeiro lote para vender.",
      action: "Criar lote",
      icon: "fa-solid fa-ticket",
      route: `/ticket/create?eventId=${event.id}`,
    };
  }

  if (!hasSellableTickets) {
    return {
      completed,
      title: "Revisar ingressos",
      label: "Os lotes estão sem estoque ou com vendas encerradas.",
      action: "Novo lote",
      icon: "fa-solid fa-ticket",
      route: `/ticket/create?eventId=${event.id}`,
    };
  }

  if (!isPublished) {
    return {
      completed,
      title: "Publicar evento",
      label: "Tudo configurado para colocar no ar.",
      action: "Publicar",
      icon: "fa-solid fa-rocket",
      mode: "publish",
      route: null,
    };
  }

  return {
    completed,
    title: "Divulgar e vender",
    label: "Evento no ar e pronto para receber vendas.",
    action: "WhatsApp",
    icon: "fa-brands fa-whatsapp",
    mode: "whatsapp",
    route: null,
  };
};

const getStatus = (event) => {
  if (event?.is_cancelled) return { key: "cancelled", label: "Cancelado", variant: "danger" };
  if (event?.is_published) return { key: "published", label: "Publicado", variant: "success" };
  return { key: "draft", label: "Rascunho", variant: "secondary" };
};

const sortValue = (event, key) => {
  const readiness = getSalesReadiness(event);
  switch (key) {
    case "event":
      return String(event?.title || "");
    case "production":
      return String(event?.production?.name || "");
    case "date": {
      const timestamp = new Date(event?.start_date || "").getTime();
      return Number.isNaN(timestamp) ? null : timestamp;
    }
    case "location":
      return eventLocation(event);
    case "status":
      return getStatus(event).label;
    case "tickets":
      return Number(event?.tickets_count || 0);
    case "revenue":
      return eventOperationalMetrics(event).grossSales;
    case "sales":
      return eventOperationalMetrics(event).ticketsSold;
    case "health":
      return eventHealth(event).score;
    case "readiness":
      return Number(readiness.completed || 0);
    case "nextAction":
      return String(event?.is_cancelled ? "Evento cancelado" : readiness.title || "");
    default:
      return "";
  }
};

const compareSortValues = (left, right, direction) => {
  const leftMissing = left === null || left === undefined || left === "";
  const rightMissing = right === null || right === undefined || right === "";

  if (leftMissing && rightMissing) return 0;
  if (leftMissing) return 1;
  if (rightMissing) return -1;

  const multiplier = direction === "desc" ? -1 : 1;
  if (typeof left === "number" && typeof right === "number") {
    return (left - right) * multiplier;
  }

  return collator.compare(String(left), String(right)) * multiplier;
};

export default function EventManagePage() {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [eventToDuplicate, setEventToDuplicate] = useState(null);
  const [eventToAgenda, setEventToAgenda] = useState(null);
  const [agendaDay, setAgendaDay] = useState(1);
  const [agendaGenerationMode, setAgendaGenerationMode] = useState("delayed");
  const [agendaDelayDays, setAgendaDelayDays] = useState(1);
  const [agendaWeeks, setAgendaWeeks] = useState(1);
  const [agendaError, setAgendaError] = useState("");
  const [duplicateDate, setDuplicateDate] = useState("");
  const [duplicateError, setDuplicateError] = useState("");
  const [eventToDelete, setEventToDelete] = useState(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [publishedEvent, setPublishedEvent] = useState(null);
  const [copiedEventId, setCopiedEventId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [productionFilter, setProductionFilter] = useState("all");
  const [cityFilter, setCityFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [performanceFilter, setPerformanceFilter] = useState("all");
  const [viewMode, setViewMode] = useState("visual");
  const [groupByPeriod, setGroupByPeriod] = useState(true);
  const [sortConfig, setSortConfig] = useState({ key: "smart", direction: "asc" });
  const [pinnedEventIds, setPinnedEventIds] = useState([]);
  const [quickEvent, setQuickEvent] = useState(null);
  const [displayLimit, setDisplayLimit] = useState(24);
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [bulkTargetProductionId, setBulkTargetProductionId] = useState("");
  const [bulkActionError, setBulkActionError] = useState("");
  const [bulkPublishOpen, setBulkPublishOpen] = useState(false);
  const [bulkPublishing, setBulkPublishing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0, current: "" });
  const [bulkResult, setBulkResult] = useState(null);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [deleteAllConfirmation, setDeleteAllConfirmation] = useState("");
  const [selectedEventIds, setSelectedEventIds] = useState([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteConfirmation, setBulkDeleteConfirmation] = useState("");
  const [bulkDeleteError, setBulkDeleteError] = useState("");

  const load = async () => setEvents(await eventService.myEvents());

  useEffect(() => {
    let active = true;
    eventService.myEvents()
      .then((items) => active && setEvents(items))
      .catch((err) => active && setError(err?.message || "Não foi possível carregar seus eventos."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const handleSeriesCreated = () => {
      setLoading(true);
      eventService.myEvents()
        .then((items) => {
          setEvents(items);
          setSuccess("Agenda criada. As novas edições já aparecem na tabela.");
        })
        .catch((err) => setError(err?.message || "A agenda foi criada, mas não foi possível atualizar a lista."))
        .finally(() => setLoading(false));
    };

    window.addEventListener("cutinapp:event-series-created", handleSeriesCreated);
    return () => window.removeEventListener("cutinapp:event-series-created", handleSeriesCreated);
  }, []);

  useEffect(() => {
    const existingIds = new Set(events.map((event) => Number(event.id)));
    setSelectedEventIds((current) => current.filter((id) => existingIds.has(Number(id))));
  }, [events]);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(EVENT_MANAGER_PREFERENCES_KEY) || "null");
      if (saved && typeof saved === "object") {
        if (typeof saved.searchTerm === "string") setSearchTerm(saved.searchTerm);
        if (typeof saved.statusFilter === "string") setStatusFilter(saved.statusFilter);
        if (typeof saved.productionFilter === "string") setProductionFilter(saved.productionFilter);
        if (typeof saved.cityFilter === "string") setCityFilter(saved.cityFilter);
        if (typeof saved.periodFilter === "string") setPeriodFilter(saved.periodFilter);
        if (typeof saved.performanceFilter === "string") setPerformanceFilter(saved.performanceFilter);
        if (saved.viewMode === "compact" || saved.viewMode === "visual") setViewMode(saved.viewMode);
        if (typeof saved.groupByPeriod === "boolean") setGroupByPeriod(saved.groupByPeriod);
        if (saved.sortConfig?.key) setSortConfig(saved.sortConfig);
      }
    } catch (_) {
      // Preferências locais não podem bloquear a gestão dos eventos.
    }

    try {
      const pins = JSON.parse(window.localStorage.getItem(EVENT_MANAGER_PINS_KEY) || "[]");
      if (Array.isArray(pins)) setPinnedEventIds(pins.map(Number).filter(Number.isFinite));
    } catch (_) {
      // Pins são conveniência local.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(EVENT_MANAGER_PREFERENCES_KEY, JSON.stringify({
        searchTerm,
        statusFilter,
        productionFilter,
        cityFilter,
        periodFilter,
        performanceFilter,
        viewMode,
        groupByPeriod,
        sortConfig,
      }));
    } catch (_) {
      // Persistência local é opcional.
    }
  }, [searchTerm, statusFilter, productionFilter, cityFilter, periodFilter, performanceFilter, viewMode, groupByPeriod, sortConfig]);

  useEffect(() => {
    try {
      window.localStorage.setItem(EVENT_MANAGER_PINS_KEY, JSON.stringify(pinnedEventIds));
    } catch (_) {
      // Persistência local é opcional.
    }
  }, [pinnedEventIds]);

  useEffect(() => {
    setDisplayLimit(24);
  }, [searchTerm, statusFilter, productionFilter, cityFilter, periodFilter, performanceFilter, sortConfig, groupByPeriod]);

  const togglePinnedEvent = (eventId) => {
    const id = Number(eventId);
    setPinnedEventIds((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : [id, ...current]);
  };

  const publication = async (event) => {
    setBusyId(event.id);
    setError("");
    setSuccess("");
    try {
      const response = event.is_published
        ? await cutinappService.unpublishEvent(event.id)
        : await cutinappService.publishEvent(event.id);
      await load();
      if (!event.is_published) {
        trackProducerActivation("producer_event_published", event, { activation_stage: "published" });
        setCopiedEventId(null);
        setPublishedEvent({ ...event, is_published: true, slug: response?.event?.slug || event.slug });
      }
      setSuccess(event.is_published
        ? (response.message || "Evento retirado da publicação.")
        : "Evento publicado. Agora compartilhe a página pública para buscar a primeira venda.");
    } catch (err) {
      setError(err?.message || "Não foi possível alterar a publicação do evento.");
    } finally {
      setBusyId(null);
    }
  };

  const copyLink = async (event) => {
    if (!event?.is_published || !event?.slug) return;
    setError("");

    try {
      const url = buildProducerShareUrl(event, "clipboard");
      await writeClipboard(url);
      trackProducerActivation("producer_event_shared", event, { channel: "clipboard", activation_stage: "distribution", campaign: "first_sale" });
      setCopiedEventId(event.id);
      setSuccess("Link de venda rastreável copiado.");
    } catch (_) {
      setError("Não foi possível copiar o link neste navegador.");
    }
  };

  const share = async (event) => {
    if (!event.is_published || !event.slug) return;
    try {
      if (navigator.share) {
        const url = buildProducerShareUrl(event, "native_share");
        await navigator.share({ title: event.title, url });
        trackProducerActivation("producer_event_shared", event, { channel: "native_share", activation_stage: "distribution", campaign: "first_sale" });
      } else {
        const url = buildProducerShareUrl(event, "clipboard");
        await writeClipboard(url);
        trackProducerActivation("producer_event_shared", event, { channel: "clipboard", activation_stage: "distribution", campaign: "first_sale" });
        setCopiedEventId(event.id);
        setSuccess("Link de venda rastreável copiado.");
      }
    } catch (err) {
      if (err?.name !== "AbortError") setError("Não foi possível compartilhar o link deste navegador.");
    }
  };

  const shareWhatsApp = (event) => {
    if (!event.is_published || !event.slug) return;
    const url = buildProducerShareUrl(event, "whatsapp");
    const when = event.start_date ? formatDate(event.start_date) : "";
    const place = event.venue || event.city || "";
    const details = [when, place].filter(Boolean).join(" · ");
    const message = `🎟️ ${event.title}${details ? `\n${details}` : ""}\nIngressos disponíveis na Cutinapp: ${url}`;
    trackProducerActivation("producer_event_shared", event, { channel: "whatsapp", activation_stage: "distribution", campaign: "first_sale" });
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  };

  const openDuplicate = (event) => {
    setEventToDuplicate(event);
    setDuplicateDate(suggestedDuplicateDate(event));
    setDuplicateError("");
    setError("");
    setSuccess("");
  };

  const closeDuplicate = () => {
    if (String(busyId).startsWith("duplicate-")) return;
    setEventToDuplicate(null);
    setDuplicateDate("");
    setDuplicateError("");
  };

  const duplicate = async () => {
    if (!eventToDuplicate || !duplicateDate) {
      setDuplicateError("Escolha a nova data do evento.");
      return;
    }

    const sourceDate = toDateInput(eventToDuplicate.start_date);
    if (sourceDate === duplicateDate) {
      setDuplicateError("Escolha uma data diferente da data do evento original.");
      return;
    }

    const currentEvent = eventToDuplicate;
    setBusyId(`duplicate-${currentEvent.id}`);
    setDuplicateError("");
    setError("");
    setSuccess("");

    try {
      const response = await eventService.duplicate(currentEvent.id, duplicateDate);
      await load();
      setEventToDuplicate(null);
      setDuplicateDate("");
      setSuccess(response.message || "Evento duplicado como rascunho.");
    } catch (err) {
      const dateMessage = Array.isArray(err?.errors?.date) ? err.errors.date[0] : err?.errors?.date;
      setDuplicateError(dateMessage || err?.message || "Não foi possível duplicar o evento.");
    } finally {
      setBusyId(null);
    }
  };

  const openAgenda = (event) => {
    if (!event || busyId || bulkPublishing) return;
    const sourceDate = new Date(event.start_date || "");
    const suggestedDay = Number.isNaN(sourceDate.getTime()) ? 1 : sourceDate.getDay();
    setEventToAgenda(event);
    setAgendaDay(suggestedDay);
    setAgendaGenerationMode("delayed");
    setAgendaDelayDays(1);
    setAgendaWeeks(1);
    setAgendaError("");
    setError("");
    setSuccess("");
  };

  const closeAgenda = () => {
    if (String(busyId).startsWith("agenda-")) return;
    setEventToAgenda(null);
    setAgendaError("");
  };

  const addToAgenda = async () => {
    if (!eventToAgenda) return;
    const productionId = Number(eventToAgenda?.production?.id || eventToAgenda?.production_id || 0);
    if (!productionId) {
      setAgendaError("Este evento não está vinculado a uma produção válida.");
      return;
    }

    setBusyId(`agenda-${eventToAgenda.id}`);
    setAgendaError("");
    setError("");
    setSuccess("");

    try {
      const response = await eventService.createAgendaItem(productionId, {
        event_id: Number(eventToAgenda.id),
        day_of_week: Number(agendaDay),
        generation_mode: agendaGenerationMode,
        generation_delay_days: Number(agendaDelayDays),
        generation_weeks: Number(agendaWeeks),
        is_active: true,
      });

      const dayLabel = WEEK_DAYS.find((day) => day.value === Number(agendaDay))?.label || "dia escolhido";
      const modeText = agendaGenerationMode === "immediate"
        ? `criando até ${agendaWeeks} semana(s) de uma vez`
        : `repondo após ${agendaDelayDays} dia(s), mantendo até ${agendaWeeks} semana(s)`;

      setEventToAgenda(null);
      setSuccess(response?.message
        ? `${response.message} ${dayLabel}: ${modeText}.`
        : `${eventToAgenda.title} definido como evento fixo de ${dayLabel}, ${modeText}.`);
    } catch (err) {
      const validation = err?.response?.data?.errors;
      const first = validation && Object.values(validation).flat().find(Boolean);
      setAgendaError(first || err?.response?.data?.message || err?.message || "Não foi possível adicionar o evento à agenda semanal.");
    } finally {
      setBusyId(null);
    }
  };

  const openDeleteEvent = (event) => {
    if (!event || busyId || bulkPublishing) return;
    setEventToDelete(event);
    setDeleteConfirmation("");
    setDeleteError("");
    setError("");
    setSuccess("");
  };

  const closeDeleteEvent = () => {
    if (/^delete-\d+$/.test(String(busyId))) return;
    setEventToDelete(null);
    setDeleteConfirmation("");
    setDeleteError("");
  };

  const deleteEvent = async () => {
    if (!eventToDelete || deleteConfirmation.trim().toUpperCase() !== "EXCLUIR") return;

    const currentEvent = eventToDelete;
    setBusyId(`delete-${currentEvent.id}`);
    setDeleteError("");
    setError("");
    setSuccess("");

    try {
      const response = await eventService.destroy(currentEvent.id);
      setEvents((current) => current.filter((item) => Number(item.id) !== Number(currentEvent.id)));
      setEventToDelete(null);
      setDeleteConfirmation("");
      setDeleteError("");
      setSuccess(response?.message || "Evento excluído com sucesso.");
    } catch (err) {
      setDeleteError(err?.response?.data?.message || err?.message || "Não foi possível excluir este evento.");
    } finally {
      setBusyId(null);
    }
  };

  const openDeleteAll = () => {
    if (!events.length || bulkPublishing || busyId) return;
    setDeleteAllConfirmation("");
    setError("");
    setSuccess("");
    setDeleteAllOpen(true);
  };

  const closeDeleteAll = () => {
    if (busyId === "delete-all") return;
    setDeleteAllOpen(false);
    setDeleteAllConfirmation("");
  };

  const deleteAllEvents = async () => {
    if (deleteAllConfirmation.trim().toUpperCase() !== "EXCLUIR" || busyId === "delete-all") return;

    setBusyId("delete-all");
    setError("");
    setSuccess("");

    try {
      const response = await eventBulkService.deleteMine();
      setEvents([]);
      setSearchTerm("");
      setStatusFilter("all");
      setDeleteAllOpen(false);
      setDeleteAllConfirmation("");
      setSuccess(response?.message || "Todos os eventos foram excluídos com sucesso.");
    } catch (err) {
      setDeleteAllOpen(false);
      setDeleteAllConfirmation("");
      setError(err?.message || "Não foi possível excluir todos os eventos.");
      try {
        await load();
      } catch (_) {
        // Mantém a mensagem original da exclusão; uma falha de refresh não deve ocultá-la.
      }
    } finally {
      setBusyId(null);
    }
  };

  const stats = useMemo(() => ({
    total: events.length,
    published: events.filter((event) => event.is_published && !event.is_cancelled).length,
    draft: events.filter((event) => !event.is_published && !event.is_cancelled).length,
    attention: events.filter((event) => !event.is_cancelled && (getSalesReadiness(event).completed < 3 || eventPerformance(event).rank <= 3)).length,
    cancelled: events.filter((event) => event.is_cancelled).length,
  }), [events]);

  const filterOptions = useMemo(() => {
    const productionMap = new Map();
    const cities = new Set();
    events.forEach((event) => {
      const id = Number(event?.production?.id || event?.production_id || 0);
      const name = event?.production?.name;
      if (id && name) productionMap.set(id, name);
      if (event?.city) cities.add(String(event.city));
    });
    return {
      productions: [...productionMap.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => collator.compare(a.name, b.name)),
      cities: [...cities].sort(collator.compare),
    };
  }, [events]);

  const portfolioMetrics = useMemo(() => events.reduce((summary, event) => {
    const metrics = eventOperationalMetrics(event);
    const upcoming = !event.is_cancelled && !event.has_ended && new Date(event.end_date || event.start_date || 0).getTime() >= Date.now();
    summary.grossSales += metrics.grossSales;
    summary.salesToday += metrics.grossSalesToday;
    summary.ticketsSold += metrics.ticketsSold;
    summary.ticketsRemaining += metrics.ticketsRemaining;
    summary.pendingOrders += metrics.pendingOrders;
    if (upcoming) summary.upcomingGrossSales += metrics.grossSales;
    return summary;
  }, {
    grossSales: 0,
    upcomingGrossSales: 0,
    salesToday: 0,
    ticketsSold: 0,
    ticketsRemaining: 0,
    pendingOrders: 0,
  }), [events]);

  const bulkCandidates = useMemo(
    () => events.filter(isBulkPublishable),
    [events],
  );

  const bulkBlockedDrafts = useMemo(
    () => events.filter((event) => !event.is_cancelled && !event.is_published && !isBulkPublishable(event)),
    [events],
  );

  const visibleEvents = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLocaleLowerCase("pt-BR");
    const pinned = new Set(pinnedEventIds.map(Number));

    const filtered = events.filter((event) => {
      const status = getStatus(event);
      const readiness = getSalesReadiness(event);
      const performance = eventPerformance(event);
      const temporal = eventTemporalGroup(event);
      const productionId = String(event?.production?.id || event?.production_id || "");
      const matchesStatus = statusFilter === "all"
        || status.key === statusFilter
        || (statusFilter === "attention" && !event.is_cancelled && (readiness.completed < 3 || performance.rank <= 3));
      const matchesProduction = productionFilter === "all" || productionId === String(productionFilter);
      const matchesCity = cityFilter === "all" || String(event?.city || "") === cityFilter;
      const matchesPeriod = periodFilter === "all" || temporal.key === periodFilter;
      const matchesPerformance = performanceFilter === "all" || performance.key === performanceFilter;

      if (!matchesStatus || !matchesProduction || !matchesCity || !matchesPeriod || !matchesPerformance) return false;
      if (!normalizedSearch) return true;

      return [
        event.title,
        event.production?.name,
        eventLocation(event),
        event.city,
        event.uf,
        status.label,
        readiness.title,
        performance.label,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("pt-BR").includes(normalizedSearch));
    });

    return [...filtered].sort((a, b) => {
      if (sortConfig.key === "smart") {
        const result = compareSmartRanks(
          smartEventRank(a, pinned.has(Number(a.id))),
          smartEventRank(b, pinned.has(Number(b.id))),
        );
        return sortConfig.direction === "desc" ? -result : result;
      }

      const result = compareSortValues(
        sortValue(a, sortConfig.key),
        sortValue(b, sortConfig.key),
        sortConfig.direction,
      );

      if (result !== 0) return result;
      return collator.compare(String(a?.title || ""), String(b?.title || ""));
    });
  }, [
    events,
    searchTerm,
    statusFilter,
    productionFilter,
    cityFilter,
    periodFilter,
    performanceFilter,
    sortConfig,
    pinnedEventIds,
  ]);

  const renderedEvents = useMemo(
    () => visibleEvents.slice(0, displayLimit),
    [visibleEvents, displayLimit],
  );

  const renderedGroups = useMemo(() => {
    if (!groupByPeriod) return [{ key: "all", label: "Eventos", events: renderedEvents }];
    const groups = new Map();
    renderedEvents.forEach((event) => {
      const group = eventTemporalGroup(event);
      const current = groups.get(group.key) || { ...group, events: [] };
      current.events.push(event);
      groups.set(group.key, current);
    });
    return [...groups.values()].sort((a, b) => a.order - b.order);
  }, [renderedEvents, groupByPeriod]);

  const selectedEventIdSet = useMemo(
    () => new Set(selectedEventIds.map((id) => Number(id))),
    [selectedEventIds],
  );

  const selectedEvents = useMemo(
    () => events.filter((event) => selectedEventIdSet.has(Number(event.id))),
    [events, selectedEventIdSet],
  );

  const visibleEventIds = useMemo(
    () => visibleEvents.map((event) => Number(event.id)),
    [visibleEvents],
  );

  const allVisibleSelected = visibleEventIds.length > 0
    && visibleEventIds.every((id) => selectedEventIdSet.has(id));

  const toggleEventSelection = (eventId) => {
    const id = Number(eventId);
    setSelectedEventIds((current) => (
      current.some((item) => Number(item) === id)
        ? current.filter((item) => Number(item) !== id)
        : [...current, id]
    ));
  };

  const toggleVisibleSelection = () => {
    setSelectedEventIds((current) => {
      const currentSet = new Set(current.map((id) => Number(id)));
      if (allVisibleSelected) {
        visibleEventIds.forEach((id) => currentSet.delete(id));
      } else {
        visibleEventIds.forEach((id) => currentSet.add(id));
      }
      return [...currentSet];
    });
  };

  const openBulkDelete = () => {
    if (!selectedEventIds.length || bulkPublishing || busyId) return;
    setBulkDeleteConfirmation("");
    setBulkDeleteError("");
    setError("");
    setSuccess("");
    setBulkDeleteOpen(true);
  };

  const closeBulkDelete = () => {
    if (busyId === "delete-selected") return;
    setBulkDeleteOpen(false);
    setBulkDeleteConfirmation("");
    setBulkDeleteError("");
  };

  const deleteSelectedEvents = async () => {
    if (!selectedEventIds.length || bulkDeleteConfirmation.trim().toUpperCase() !== "EXCLUIR" || busyId === "delete-selected") return;

    const ids = [...selectedEventIds];
    const deletedIdSet = new Set(ids.map((id) => Number(id)));
    setBusyId("delete-selected");
    setBulkDeleteError("");
    setError("");
    setSuccess("");

    try {
      const response = await eventBulkService.deleteSelected(ids);
      setEvents((current) => current.filter((event) => !deletedIdSet.has(Number(event.id))));
      setSelectedEventIds([]);
      setBulkDeleteOpen(false);
      setBulkDeleteConfirmation("");
      setSuccess(response?.message || `${ids.length} evento(s) excluído(s) com sucesso.`);
      try {
        window.PeterTecnetTelemetry?.track?.("producer_events_bulk_deleted", {
          label: "Produtor excluiu eventos selecionados",
          target: "event-management",
          metadata: { event_ids: ids, count: ids.length },
        });
      } catch (_) {
        // Telemetria não deve interromper a gestão de eventos.
      }
    } catch (err) {
      const message = err?.response?.data?.message || err?.message || "Não foi possível excluir os eventos selecionados.";
      setBulkDeleteError(message);
    } finally {
      setBusyId(null);
    }
  };

  const openBulkPublish = () => {
    if (!bulkCandidates.length || bulkPublishing) return;
    setBulkResult(null);
    setBulkProgress({ done: 0, total: bulkCandidates.length, current: "" });
    setError("");
    setSuccess("");
    setBulkPublishOpen(true);
  };

  const closeBulkPublish = () => {
    if (bulkPublishing) return;
    setBulkPublishOpen(false);
    setBulkResult(null);
    setBulkProgress({ done: 0, total: 0, current: "" });
  };

  const publishAll = async () => {
    if (bulkPublishing) return;

    const targets = events.filter(isBulkPublishable);
    if (!targets.length) {
      setBulkResult({ published: [], failed: [] });
      return;
    }

    setBulkPublishing(true);
    setBulkResult(null);
    setBulkProgress({ done: 0, total: targets.length, current: targets[0]?.title || "" });
    setError("");
    setSuccess("");

    const published = [];
    const failed = [];

    for (let index = 0; index < targets.length; index += 1) {
      const event = targets[index];
      setBulkProgress({ done: index, total: targets.length, current: event.title || `Evento ${event.id}` });

      try {
        await cutinappService.publishEvent(event.id);
        published.push(event);
        trackProducerActivation("producer_event_published", event, {
          activation_stage: "published",
          publication_mode: "bulk",
          bulk_total: targets.length,
        });
      } catch (err) {
        failed.push({
          id: event.id,
          title: event.title || `Evento ${event.id}`,
          message: err?.message || "Não foi possível publicar este evento.",
        });
      }

      setBulkProgress({ done: index + 1, total: targets.length, current: event.title || `Evento ${event.id}` });
    }

    try {
      await load();
    } catch (err) {
      setError(err?.message || "Os eventos foram processados, mas não foi possível atualizar a lista.");
    }

    setBulkResult({ published, failed });
    setBulkPublishing(false);

    if (published.length && failed.length === 0) {
      setSuccess(`${published.length} evento(s) publicado(s) com sucesso.`);
    } else if (published.length) {
      setSuccess(`${published.length} evento(s) publicado(s). ${failed.length} não puderam ser publicados.`);
    } else if (failed.length) {
      setError("Nenhum evento pôde ser publicado. Confira os detalhes da publicação em massa.");
    }
  };

  const runBulkMutation = async (label, targets, mutate) => {
    if (!targets.length || busyId || bulkPublishing) return;
    setBusyId("bulk-action");
    setBulkActionError("");
    setError("");
    setSuccess("");

    let completed = 0;
    const failed = [];
    for (const event of targets) {
      try {
        await mutate(event);
        completed += 1;
      } catch (err) {
        failed.push(event.title || `Evento #${event.id}`);
      }
    }

    try { await load(); } catch (_) {}

    if (failed.length) {
      setBulkActionError(`${completed} concluído(s). Falharam: ${failed.slice(0, 4).join(", ")}${failed.length > 4 ? "…" : ""}`);
    } else {
      setSuccess(`${label}: ${completed} evento(s) processado(s).`);
      setSelectedEventIds([]);
    }
    setBusyId(null);
  };

  const bulkPublishSelected = () => runBulkMutation(
    "Publicação concluída",
    selectedEvents.filter(isBulkPublishable),
    (event) => cutinappService.publishEvent(event.id),
  );

  const bulkUnpublishSelected = () => runBulkMutation(
    "Despublicação concluída",
    selectedEvents.filter((event) => event.is_published && !event.is_cancelled),
    (event) => cutinappService.unpublishEvent(event.id),
  );

  const bulkDuplicateSelected = () => runBulkMutation(
    "Duplicação concluída",
    selectedEvents.filter((event) => !event.is_cancelled),
    (event) => eventService.duplicate(event.id, suggestedDuplicateDate(event)),
  );

  const bulkAgendaSelected = async () => {
    const targets = selectedEvents.filter((event) => !event.is_cancelled);
    const slots = new Set();
    const collision = targets.find((event) => {
      const date = new Date(event.start_date || "");
      const day = Number.isNaN(date.getTime()) ? 1 : date.getDay();
      const slot = `${Number(event?.production?.id || event?.production_id || 0)}:${day}`;
      if (slots.has(slot)) return true;
      slots.add(slot);
      return false;
    });

    if (collision) {
      setBulkActionError("Há mais de um evento selecionado para o mesmo dia da semana na mesma produção. Mantenha somente um evento por dia antes de adicionar em massa à agenda.");
      return;
    }

    await runBulkMutation("Agenda semanal atualizada", targets, (event) => {
      const sourceDate = new Date(event.start_date || "");
      const day = Number.isNaN(sourceDate.getTime()) ? 1 : sourceDate.getDay();
      const productionId = Number(event?.production?.id || event?.production_id || 0);
      return eventService.createAgendaItem(productionId, {
        event_id: Number(event.id),
        day_of_week: day,
        generation_mode: "delayed",
        generation_delay_days: 1,
        generation_weeks: 1,
        is_active: true,
      });
    });
  };

  const openBulkMove = () => {
    const firstDifferent = filterOptions.productions.find((production) => !selectedEvents.every((event) => Number(event?.production?.id || event?.production_id) === production.id));
    setBulkTargetProductionId(firstDifferent ? String(firstDifferent.id) : String(filterOptions.productions[0]?.id || ""));
    setBulkActionError("");
    setBulkMoveOpen(true);
  };

  const bulkMoveSelected = async () => {
    const target = Number(bulkTargetProductionId);
    if (!target) return;
    setBulkMoveOpen(false);
    await runBulkMutation(
      "Eventos movidos",
      selectedEvents.filter((event) => Number(event?.production?.id || event?.production_id || 0) !== target),
      (event) => eventService.update(event.id, { production_id: target }),
    );
  };

  const runPrimaryAction = (event, readiness) => {
    if (readiness.mode === "publish") {
      publication(event);
      return;
    }
    if (readiness.mode === "whatsapp") {
      shareWhatsApp(event);
      return;
    }
    if (readiness.route) navigate(readiness.route);
  };

  const handleSort = (key) => {
    setSortConfig((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  };

  const sortIcon = (key) => {
    if (sortConfig.key !== key) return "fa-solid fa-sort";
    return sortConfig.direction === "asc" ? "fa-solid fa-arrow-up" : "fa-solid fa-arrow-down";
  };

  const ariaSort = (key) => {
    if (sortConfig.key !== key) return "none";
    return sortConfig.direction === "asc" ? "ascending" : "descending";
  };

  const duplicating = String(busyId).startsWith("duplicate-");
  const deletingOne = /^delete-\d+$/.test(String(busyId));
  const deletingAll = busyId === "delete-all";
  const deletingMany = busyId === "delete-selected";

  const renderActions = (event) => (
    <div className="cut-event-admin-actions">
      <Dropdown align="end" className="cut-event-manager-more">
        <Dropdown.Toggle
          size="sm"
          variant="outline-light"
          title="Ações do evento"
          aria-label={`Ações para ${event.title}`}
          disabled={Boolean(busyId) || bulkPublishing}
        >
          <i className="fa-solid fa-ellipsis" />
        </Dropdown.Toggle>
        <Dropdown.Menu>
          <Dropdown.Item onClick={() => navigate(`/event/edit/${event.id}`)} disabled={Boolean(busyId)}><i className="fa-solid fa-pen" />Editar evento</Dropdown.Item>
          <Dropdown.Item onClick={() => openDuplicate(event)} disabled={Boolean(busyId)}><i className="fa-regular fa-copy" />Duplicar evento</Dropdown.Item>
          {!event.is_cancelled && (
            <Dropdown.Item onClick={() => openAgenda(event)} disabled={Boolean(busyId)}>
              <i className="fa-solid fa-calendar-week" />Adicionar à agenda semanal
            </Dropdown.Item>
          )}
          <Dropdown.Divider />
          <Dropdown.Item onClick={() => navigate(`/ticket/create?eventId=${event.id}`)}><i className="fa-solid fa-ticket" />Novo lote</Dropdown.Item>
          <Dropdown.Item onClick={() => navigate(`/event/${event.id}/participants`)}><i className="fa-solid fa-users" />Participantes</Dropdown.Item>
          <Dropdown.Item onClick={() => navigate(`/event/${event.id}/courtesies`)}><i className="fa-solid fa-gift" />Cortesias</Dropdown.Item>
          {event.is_published && !event.is_cancelled && <Dropdown.Divider />}
          {event.is_published && !event.is_cancelled && <Dropdown.Item onClick={() => navigate(`/checkin?eventId=${event.id}`)}><i className="fa-solid fa-qrcode" />Portaria / check-in</Dropdown.Item>}
          {event.is_published && !event.is_cancelled && <Dropdown.Item onClick={() => navigate(`/event/${event.slug}`)}><i className="fa-solid fa-arrow-up-right-from-square" />Página pública</Dropdown.Item>}
          {event.is_published && !event.is_cancelled && <Dropdown.Item onClick={() => copyLink(event)}><i className="fa-regular fa-copy" />Copiar link</Dropdown.Item>}
          {event.is_published && !event.is_cancelled && <Dropdown.Item onClick={() => share(event)}><i className="fa-solid fa-share-nodes" />Compartilhar</Dropdown.Item>}
          {!event.is_cancelled && <Dropdown.Divider />}
          {!event.is_cancelled && (
            <Dropdown.Item className={event.is_published ? "text-warning" : "text-success"} onClick={() => publication(event)} disabled={busyId === event.id}>
              <i className={event.is_published ? "fa-solid fa-eye-slash" : "fa-solid fa-rocket"} />
              {event.is_published ? "Despublicar" : "Publicar"}
            </Dropdown.Item>
          )}
          <Dropdown.Divider />
          <Dropdown.Item className="text-danger" onClick={() => openDeleteEvent(event)} disabled={Boolean(busyId)}>
            <i className="fa-regular fa-trash-can" />Excluir evento
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown>
    </div>
  );

  const processingLabel = loading
    ? "Carregando eventos"
    : deletingAll
      ? "Excluindo todos os eventos"
      : deletingOne
        ? `Excluindo ${eventToDelete?.title || "evento"}`
        : bulkPublishing
          ? `Publicando ${bulkProgress.done} de ${bulkProgress.total} eventos`
          : duplicating
            ? "Duplicando evento"
            : String(busyId).startsWith("agenda-")
              ? "Configurando agenda semanal"
              : "Atualizando evento";

  const bulkProgressPercent = bulkProgress.total
    ? Math.round((bulkProgress.done / bulkProgress.total) * 100)
    : 0;

  return (
    <div className="cut-app-page cut-event-manager-page">
      <NavlogComponent />
      {(busyId || bulkPublishing) && <ProcessingIndicatorComponent label={processingLabel} />}

      <Container className="cut-page-container py-4 py-lg-5">
        <header className="cut-event-manager-hero">
          <div className="cut-event-manager-hero__copy">
            <span className="cut-eyebrow">Central do produtor</span>
            <h1>Meus eventos</h1>
            <p>Acompanhe publicação, ingressos e preparação de cada evento sem perder o que precisa da sua atenção.</p>
          </div>
          <div className="cut-event-manager-hero__actions d-flex flex-wrap gap-2 justify-content-end">
            {bulkCandidates.length > 0 && (
              <Button
                variant="success"
                className="cut-event-manager-new"
                onClick={openBulkPublish}
                disabled={Boolean(busyId) || bulkPublishing}
              >
                <i className="fa-solid fa-rocket me-2" />Publicar todos ({bulkCandidates.length})
              </Button>
            )}
            {events.length > 0 && (
              <Button
                variant="outline-danger"
                className="cut-event-manager-new"
                onClick={openDeleteAll}
                disabled={Boolean(busyId) || bulkPublishing}
              >
                <i className="fa-solid fa-trash-can me-2" />Excluir todos
              </Button>
            )}
            <Button className="cut-event-manager-new" onClick={() => navigate("/event/create")} disabled={bulkPublishing || deletingAll}>
              <i className="fa-solid fa-plus me-2" />Novo evento
            </Button>
          </div>
        </header>

        {error && <Alert variant="danger">{error}</Alert>}
        {success && <Alert variant="success">{success}</Alert>}

        {loading ? (
          <section className="cut-event-manager-skeleton" aria-label="Carregando eventos">
            {[1, 2, 3, 4].map((item) => <div key={item} className="cut-event-manager-skeleton__card">
              <span className="cut-event-manager-skeleton__media" />
              <div><span /><span /><span /></div>
              <aside><span /><span /></aside>
            </div>)}
          </section>
        ) : events.length === 0 ? (
          <Card className="cut-empty-state cut-event-manager-empty">
            <Card.Body>
              <div className="cut-event-manager-empty__icon"><i className="fa-solid fa-calendar-plus" /></div>
              <h2>Seu primeiro evento começa aqui</h2>
              <p>Cadastre o evento, crie os ingressos e publique. A Cutinapp mostra a próxima etapa em cada passo.</p>
              <Button onClick={() => navigate("/event/create")}>Criar primeiro evento</Button>
            </Card.Body>
          </Card>
        ) : (
          <>
            <section className="cut-event-manager-summary" aria-label="Resumo dos eventos">
              <button type="button" className={statusFilter === "all" ? "is-active" : ""} onClick={() => setStatusFilter("all")}>
                <span className="cut-event-manager-summary__icon"><i className="fa-solid fa-layer-group" /></span>
                <span className="cut-event-manager-summary__copy"><small>Portfólio</small><span>Todos os eventos</span></span>
                <strong>{stats.total}</strong>
              </button>
              <button type="button" className={statusFilter === "published" ? "is-active" : ""} onClick={() => setStatusFilter("published")}>
                <span className="cut-event-manager-summary__icon"><i className="fa-solid fa-circle-check" /></span>
                <span className="cut-event-manager-summary__copy"><small>No ar</small><span>Publicados</span></span>
                <strong>{stats.published}</strong>
              </button>
              <button type="button" className={statusFilter === "draft" ? "is-active" : ""} onClick={() => setStatusFilter("draft")}>
                <span className="cut-event-manager-summary__icon"><i className="fa-solid fa-pen-ruler" /></span>
                <span className="cut-event-manager-summary__copy"><small>Em construção</small><span>Rascunhos</span></span>
                <strong>{stats.draft}</strong>
              </button>
              <button type="button" className={statusFilter === "attention" ? "is-active" : ""} onClick={() => setStatusFilter("attention")}>
                <span className="cut-event-manager-summary__icon"><i className="fa-solid fa-bolt" /></span>
                <span className="cut-event-manager-summary__copy"><small>Prioridade</small><span>Precisam de ação</span></span>
                <strong>{stats.attention}</strong>
              </button>
              {stats.cancelled > 0 && (
                <button type="button" className={statusFilter === "cancelled" ? "is-active" : ""} onClick={() => setStatusFilter("cancelled")}>
                  <span className="cut-event-manager-summary__icon"><i className="fa-solid fa-ban" /></span>
                  <span className="cut-event-manager-summary__copy"><small>Fora da agenda</small><span>Cancelados</span></span>
                  <strong>{stats.cancelled}</strong>
                </button>
              )}
            </section>

            <section className="cut-event-portfolio-metrics" aria-label="Resumo comercial dos eventos">
              <div><span><i className="fa-solid fa-chart-line" />Faturamento próximos eventos</span><strong>{moneyBR(portfolioMetrics.upcomingGrossSales)}</strong></div>
              <div><span><i className="fa-solid fa-bolt" />Vendas hoje</span><strong>{moneyBR(portfolioMetrics.salesToday)}</strong></div>
              <div><span><i className="fa-solid fa-ticket" />Ingressos vendidos</span><strong>{portfolioMetrics.ticketsSold.toLocaleString("pt-BR")}</strong></div>
              <div><span><i className="fa-solid fa-layer-group" />Ingressos restantes</span><strong>{portfolioMetrics.ticketsRemaining.toLocaleString("pt-BR")}</strong></div>
              {portfolioMetrics.pendingOrders > 0 && <div className="is-warning"><span><i className="fa-regular fa-clock" />Checkouts pendentes</span><strong>{portfolioMetrics.pendingOrders}</strong></div>}
            </section>

            <section className="cut-event-manager-toolbar">
              <div className="cut-event-manager-search">
                <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
                <Form.Control
                  type="search"
                  placeholder="Buscar evento, produção ou local"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  aria-label="Buscar meus eventos"
                />
              </div>

              <div className="cut-event-manager-toolbar__right">
                <Dropdown align="end">
                  <Dropdown.Toggle variant="outline-light" className="cut-event-toolbar-control">
                    <i className="fa-solid fa-arrow-down-wide-short me-2" />
                    {SORT_COLUMNS.find((item) => item.key === sortConfig.key)?.label || "Prioridade"}
                  </Dropdown.Toggle>
                  <Dropdown.Menu className="cut-event-toolbar-menu">
                    {SORT_COLUMNS.map((column) => <Dropdown.Item key={column.key} active={sortConfig.key === column.key} onClick={() => handleSort(column.key)}>
                      {column.label}{sortConfig.key === column.key && <i className={`${sortIcon(column.key)} ms-auto`} />}
                    </Dropdown.Item>)}
                  </Dropdown.Menu>
                </Dropdown>
                <div className="cut-event-view-switch" role="group" aria-label="Modo de visualização">
                  <button type="button" className={viewMode === "visual" ? "is-active" : ""} onClick={() => setViewMode("visual")} title="Modo visual"><i className="fa-solid fa-table-cells-large" /></button>
                  <button type="button" className={viewMode === "compact" ? "is-active" : ""} onClick={() => setViewMode("compact")} title="Modo compacto"><i className="fa-solid fa-list" /></button>
                </div>
                <button type="button" className={`cut-event-group-toggle${groupByPeriod ? " is-active" : ""}`} onClick={() => setGroupByPeriod((current) => !current)} title="Agrupar por período">
                  <i className="fa-solid fa-layer-group" />
                </button>
                {(searchTerm || statusFilter !== "all" || productionFilter !== "all" || cityFilter !== "all" || periodFilter !== "all" || performanceFilter !== "all") && (
                  <Button variant="outline-light" onClick={() => {
                    setSearchTerm("");
                    setStatusFilter("all");
                    setProductionFilter("all");
                    setCityFilter("all");
                    setPeriodFilter("all");
                    setPerformanceFilter("all");
                  }}>
                    <i className="fa-solid fa-filter-circle-xmark me-2" />Limpar
                  </Button>
                )}
              </div>
            </section>

            <details className="cut-event-advanced-filters">
              <summary><span><i className="fa-solid fa-sliders" />Filtros avançados</span><small>Produção, cidade, período e desempenho</small></summary>
              <div className="cut-event-advanced-filters__grid">
                <Form.Group><Form.Label>Produção</Form.Label><Form.Select value={productionFilter} onChange={(event) => setProductionFilter(event.target.value)}><option value="all">Todas as produções</option>{filterOptions.productions.map((production) => <option key={production.id} value={production.id}>{production.name}</option>)}</Form.Select></Form.Group>
                <Form.Group><Form.Label>Cidade</Form.Label><Form.Select value={cityFilter} onChange={(event) => setCityFilter(event.target.value)}><option value="all">Todas as cidades</option>{filterOptions.cities.map((city) => <option key={city} value={city}>{city}</option>)}</Form.Select></Form.Group>
                <Form.Group><Form.Label>Período</Form.Label><Form.Select value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value)}><option value="all">Qualquer período</option><option value="today">Hoje</option><option value="tomorrow">Amanhã</option><option value="week">Próximos 7 dias</option><option value="upcoming">Próximos</option><option value="past">Encerrados</option><option value="cancelled">Cancelados</option></Form.Select></Form.Group>
                <Form.Group><Form.Label>Performance</Form.Label><Form.Select value={performanceFilter} onChange={(event) => setPerformanceFilter(event.target.value)}><option value="all">Qualquer desempenho</option><option value="strong">Vendendo bem</option><option value="selling">Com vendas</option><option value="almost_sold_out">Quase esgotado</option><option value="sold_out">Esgotado</option><option value="no_sales">Sem vendas</option><option value="low_conversion">Baixa conversão</option><option value="critical">Crítico</option><option value="draft">Não publicado</option></Form.Select></Form.Group>
              </div>
            </details>

            {bulkActionError && <Alert variant="warning" className="cut-event-bulk-feedback">{bulkActionError}</Alert>}

            {visibleEvents.length > 0 && (
              <section className="cut-event-bulk-selection" aria-label="Seleção de eventos para ações em massa">
                <div className="cut-event-bulk-selection__summary">
                  <Form.Check
                    type="checkbox"
                    id="select-visible-events"
                    checked={allVisibleSelected}
                    onChange={toggleVisibleSelection}
                    disabled={Boolean(busyId) || bulkPublishing}
                    label={allVisibleSelected ? "Desmarcar eventos exibidos" : "Selecionar eventos exibidos"}
                  />
                  <span>
                    <strong>{selectedEventIds.length}</strong> selecionado(s)
                    {visibleEvents.length !== events.length ? ` · ${visibleEvents.length} exibido(s) pelo filtro` : ""}
                  </span>
                </div>
                <div className="cut-event-bulk-selection__actions">
                  {selectedEventIds.length > 0 && <Button size="sm" variant="outline-light" onClick={() => setSelectedEventIds([])} disabled={Boolean(busyId) || bulkPublishing}>Limpar seleção</Button>}
                  <Dropdown align="end">
                    <Dropdown.Toggle size="sm" variant="outline-light" disabled={!selectedEventIds.length || Boolean(busyId) || bulkPublishing}>
                      <i className="fa-solid fa-wand-magic-sparkles me-2" />Ações em massa
                    </Dropdown.Toggle>
                    <Dropdown.Menu className="cut-event-toolbar-menu">
                      <Dropdown.Item onClick={bulkPublishSelected}><i className="fa-solid fa-rocket" />Publicar selecionados</Dropdown.Item>
                      <Dropdown.Item onClick={bulkUnpublishSelected}><i className="fa-solid fa-eye-slash" />Despublicar selecionados</Dropdown.Item>
                      <Dropdown.Item onClick={bulkDuplicateSelected}><i className="fa-regular fa-copy" />Duplicar +7 dias</Dropdown.Item>
                      <Dropdown.Item onClick={bulkAgendaSelected}><i className="fa-solid fa-calendar-week" />Adicionar à agenda pelo dia original</Dropdown.Item>
                      <Dropdown.Item onClick={openBulkMove}><i className="fa-solid fa-arrow-right-arrow-left" />Mover para outra produção</Dropdown.Item>
                      <Dropdown.Divider />
                      <Dropdown.Item className="text-danger" onClick={openBulkDelete}><i className="fa-solid fa-trash-can" />Excluir selecionados</Dropdown.Item>
                    </Dropdown.Menu>
                  </Dropdown>
                </div>
              </section>
            )}

            {visibleEvents.length === 0 ? (
              <div className="cut-event-manager-no-results">
                <i className="fa-solid fa-filter-circle-xmark" />
                <strong>Nenhum evento encontrado</strong>
                <span>Ajuste a busca ou remova o filtro para ver seus eventos.</span>
                <Button size="sm" variant="outline-light" onClick={() => { setSearchTerm(""); setStatusFilter("all"); }}>Limpar filtros</Button>
              </div>
            ) : (
              <>
                <section className={`cut-producer-event-groups is-${viewMode}`} aria-label="Gerenciamento de eventos">
                  {renderedGroups.map((group) => (
                    <div className="cut-producer-event-group" key={group.key}>
                      <header className="cut-producer-event-group__heading">
                        <div><span>{group.label}</span><strong>{group.events.length}</strong></div>
                        {group.key !== "all" && <small>Organizado automaticamente pela data do evento</small>}
                      </header>
                      <div className="cut-producer-event-list">
                        {group.events.map((event) => {
                          const readiness = getSalesReadiness(event);
                          const status = getStatus(event);
                          return <ProducerEventCard
                            key={event.id}
                            event={event}
                            readiness={readiness}
                            status={status}
                            selected={selectedEventIdSet.has(Number(event.id))}
                            pinned={pinnedEventIds.includes(Number(event.id))}
                            viewMode={viewMode}
                            disabled={Boolean(busyId) || bulkPublishing || deletingAll}
                            actions={renderActions(event)}
                            onToggleSelected={toggleEventSelection}
                            onTogglePin={togglePinnedEvent}
                            onQuickView={setQuickEvent}
                            onEdit={(item) => navigate(`/event/edit/${item.id}`)}
                            onPrimaryAction={runPrimaryAction}
                            onDuplicate={openDuplicate}
                          />;
                        })}
                      </div>
                    </div>
                  ))}
                  <footer className="cut-event-incremental-footer">
                    <span>Exibindo <strong>{renderedEvents.length}</strong> de <strong>{visibleEvents.length}</strong> evento(s) filtrado(s) · {events.length} no total</span>
                    {renderedEvents.length < visibleEvents.length && <Button variant="outline-light" onClick={() => setDisplayLimit((current) => current + 24)}><i className="fa-solid fa-chevron-down me-2" />Carregar mais 24</Button>}
                  </footer>
                </section>
              </>
            )}
          </>
        )}
      </Container>

      <EventQuickView event={quickEvent} show={Boolean(quickEvent)} onHide={() => setQuickEvent(null)} onDuplicate={openDuplicate} onAgenda={openAgenda} />

      <Modal show={bulkMoveOpen} onHide={() => setBulkMoveOpen(false)} centered>
        <Modal.Header closeButton><Modal.Title>Mover eventos para outra produção</Modal.Title></Modal.Header>
        <Modal.Body>
          <p className="text-secondary">Os eventos selecionados serão vinculados à produção escolhida. Ingressos, vendas e histórico permanecem no evento.</p>
          <Form.Group>
            <Form.Label>Produção de destino</Form.Label>
            <Form.Select value={bulkTargetProductionId} onChange={(event) => setBulkTargetProductionId(event.target.value)}>
              <option value="">Selecione</option>
              {filterOptions.productions.map((production) => <option key={production.id} value={production.id}>{production.name}</option>)}
            </Form.Select>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setBulkMoveOpen(false)}>Cancelar</Button>
          <Button onClick={bulkMoveSelected} disabled={!bulkTargetProductionId || Boolean(busyId)}>Mover {selectedEventIds.length} evento(s)</Button>
        </Modal.Footer>
      </Modal>

      <Modal show={Boolean(eventToAgenda)} onHide={closeAgenda} centered backdrop={String(busyId).startsWith("agenda-") ? "static" : true}>
        <Modal.Header closeButton={!String(busyId).startsWith("agenda-")}>
          <Modal.Title>Adicionar à agenda semanal</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Alert variant="info">
            <strong>{eventToAgenda?.title}</strong> ficará fixo somente no dia selecionado. Cada dia da semana pode ter um evento diferente e uma regra de geração própria.
          </Alert>

          {agendaError && <Alert variant="danger">{agendaError}</Alert>}

          <div className="cut-event-agenda-config-grid">
            <Form.Group>
              <Form.Label>Dia fixo da semana</Form.Label>
              <Form.Select value={agendaDay} onChange={(event) => setAgendaDay(Number(event.target.value))}>
                {WEEK_DAYS.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}
              </Form.Select>
              <Form.Text>Se já houver outro evento neste dia, ele será substituído como evento fixo da agenda.</Form.Text>
            </Form.Group>

            <Form.Group>
              <Form.Label>Quantas semanas manter/criar</Form.Label>
              <Form.Control
                type="number"
                min={1}
                max={52}
                value={agendaWeeks}
                onChange={(event) => setAgendaWeeks(Math.max(1, Math.min(52, Number(event.target.value) || 1)))}
              />
              <Form.Text>Escolha de 1 a 52 semanas para este dia específico.</Form.Text>
            </Form.Group>
          </div>

          <Form.Group className="mt-3">
            <Form.Label>Como criar as próximas ocorrências?</Form.Label>
            <div className="cut-event-agenda-mode-options">
              <button
                type="button"
                className={agendaGenerationMode === "immediate" ? "is-active" : ""}
                onClick={() => setAgendaGenerationMode("immediate")}
              >
                <i className="fa-solid fa-bolt" />
                <span><strong>Criar de uma vez</strong><small>Cria imediatamente as próximas semanas escolhidas.</small></span>
              </button>
              <button
                type="button"
                className={agendaGenerationMode === "delayed" ? "is-active" : ""}
                onClick={() => setAgendaGenerationMode("delayed")}
              >
                <i className="fa-regular fa-clock" />
                <span><strong>Criar por intervalo</strong><small>Espera o dia acontecer e repõe depois do atraso escolhido.</small></span>
              </button>
            </div>
          </Form.Group>

          {agendaGenerationMode === "delayed" && (
            <Form.Group className="mt-3">
              <Form.Label>Depois que o dia passar, esperar quantos dias?</Form.Label>
              <Form.Select value={agendaDelayDays} onChange={(event) => setAgendaDelayDays(Number(event.target.value))}>
                {[1,2,3,4,5,6].map((days) => (
                  <option key={days} value={days}>
                    {days === 1 ? "1 dia depois" : `${days} dias depois`}
                  </option>
                ))}
              </Form.Select>
              <Form.Text>
                Exemplo: evento fixo de segunda + 1 dia = terça; +6 dias = domingo. O limite de 6 dias garante que a próxima segunda já esteja criada antes de chegar.
              </Form.Text>
            </Form.Group>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={closeAgenda} disabled={String(busyId).startsWith("agenda-")}>Cancelar</Button>
          <Button onClick={addToAgenda} disabled={String(busyId).startsWith("agenda-") || !eventToAgenda}>
            <i className="fa-solid fa-calendar-check me-2" />Salvar na agenda semanal
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal show={Boolean(eventToDelete)} onHide={closeDeleteEvent} centered backdrop={deletingOne ? "static" : true} keyboard={!deletingOne}>
        <Modal.Header closeButton={!deletingOne}>
          <Modal.Title>Excluir evento</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Alert variant="danger">
            Você está prestes a excluir <strong>{eventToDelete?.title || "este evento"}</strong>. Esta ação não pode ser desfeita.
          </Alert>
          <p className="text-secondary">
            Se já existirem ingressos emitidos para este evento, a exclusão será bloqueada para preservar participantes, vendas e check-ins.
          </p>
          {deleteError && <Alert variant="danger">{deleteError}</Alert>}
          <Form.Group>
            <Form.Label>Digite <strong>EXCLUIR</strong> para confirmar</Form.Label>
            <Form.Control
              value={deleteConfirmation}
              onChange={(event) => {
                setDeleteConfirmation(event.target.value);
                setDeleteError("");
              }}
              placeholder="EXCLUIR"
              autoComplete="off"
              disabled={deletingOne}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={closeDeleteEvent} disabled={deletingOne}>Cancelar</Button>
          <Button
            variant="danger"
            onClick={deleteEvent}
            disabled={deletingOne || deleteConfirmation.trim().toUpperCase() !== "EXCLUIR"}
          >
            <i className="fa-solid fa-trash-can me-2" />Excluir evento
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal show={bulkDeleteOpen} onHide={closeBulkDelete} centered backdrop={deletingMany ? "static" : true} keyboard={!deletingMany}>
        <Modal.Header closeButton={!deletingMany}>
          <Modal.Title>Excluir eventos selecionados</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Alert variant="danger">
            Você está prestes a excluir <strong>{selectedEventIds.length} evento(s)</strong> de uma vez. Esta ação não pode ser desfeita.
          </Alert>
          <p className="text-secondary">
            A exclusão é atômica: se algum evento não pertencer à sua produção ou já possuir ingresso emitido, nenhum dos selecionados será apagado.
          </p>
          {selectedEvents.length > 0 && (
            <div className="cut-event-bulk-delete-preview">
              {selectedEvents.slice(0, 5).map((event) => <span key={event.id}>{event.title}</span>)}
              {selectedEvents.length > 5 && <small>+ {selectedEvents.length - 5} outro(s)</small>}
            </div>
          )}
          {bulkDeleteError && <Alert variant="danger" className="mt-3">{bulkDeleteError}</Alert>}
          <Form.Group className="mt-3">
            <Form.Label>Digite <strong>EXCLUIR</strong> para confirmar</Form.Label>
            <Form.Control
              value={bulkDeleteConfirmation}
              onChange={(event) => {
                setBulkDeleteConfirmation(event.target.value);
                setBulkDeleteError("");
              }}
              placeholder="EXCLUIR"
              autoComplete="off"
              disabled={deletingMany}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={closeBulkDelete} disabled={deletingMany}>Cancelar</Button>
          <Button
            variant="danger"
            onClick={deleteSelectedEvents}
            disabled={deletingMany || !selectedEventIds.length || bulkDeleteConfirmation.trim().toUpperCase() !== "EXCLUIR"}
          >
            <i className="fa-solid fa-trash-can me-2" />
            {deletingMany ? "Excluindo..." : `Excluir ${selectedEventIds.length} evento(s)`}
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal show={deleteAllOpen} onHide={closeDeleteAll} centered backdrop={deletingAll ? "static" : true} keyboard={!deletingAll}>
        <Modal.Header closeButton={!deletingAll}>
          <Modal.Title>Excluir todos os eventos</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Alert variant="danger">
            Esta ação excluirá de uma vez os <strong>{events.length} evento(s)</strong> das produções que pertencem à sua conta. Ela não pode ser desfeita.
          </Alert>
          <p className="text-secondary">
            Se existir qualquer evento com ingresso já emitido, a exclusão inteira será bloqueada e nenhum evento será apagado.
          </p>
          <Form.Group>
            <Form.Label>Digite <strong>EXCLUIR</strong> para confirmar</Form.Label>
            <Form.Control
              value={deleteAllConfirmation}
              onChange={(event) => setDeleteAllConfirmation(event.target.value)}
              placeholder="EXCLUIR"
              autoComplete="off"
              disabled={deletingAll}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={closeDeleteAll} disabled={deletingAll}>Cancelar</Button>
          <Button
            variant="danger"
            onClick={deleteAllEvents}
            disabled={deletingAll || deleteAllConfirmation.trim().toUpperCase() !== "EXCLUIR"}
          >
            <i className="fa-solid fa-trash-can me-2" />Excluir todos
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal show={bulkPublishOpen} onHide={closeBulkPublish} centered backdrop={bulkPublishing ? "static" : true} keyboard={!bulkPublishing}>
        <Modal.Header closeButton={!bulkPublishing}>
          <Modal.Title>Publicar todos os eventos</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {!bulkResult ? (
            <>
              <p className="mb-3">
                A Cutinapp publicará <strong>{bulkCandidates.length} evento(s)</strong> que já possuem dados básicos e pelo menos um lote de ingresso.
              </p>

              {bulkBlockedDrafts.length > 0 && (
                <Alert variant="warning">
                  <strong>{bulkBlockedDrafts.length} rascunho(s)</strong> ainda não estão prontos e serão mantidos como rascunho. Complete os dados ou crie o primeiro lote antes de publicá-los.
                </Alert>
              )}

              {bulkPublishing && (
                <div className="mt-3">
                  <div className="d-flex justify-content-between gap-3 mb-2">
                    <strong>{bulkProgress.done} de {bulkProgress.total}</strong>
                    <span>{bulkProgressPercent}%</span>
                  </div>
                  <ProgressBar now={bulkProgressPercent} animated={bulkProgress.done < bulkProgress.total} />
                  <div className="text-secondary mt-2 small text-truncate" title={bulkProgress.current}>
                    {bulkProgress.done < bulkProgress.total ? `Publicando: ${bulkProgress.current}` : "Finalizando publicação..."}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {bulkResult.published.length > 0 && (
                <Alert variant="success"><strong>{bulkResult.published.length} evento(s)</strong> publicado(s) com sucesso.</Alert>
              )}

              {bulkResult.failed.length > 0 && (
                <Alert variant="danger" className="mb-0">
                  <strong>{bulkResult.failed.length} evento(s)</strong> não puderam ser publicados.
                  <ul className="mb-0 mt-2 ps-3">
                    {bulkResult.failed.map((item) => (
                      <li key={item.id}><strong>{item.title}:</strong> {item.message}</li>
                    ))}
                  </ul>
                </Alert>
              )}

              {bulkResult.published.length === 0 && bulkResult.failed.length === 0 && (
                <Alert variant="info" className="mb-0">Não há novos eventos aptos para publicação.</Alert>
              )}
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          {!bulkResult ? (
            <>
              <Button variant="outline-secondary" onClick={closeBulkPublish} disabled={bulkPublishing}>Cancelar</Button>
              <Button variant="success" onClick={publishAll} disabled={bulkPublishing || bulkCandidates.length === 0}>
                <i className="fa-solid fa-rocket me-2" />
                {bulkPublishing ? `Publicando ${bulkProgress.done}/${bulkProgress.total}` : `Publicar ${bulkCandidates.length} evento(s)`}
              </Button>
            </>
          ) : (
            <Button onClick={closeBulkPublish}>Concluir</Button>
          )}
        </Modal.Footer>
      </Modal>

      <Modal show={Boolean(eventToDuplicate)} onHide={closeDuplicate} centered>
        <Modal.Header closeButton={!duplicating}>
          <Modal.Title>Duplicar evento</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="mb-2"><strong>{eventToDuplicate?.title}</strong></p>
          <p className="text-secondary">A Cutinapp criará um novo rascunho com a mesma duração, capa, local, line-up e lotes de ingresso. Horários do line-up e prazos dos lotes serão deslocados para a nova data.</p>
          <Alert variant="info">Vendas, participantes, passes, check-ins, avaliações e histórico do evento original não serão copiados.</Alert>
          <Form.Group>
            <Form.Label>Nova data *</Form.Label>
            <Form.Control
              type="date"
              value={duplicateDate}
              min={toDateInput(new Date())}
              onChange={(event) => {
                setDuplicateDate(event.target.value);
                setDuplicateError("");
              }}
              isInvalid={Boolean(duplicateError)}
              disabled={duplicating}
            />
            <Form.Text>O horário de início e a duração do evento original serão mantidos.</Form.Text>
            <Form.Control.Feedback type="invalid">{duplicateError}</Form.Control.Feedback>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={closeDuplicate} disabled={duplicating}>Cancelar</Button>
          <Button onClick={duplicate} disabled={duplicating || !duplicateDate}><i className="fa-regular fa-copy me-2" />Criar cópia</Button>
        </Modal.Footer>
      </Modal>

      <Modal
        show={Boolean(publishedEvent)}
        onHide={() => {
          setPublishedEvent(null);
          setCopiedEventId(null);
        }}
        centered
      >
        <Modal.Header closeButton><Modal.Title>Evento publicado</Modal.Title></Modal.Header>
        <Modal.Body>
          <p className="mb-2"><strong>{publishedEvent?.title}</strong> já está disponível para venda.</p>
          <p className="text-secondary mb-0">Compartilhe agora com um link identificado por canal para acelerar e medir o caminho até a primeira venda.</p>
        </Modal.Body>
        <Modal.Footer className="d-flex flex-wrap justify-content-start gap-2">
          <Button onClick={() => publishedEvent && shareWhatsApp(publishedEvent)}><i className="fa-brands fa-whatsapp me-2" />Compartilhar no WhatsApp</Button>
          <Button
            variant={copiedEventId === publishedEvent?.id ? "success" : "outline-light"}
            onClick={() => publishedEvent && copyLink(publishedEvent)}
            disabled={!publishedEvent?.slug}
          >
            <i className={`${copiedEventId === publishedEvent?.id ? "fa-solid fa-check" : "fa-regular fa-copy"} me-2`} />
            {copiedEventId === publishedEvent?.id ? "Link copiado" : "Copiar link"}
          </Button>
          <Button variant="outline-light" onClick={() => publishedEvent && share(publishedEvent)}><i className="fa-solid fa-share-nodes me-2" />Compartilhar</Button>
          <Button
            variant="outline-secondary"
            onClick={() => {
              if (!publishedEvent?.slug) return;
              trackProducerActivation("producer_public_event_opened", publishedEvent, { activation_stage: "distribution" });
              navigate(`/event/${publishedEvent.slug}`);
              setPublishedEvent(null);
              setCopiedEventId(null);
            }}
            disabled={!publishedEvent?.slug}
          >
            Ver página pública
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}