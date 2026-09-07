import React, { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Dropdown, Form, Modal, Row } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import eventService from "../../services/EventService";
import cutinappService from "../../services/CutinappService";
import "./EventManagePage.css";

const formatDate = (value) => value
  ? new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
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

const getSalesReadiness = (event) => {
  const hasBasics = hasEventBasics(event);
  const hasTickets = Number(event?.tickets_count || 0) > 0;
  const isPublished = Boolean(event?.is_published);
  const completed = [hasBasics, hasTickets, isPublished].filter(Boolean).length;

  if (!hasBasics) {
    return {
      completed,
      title: "Complete os dados do evento",
      label: "Preencha data, horário e local para liberar as próximas etapas.",
      action: "Completar evento",
      route: `/event/edit/${event.id}`,
    };
  }

  if (!hasTickets) {
    return {
      completed,
      title: "Crie o primeiro lote",
      label: "O evento precisa de pelo menos um lote para começar a vender.",
      action: "Criar lote de ingresso",
      route: `/ticket/create?eventId=${event.id}`,
    };
  }

  if (!isPublished) {
    return {
      completed,
      title: "Publique o evento",
      label: "Está tudo configurado. Publique agora para liberar a página de venda.",
      action: "Publicar e começar a vender",
      mode: "publish",
      route: null,
    };
  }

  return {
    completed,
    title: "Divulgue e gere vendas",
    label: "Seu evento está no ar. Compartilhe agora para levar público direto aos ingressos.",
    action: "Divulgar no WhatsApp",
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
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

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
          setSuccess("Agenda criada. As novas edições já aparecem na lista.");
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
        setPublishedEvent({ ...event, is_published: true, slug: response?.event?.slug || event.slug });
      }
      setSuccess(event.is_published ? (response.message || "Evento retirado da publicação.") : "Evento publicado. Agora compartilhe a página pública para buscar a primeira venda.");
    } catch (err) {
      setError(err?.message || "Não foi possível alterar a publicação do evento.");
    } finally {
      setBusyId(null);
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
        await navigator.clipboard.writeText(url);
        trackProducerActivation("producer_event_shared", event, { channel: "clipboard", activation_stage: "distribution", campaign: "first_sale" });
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

  const stats = useMemo(() => ({
    total: events.length,
    published: events.filter((event) => event.is_published && !event.is_cancelled).length,
    draft: events.filter((event) => !event.is_published && !event.is_cancelled).length,
    attention: events.filter((event) => !event.is_cancelled && getSalesReadiness(event).completed < 3).length,
    cancelled: events.filter((event) => event.is_cancelled).length,
  }), [events]);

  const visibleEvents = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLocaleLowerCase("pt-BR");

    return events
      .filter((event) => {
        const status = getStatus(event).key;
        const matchesStatus = statusFilter === "all"
          || status === statusFilter
          || (statusFilter === "attention" && !event.is_cancelled && getSalesReadiness(event).completed < 3);

        if (!matchesStatus) return false;
        if (!normalizedSearch) return true;

        return [event.title, event.production?.name, event.venue, event.address, event.city]
          .filter(Boolean)
          .some((value) => String(value).toLocaleLowerCase("pt-BR").includes(normalizedSearch));
      })
      .sort((a, b) => {
        const first = new Date(a?.start_date || 0).getTime();
        const second = new Date(b?.start_date || 0).getTime();
        if (!first && !second) return 0;
        if (!first) return 1;
        if (!second) return -1;
        return first - second;
      });
  }, [events, searchTerm, statusFilter]);

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
  const processingLabel = loading ? "Carregando eventos" : duplicating ? "Duplicando evento" : "Atualizando evento";

  return (
    <div className="cut-app-page cut-event-manager-page">
      <NavlogComponent />
      {(loading || busyId) && <ProcessingIndicatorComponent label={processingLabel} />}

      <Container className="cut-page-container py-4 py-lg-5">
        <header className="cut-event-manager-hero">
          <div>
            <span className="cut-eyebrow">Área do produtor</span>
            <h1>Meus eventos</h1>
            <p>Veja rapidamente o que está pronto, o que falta e qual é a próxima ação de cada evento.</p>
          </div>
          <Button className="cut-event-manager-new" onClick={() => navigate("/event/create")}>
            <i className="fa-solid fa-plus me-2" />Novo evento
          </Button>
        </header>

        <div className="cut-event-flow" aria-label="Fluxo de publicação do evento">
          <span><b>1</b> Dados do evento</span>
          <i className="fa-solid fa-chevron-right" aria-hidden="true" />
          <span><b>2</b> Ingressos</span>
          <i className="fa-solid fa-chevron-right" aria-hidden="true" />
          <span><b>3</b> Publicar</span>
          <i className="fa-solid fa-chevron-right" aria-hidden="true" />
          <span><b>4</b> Divulgar e vender</span>
        </div>

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
            <section className="cut-event-manager-stats" aria-label="Resumo dos eventos">
              <button type="button" className={statusFilter === "all" ? "is-active" : ""} onClick={() => setStatusFilter("all")}>
                <span>Total</span><strong>{stats.total}</strong>
              </button>
              <button type="button" className={statusFilter === "published" ? "is-active" : ""} onClick={() => setStatusFilter("published")}>
                <span>Publicados</span><strong>{stats.published}</strong>
              </button>
              <button type="button" className={statusFilter === "draft" ? "is-active" : ""} onClick={() => setStatusFilter("draft")}>
                <span>Rascunhos</span><strong>{stats.draft}</strong>
              </button>
              <button type="button" className={statusFilter === "attention" ? "is-active" : ""} onClick={() => setStatusFilter("attention")}>
                <span>Precisam de ação</span><strong>{stats.attention}</strong>
              </button>
            </section>

            <section className="cut-event-manager-toolbar">
              <div className="cut-event-manager-search">
                <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
                <Form.Control
                  type="search"
                  placeholder="Buscar por evento, produção ou local"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  aria-label="Buscar meus eventos"
                />
              </div>

              <div className="cut-event-manager-filters" aria-label="Filtrar eventos por status">
                <Button size="sm" variant={statusFilter === "all" ? "light" : "outline-light"} onClick={() => setStatusFilter("all")}>Todos</Button>
                <Button size="sm" variant={statusFilter === "published" ? "success" : "outline-light"} onClick={() => setStatusFilter("published")}>Publicados</Button>
                <Button size="sm" variant={statusFilter === "draft" ? "secondary" : "outline-light"} onClick={() => setStatusFilter("draft")}>Rascunhos</Button>
                {stats.cancelled > 0 && <Button size="sm" variant={statusFilter === "cancelled" ? "danger" : "outline-light"} onClick={() => setStatusFilter("cancelled")}>Cancelados</Button>}
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
              <Row className="g-3 g-lg-4">
                {visibleEvents.map((event) => {
                  const readiness = getSalesReadiness(event);
                  const status = getStatus(event);
                  const progress = Math.round((readiness.completed / 3) * 100);
                  const basicsDone = hasEventBasics(event);
                  const ticketsDone = Number(event.tickets_count || 0) > 0;
                  const publicationDone = Boolean(event.is_published);

                  return (
                    <Col xl={6} key={event.id}>
                      <Card className="cut-event-manager-card h-100">
                        <Card.Body>
                          <div className="cut-event-manager-card__header">
                            <div className="cut-event-manager-card__identity">
                              <span className="cut-eyebrow">{event.production?.name || "Produção"}</span>
                              <h2>{event.title}</h2>
                            </div>
                            <Badge bg={status.variant}>{status.label}</Badge>
                          </div>

                          <div className="cut-event-manager-card__meta">
                            <span><i className="fa-regular fa-calendar" />{formatDate(event.start_date)}</span>
                            <span><i className="fa-solid fa-location-dot" />{event.venue || event.address || event.city || "Local não informado"}</span>
                            <span><i className="fa-solid fa-ticket" />{Number(event.tickets_count || 0)} lote(s)</span>
                          </div>

                          {event.is_cancelled ? (
                            <div className="cut-event-manager-cancelled">
                              <i className="fa-solid fa-ban" />
                              <div><strong>Evento cancelado</strong><span>Você ainda pode editar ou duplicar este evento para reaproveitar a configuração.</span></div>
                            </div>
                          ) : (
                            <section className={`cut-event-next-step ${readiness.completed === 3 ? "is-ready" : ""}`}>
                              <div className="cut-event-next-step__heading">
                                <div>
                                  <span>Próximo passo</span>
                                  <strong>{readiness.title}</strong>
                                </div>
                                <span className="cut-event-next-step__score">{readiness.completed}/3</span>
                              </div>

                              <div className="cut-event-next-step__track" aria-label={`${readiness.completed} de 3 etapas concluídas`}>
                                <span style={{ width: `${progress}%` }} />
                              </div>

                              <div className="cut-event-next-step__steps" aria-hidden="true">
                                <span className={basicsDone ? "is-done" : ""}><i className={basicsDone ? "fa-solid fa-check" : "fa-solid fa-circle"} />Dados</span>
                                <span className={ticketsDone ? "is-done" : ""}><i className={ticketsDone ? "fa-solid fa-check" : "fa-solid fa-circle"} />Ingressos</span>
                                <span className={publicationDone ? "is-done" : ""}><i className={publicationDone ? "fa-solid fa-check" : "fa-solid fa-circle"} />Publicação</span>
                              </div>

                              <p>{readiness.label}</p>
                              <Button
                                className="cut-event-next-step__button"
                                variant={readiness.mode === "whatsapp" ? "success" : "light"}
                                onClick={() => runPrimaryAction(event, readiness)}
                                disabled={busyId === event.id}
                              >
                                {readiness.mode === "whatsapp" && <i className="fa-brands fa-whatsapp me-2" />}
                                {readiness.mode === "publish" && <i className="fa-solid fa-rocket me-2" />}
                                {readiness.action}
                              </Button>
                            </section>
                          )}

                          <div className="cut-event-manager-card__actions">
                            <Button variant="outline-light" onClick={() => navigate(`/event/edit/${event.id}`)}>
                              <i className="fa-solid fa-pen me-2" />Editar
                            </Button>
                            <Button variant="outline-light" onClick={() => navigate(`/ticket/create?eventId=${event.id}`)}>
                              <i className="fa-solid fa-ticket me-2" />Novo lote
                            </Button>
                            <Button variant="outline-light" onClick={() => navigate(`/event/${event.id}/participants`)}>
                              <i className="fa-solid fa-users me-2" />Participantes
                            </Button>

                            <Dropdown align="end" className="cut-event-manager-more">
                              <Dropdown.Toggle variant="outline-light">
                                <i className="fa-solid fa-ellipsis me-2" />Mais
                              </Dropdown.Toggle>
                              <Dropdown.Menu>
                                <Dropdown.Item onClick={() => navigate(`/event/${event.id}/courtesies`)}><i className="fa-solid fa-gift" />Cortesias</Dropdown.Item>
                                <Dropdown.Item onClick={() => openDuplicate(event)} disabled={Boolean(busyId)}><i className="fa-regular fa-copy" />Duplicar evento</Dropdown.Item>
                                {event.is_published && !event.is_cancelled && <Dropdown.Item onClick={() => navigate(`/checkin?eventId=${event.id}`)}><i className="fa-solid fa-qrcode" />Portaria / check-in</Dropdown.Item>}
                                {event.is_published && !event.is_cancelled && <Dropdown.Item onClick={() => navigate(`/event/${event.slug}`)}><i className="fa-solid fa-arrow-up-right-from-square" />Página pública</Dropdown.Item>}
                                {event.is_published && !event.is_cancelled && <Dropdown.Item onClick={() => share(event)}><i className="fa-solid fa-share-nodes" />Compartilhar link</Dropdown.Item>}
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
                        </Card.Body>
                      </Card>
                    </Col>
                  );
                })}
              </Row>
            )}
          </>
        )}
      </Container>

      <Modal show={Boolean(eventToDuplicate)} onHide={closeDuplicate} centered>
        <Modal.Header closeButton={!duplicating}>
          <Modal.Title>Duplicar evento</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="mb-2"><strong>{eventToDuplicate?.title}</strong></p>
          <p className="text-secondary">
            A Cutinapp criará um novo rascunho com a mesma duração, capa, local, line-up e lotes de ingresso. Horários do line-up e prazos dos lotes serão deslocados para a nova data.
          </p>
          <Alert variant="info">
            Vendas, participantes, passes, check-ins, avaliações e histórico do evento original não serão copiados.
          </Alert>
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
          <Button onClick={duplicate} disabled={duplicating || !duplicateDate}>
            <i className="fa-regular fa-copy me-2" />Criar cópia
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal show={Boolean(publishedEvent)} onHide={() => setPublishedEvent(null)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Evento publicado</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="mb-2"><strong>{publishedEvent?.title}</strong> já está disponível para venda.</p>
          <p className="text-secondary mb-0">Compartilhe agora com um link identificado por canal para acelerar e medir o caminho até a primeira venda.</p>
        </Modal.Body>
        <Modal.Footer className="d-flex flex-wrap justify-content-start gap-2">
          <Button onClick={() => publishedEvent && shareWhatsApp(publishedEvent)}>
            <i className="fa-brands fa-whatsapp me-2" />Compartilhar no WhatsApp
          </Button>
          <Button variant="outline-light" onClick={() => publishedEvent && share(publishedEvent)}>
            <i className="fa-solid fa-share-nodes me-2" />Compartilhar
          </Button>
          <Button variant="outline-secondary" onClick={() => {
            if (!publishedEvent?.slug) return;
            trackProducerActivation("producer_public_event_opened", publishedEvent, { activation_stage: "distribution" });
            navigate(`/event/${publishedEvent.slug}`);
            setPublishedEvent(null);
          }} disabled={!publishedEvent?.slug}>
            Ver página pública
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
