import React, { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Container, Dropdown, Form, Modal, ProgressBar, Table } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import eventService from "../../services/EventService";
import eventBulkService from "../../services/EventBulkService";
import cutinappService from "../../services/CutinappService";
import "./EventManagePage.css";

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
  && Number(event?.tickets_count || 0) > 0
);

const getSalesReadiness = (event) => {
  const hasBasics = hasEventBasics(event);
  const hasTickets = Number(event?.tickets_count || 0) > 0;
  const isPublished = Boolean(event?.is_published);
  const completed = [hasBasics, hasTickets, isPublished].filter(Boolean).length;

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

export default function EventManagePage() {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [eventToDuplicate, setEventToDuplicate] = useState(null);
  const [duplicateDate, setDuplicateDate] = useState("");
  const [duplicateError, setDuplicateError] = useState("");
  const [publishedEvent, setPublishedEvent] = useState(null);
  const [copiedEventId, setCopiedEventId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortMode, setSortMode] = useState("date-asc");
  const [bulkPublishOpen, setBulkPublishOpen] = useState(false);
  const [bulkPublishing, setBulkPublishing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0, current: "" });
  const [bulkResult, setBulkResult] = useState(null);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [deleteAllConfirmation, setDeleteAllConfirmation] = useState("");

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
    attention: events.filter((event) => !event.is_cancelled && getSalesReadiness(event).completed < 3).length,
    cancelled: events.filter((event) => event.is_cancelled).length,
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
    const filtered = events.filter((event) => {
      const status = getStatus(event).key;
      const matchesStatus = statusFilter === "all"
        || status === statusFilter
        || (statusFilter === "attention" && !event.is_cancelled && getSalesReadiness(event).completed < 3);

      if (!matchesStatus) return false;
      if (!normalizedSearch) return true;

      return [event.title, event.production?.name, event.venue, event.address, event.city]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("pt-BR").includes(normalizedSearch));
    });

    return [...filtered].sort((a, b) => {
      if (sortMode === "title") return String(a?.title || "").localeCompare(String(b?.title || ""), "pt-BR");
      if (sortMode === "status") return getStatus(a).label.localeCompare(getStatus(b).label, "pt-BR");

      const first = new Date(a?.start_date || 0).getTime();
      const second = new Date(b?.start_date || 0).getTime();
      const safeFirst = Number.isNaN(first) ? 0 : first;
      const safeSecond = Number.isNaN(second) ? 0 : second;
      return sortMode === "date-desc" ? safeSecond - safeFirst : safeFirst - safeSecond;
    });
  }, [events, searchTerm, sortMode, statusFilter]);

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

  const duplicating = String(busyId).startsWith("duplicate-");
  const deletingAll = busyId === "delete-all";
  const processingLabel = loading
    ? "Carregando eventos"
    : deletingAll
      ? "Excluindo todos os eventos"
      : bulkPublishing
        ? `Publicando ${bulkProgress.done} de ${bulkProgress.total} eventos`
        : duplicating
          ? "Duplicando evento"
          : "Atualizando evento";

  const bulkProgressPercent = bulkProgress.total
    ? Math.round((bulkProgress.done / bulkProgress.total) * 100)
    : 0;

  return (
    <div className="cut-app-page cut-event-manager-page">
      <NavlogComponent />
      {(loading || busyId || bulkPublishing) && <ProcessingIndicatorComponent label={processingLabel} />}

      <Container className="cut-page-container py-4 py-lg-5">
        <header className="cut-event-manager-hero">
          <div>
            <span className="cut-eyebrow">Área do produtor</span>
            <h1>Meus eventos</h1>
            <p>Gerencie seus eventos em uma visão única, rápida e operacional.</p>
          </div>
          <div className="d-flex flex-wrap gap-2 justify-content-end">
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

        {!loading && events.length === 0 ? (
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
              <button type="button" className={statusFilter === "all" ? "is-active" : ""} onClick={() => setStatusFilter("all")}><span>Todos</span><strong>{stats.total}</strong></button>
              <button type="button" className={statusFilter === "published" ? "is-active" : ""} onClick={() => setStatusFilter("published")}><span>Publicados</span><strong>{stats.published}</strong></button>
              <button type="button" className={statusFilter === "draft" ? "is-active" : ""} onClick={() => setStatusFilter("draft")}><span>Rascunhos</span><strong>{stats.draft}</strong></button>
              <button type="button" className={statusFilter === "attention" ? "is-active" : ""} onClick={() => setStatusFilter("attention")}><span>Precisam de ação</span><strong>{stats.attention}</strong></button>
              {stats.cancelled > 0 && <button type="button" className={statusFilter === "cancelled" ? "is-active" : ""} onClick={() => setStatusFilter("cancelled")}><span>Cancelados</span><strong>{stats.cancelled}</strong></button>}
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
                <Form.Select value={sortMode} onChange={(event) => setSortMode(event.target.value)} aria-label="Ordenar eventos">
                  <option value="date-asc">Próximos primeiro</option>
                  <option value="date-desc">Mais distantes primeiro</option>
                  <option value="title">Nome do evento</option>
                  <option value="status">Status</option>
                </Form.Select>
                {(searchTerm || statusFilter !== "all") && (
                  <Button variant="outline-light" onClick={() => { setSearchTerm(""); setStatusFilter("all"); }}>
                    <i className="fa-solid fa-filter-circle-xmark me-2" />Limpar
                  </Button>
                )}
              </div>
            </section>

            {visibleEvents.length === 0 ? (
              <div className="cut-event-manager-no-results">
                <i className="fa-solid fa-filter-circle-xmark" />
                <strong>Nenhum evento encontrado</strong>
                <span>Ajuste a busca ou remova o filtro para ver seus eventos.</span>
                <Button size="sm" variant="outline-light" onClick={() => { setSearchTerm(""); setStatusFilter("all"); }}>Limpar filtros</Button>
              </div>
            ) : (
              <section className="cut-event-admin-table-shell" aria-label="Tabela de gerenciamento de eventos">
                <div className="cut-event-admin-table-scroll table-responsive">
                  <Table className="cut-event-admin-table align-middle mb-0" hover>
                    <thead>
                      <tr>
                        <th className="cut-event-admin-table__event">Evento</th>
                        <th>Data</th>
                        <th>Local</th>
                        <th>Status</th>
                        <th>Ingressos</th>
                        <th>Preparação</th>
                        <th>Próxima ação</th>
                        <th className="cut-event-admin-table__actions">Gestão</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleEvents.map((event) => {
                        const readiness = getSalesReadiness(event);
                        const status = getStatus(event);
                        const progress = Math.round((readiness.completed / 3) * 100);
                        const needsAttention = !event.is_cancelled && readiness.completed < 3;

                        return (
                          <tr key={event.id} className={needsAttention ? "is-attention" : ""}>
                            <td className="cut-event-admin-table__event">
                              <button type="button" className="cut-event-admin-table__title" onClick={() => navigate(`/event/edit/${event.id}`)}>{event.title}</button>
                              <span className="cut-event-admin-table__production">{event.production?.name || "Produção não informada"}</span>
                            </td>
                            <td>
                              <span className="cut-event-admin-table__date"><i className="fa-regular fa-calendar" />{formatDate(event.start_date)}</span>
                            </td>
                            <td>
                              <span className="cut-event-admin-table__location"><i className="fa-solid fa-location-dot" />{event.venue || event.address || event.city || "Não informado"}</span>
                            </td>
                            <td><Badge bg={status.variant}>{status.label}</Badge></td>
                            <td>
                              <button type="button" className="cut-event-admin-table__link" onClick={() => navigate(`/ticket/create?eventId=${event.id}`)}>
                                <i className="fa-solid fa-ticket" />{Number(event.tickets_count || 0)} lote(s)
                              </button>
                            </td>
                            <td>
                              {event.is_cancelled ? (
                                <span className="cut-event-admin-table__muted">—</span>
                              ) : (
                                <div className="cut-event-admin-progress" title={`${readiness.completed} de 3 etapas concluídas`}>
                                  <div className="cut-event-admin-progress__top"><strong>{readiness.completed}/3</strong><span>{progress}%</span></div>
                                  <div className="cut-event-admin-progress__track"><span style={{ width: `${progress}%` }} /></div>
                                </div>
                              )}
                            </td>
                            <td>
                              {event.is_cancelled ? (
                                <span className="cut-event-admin-table__muted">Evento cancelado</span>
                              ) : (
                                <div className="cut-event-admin-next">
                                  <strong>{readiness.title}</strong>
                                  <span>{readiness.label}</span>
                                  <Button
                                    size="sm"
                                    variant={readiness.mode === "whatsapp" ? "success" : "light"}
                                    onClick={() => runPrimaryAction(event, readiness)}
                                    disabled={busyId === event.id || bulkPublishing || deletingAll}
                                  >
                                    <i className={`${readiness.icon} me-2`} />{readiness.action}
                                  </Button>
                                </div>
                              )}
                            </td>
                            <td className="cut-event-admin-table__actions">
                              <div className="cut-event-admin-actions">
                                <Button size="sm" variant="outline-light" onClick={() => navigate(`/event/edit/${event.id}`)} title="Editar evento" aria-label={`Editar ${event.title}`} disabled={bulkPublishing || deletingAll}>
                                  <i className="fa-solid fa-pen" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline-info"
                                  onClick={() => openDuplicate(event)}
                                  title="Copiar evento"
                                  aria-label={`Copiar ${event.title}`}
                                  disabled={Boolean(busyId) || bulkPublishing || deletingAll}
                                >
                                  <i className="fa-regular fa-copy" />
                                </Button>
                                <Dropdown align="end" className="cut-event-manager-more">
                                  <Dropdown.Toggle size="sm" variant="outline-light" aria-label={`Mais ações para ${event.title}`} disabled={bulkPublishing || deletingAll}>
                                    <i className="fa-solid fa-ellipsis" />
                                  </Dropdown.Toggle>
                                  <Dropdown.Menu>
                                    <Dropdown.Item onClick={() => navigate(`/ticket/create?eventId=${event.id}`)}><i className="fa-solid fa-ticket" />Novo lote</Dropdown.Item>
                                    <Dropdown.Item onClick={() => navigate(`/event/${event.id}/participants`)}><i className="fa-solid fa-users" />Participantes</Dropdown.Item>
                                    <Dropdown.Item onClick={() => navigate(`/event/${event.id}/courtesies`)}><i className="fa-solid fa-gift" />Cortesias</Dropdown.Item>
                                    <Dropdown.Item onClick={() => openDuplicate(event)} disabled={Boolean(busyId)}><i className="fa-regular fa-copy" />Duplicar evento</Dropdown.Item>
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
                                  </Dropdown.Menu>
                                </Dropdown>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>
                </div>
                <footer className="cut-event-admin-table-footer">
                  <span>Exibindo <strong>{visibleEvents.length}</strong> de <strong>{events.length}</strong> evento(s)</span>
                  <span><i className="fa-solid fa-arrows-left-right" /> No celular, deslize a tabela para ver todas as colunas.</span>
                </footer>
              </section>
            )}
          </>
        )}
      </Container>

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
                <Alert variant="success">
                  <strong>{bulkResult.published.length} evento(s)</strong> publicado(s) com sucesso.
                </Alert>
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