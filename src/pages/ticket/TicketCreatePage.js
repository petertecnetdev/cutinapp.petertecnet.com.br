import React, { useContext, useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Row, Spinner } from "react-bootstrap";
import { useLocation, useNavigate } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import ticketService from "../../services/TicketService";
import eventService from "../../services/EventService";
import { AuthContext } from "../../context/AuthContext";
import { nextProducerActivationRoute } from "../../utils/producerActivationRoute";
import { clearTicketCreationDraft, readTicketCreationDraft, writeTicketCreationDraft } from "../../utils/ticketCreationDraft";

const pad = (value) => String(value).padStart(2, "0");
const toLocalInput = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
const money = (value) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const formatDateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(date);
};
const minimumWithdrawalDate = () => {
  const date = new Date();
  date.setHours(date.getHours() + 1);
  date.setSeconds(0, 0);
  return date;
};
const suggestedLimitDate = (event) => {
  if (!event?.start_date) return "";
  const start = new Date(event.start_date);
  if (Number.isNaN(start.getTime())) return "";
  const minimum = minimumWithdrawalDate();
  const suggestion = new Date(start.getTime() - 60 * 60 * 1000);
  return suggestion >= minimum ? toLocalInput(suggestion) : "";
};
const firstError = (errors, field) => {
  const value = errors?.[field];
  if (Array.isArray(value)) return value[0] || "";
  return typeof value === "string" ? value : "";
};
const ticketSignature = (ticket) => [
  ticket?.name,
  ticket?.ticket_type,
  Number(ticket?.price || 0).toFixed(2),
  Number(ticket?.quantity || 0),
  ticket?.description || "",
].join("|");

export default function TicketCreatePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const requestedEventId = new URLSearchParams(location.search).get("eventId") || "";
  const draftOwnerId = Number(user?.id || 0);

  const [events, setEvents] = useState([]);
  const [selectedEventIds, setSelectedEventIds] = useState(requestedEventId ? [String(requestedEventId)] : []);
  const [mode, setMode] = useState("new");
  const [library, setLibrary] = useState([]);
  const [libraryLoaded, setLibraryLoaded] = useState(false);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [sourceTicketId, setSourceTicketId] = useState("");

  const [kind, setKind] = useState("paid");
  const [name, setName] = useState("1º Lote");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState(100);
  const [limitDate, setLimitDate] = useState("");
  const [description, setDescription] = useState("Ingresso para acesso ao evento mediante QR Code individual.");
  const [optionalDetailsOpen, setOptionalDetailsOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);

  const eligibleEvents = useMemo(() => events.filter((item) => !item.is_cancelled), [events]);
  const selectedEvents = useMemo(
    () => eligibleEvents.filter((item) => selectedEventIds.includes(String(item.id))),
    [eligibleEvents, selectedEventIds]
  );
  const earliestSelectedEvent = useMemo(() => {
    const dated = selectedEvents
      .filter((item) => item.start_date && !Number.isNaN(new Date(item.start_date).getTime()))
      .sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
    return dated[0] || null;
  }, [selectedEvents]);
  const minimumLimit = useMemo(() => toLocalInput(minimumWithdrawalDate()), [selectedEventIds]);
  const maximumLimit = useMemo(() => {
    if (!earliestSelectedEvent?.start_date) return "";
    return toLocalInput(new Date(earliestSelectedEvent.start_date));
  }, [earliestSelectedEvent]);
  const selectedSourceTicket = useMemo(
    () => library.find((ticket) => String(ticket.id) === String(sourceTicketId)) || null,
    [library, sourceTicketId]
  );

  useEffect(() => {
    let active = true;
    eventService.myEvents()
      .then((items) => {
        if (!active) return;
        setEvents(items);
        const eligible = items.filter((item) => !item.is_cancelled);
        const requested = requestedEventId
          ? eligible.find((item) => String(item.id) === String(requestedEventId))
          : null;

        if (requestedEventId && !requested) {
          setSelectedEventIds([]);
          setError("O evento informado não pertence às suas produções ou está cancelado. Selecione um evento válido.");
          return;
        }

        if (requested) {
          setSelectedEventIds([String(requested.id)]);
          const draft = readTicketCreationDraft(draftOwnerId, requested.id);
          if (draft) {
            setKind(draft.kind || "paid");
            setName(draft.name || "1º Lote");
            setPrice(draft.price ?? "");
            setQuantity(draft.quantity ?? 100);
            setLimitDate(draft.limitDate || suggestedLimitDate(requested));
            setDescription(draft.description || "Ingresso para acesso ao evento mediante QR Code individual.");
            setOptionalDetailsOpen(Boolean(draft.optionalDetailsOpen));
            setDraftRestored(true);
          } else {
            setLimitDate(suggestedLimitDate(requested));
            const capacity = Number(requested.max_attendees || 0);
            if (Number.isInteger(capacity) && capacity > 0) setQuantity(Math.min(capacity, 100000));
          }
        } else if (eligible.length === 1) {
          setSelectedEventIds([String(eligible[0].id)]);
          setLimitDate(suggestedLimitDate(eligible[0]));
        }
      })
      .catch((err) => active && setError(err?.message || "Não foi possível carregar seus eventos."))
      .finally(() => active && setInitialLoading(false));
    return () => { active = false; };
  }, [requestedEventId, draftOwnerId]);

  useEffect(() => {
    if (!draftOwnerId || mode !== "new" || selectedEventIds.length !== 1 || initialLoading || loading) return undefined;
    const eventId = selectedEventIds[0];
    const timer = window.setTimeout(() => {
      writeTicketCreationDraft(draftOwnerId, eventId, {
        kind, name, price, quantity, limitDate, description, optionalDetailsOpen,
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [draftOwnerId, mode, selectedEventIds, kind, name, price, quantity, limitDate, description, optionalDetailsOpen, initialLoading, loading]);

  const loadTicketLibrary = async () => {
    if (libraryLoaded || libraryLoading) return;
    setLibraryLoading(true);
    setError("");
    try {
      const collected = [];
      const batchSize = 6;
      for (let index = 0; index < eligibleEvents.length; index += batchSize) {
        const batch = eligibleEvents.slice(index, index + batchSize);
        const responses = await Promise.allSettled(batch.map(async (event) => ({
          event,
          tickets: await ticketService.listByEvent(event.id),
        })));
        responses.forEach((result) => {
          if (result.status !== "fulfilled") return;
          result.value.tickets.forEach((ticket) => collected.push({
            ...ticket,
            source_event: result.value.event,
          }));
        });
      }

      const seen = new Set();
      const unique = collected
        .sort((a, b) => Number(b.id) - Number(a.id))
        .filter((ticket) => {
          const signature = ticketSignature(ticket);
          if (seen.has(signature)) return false;
          seen.add(signature);
          return true;
        });
      setLibrary(unique);
      setLibraryLoaded(true);
      if (unique.length > 0) setSourceTicketId(String(unique[0].id));
    } catch (err) {
      setError(err?.message || "Não foi possível carregar os ingressos já criados.");
    } finally {
      setLibraryLoading(false);
    }
  };

  const changeMode = (value) => {
    setMode(value);
    setSubmitted(false);
    setFieldErrors({});
    setError("");
    if (value === "reuse") loadTicketLibrary();
  };

  const toggleEvent = (eventId) => {
    const id = String(eventId);
    setSelectedEventIds((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id]);
    setFieldErrors((current) => ({ ...current, event_id: undefined, event_ids: undefined }));
  };

  const selectAllEvents = () => setSelectedEventIds(eligibleEvents.map((item) => String(item.id)));
  const clearEvents = () => setSelectedEventIds([]);

  const changeKind = (value) => {
    setKind(value);
    if (value === "free") {
      setName("Cortesia");
      setPrice("0.00");
      setDescription("Entrada gratuita mediante apresentação do QR Code individual.");
    } else {
      setName("1º Lote");
      setPrice("");
      setDescription("Ingresso para acesso ao evento mediante QR Code individual.");
    }
  };

  const normalizedPrice = kind === "free" ? 0 : Number(price);
  const priceInvalid = mode === "new" && kind === "paid" && (!String(price).trim() || !Number.isFinite(normalizedPrice) || normalizedPrice < 0.01 || normalizedPrice > 999999.99);
  const limitDateInvalid = useMemo(() => {
    if (mode !== "new" || !limitDate) return false;
    const limit = new Date(limitDate);
    if (Number.isNaN(limit.getTime()) || limit < new Date(minimumLimit)) return true;
    return Boolean(maximumLimit && limit > new Date(maximumLimit));
  }, [mode, limitDate, minimumLimit, maximumLimit]);
  const canSubmit = mode === "reuse"
    ? selectedEventIds.length > 0 && Boolean(sourceTicketId) && !loading
    : selectedEventIds.length > 0 && name.trim() && Number(quantity) > 0 && Number(quantity) <= 100000 && !priceInvalid && !limitDateInvalid && !loading;

  const submit = async (event) => {
    event.preventDefault();
    setSubmitted(true);
    setError("");
    setFieldErrors({});

    if (!canSubmit) {
      if (selectedEventIds.length === 0) setError("Selecione pelo menos um evento.");
      else if (mode === "reuse" && !sourceTicketId) setError("Escolha o ingresso que deseja reutilizar.");
      else if (limitDateInvalid) setError("O prazo precisa ficar entre 1 hora após agora e o início do primeiro evento selecionado.");
      else if (priceInvalid) setError("Informe um preço válido a partir de R$ 0,01.");
      else setError("Revise os campos antes de continuar.");
      return;
    }

    setLoading(true);
    try {
      const response = await ticketService.store(mode === "reuse" ? {
        source_ticket_id: Number(sourceTicketId),
        event_ids: selectedEventIds.map(Number),
      } : {
        event_ids: selectedEventIds.map(Number),
        name: name.trim(),
        quantity: Number(quantity),
        price: normalizedPrice,
        ticket_type: kind === "free" ? "courtesy" : "standard",
        limit_date: limitDate || null,
        description: description.trim() || null,
      });

      const tickets = Array.isArray(response?.tickets) ? response.tickets : response?.ticket ? [response.ticket] : [];
      const firstTicket = tickets[0];
      if (!firstTicket?.id) throw new Error("A API não retornou os ingressos vinculados.");

      selectedEventIds.forEach((id) => clearTicketCreationDraft(draftOwnerId, id));
      try {
        window.PeterTecnetTelemetry?.track?.("producer_ticket_multi_event_created", {
          label: mode === "reuse" ? "Ingresso existente aplicado a vários eventos" : "Ingresso criado para vários eventos",
          target: selectedEventIds.join(","),
          metadata: {
            mode,
            event_count: selectedEventIds.length,
            source_ticket_id: mode === "reuse" ? Number(sourceTicketId) : null,
            created_count: Number(response?.created_count || 0),
            existing_count: Number(response?.existing_count || 0),
          },
        });
      } catch (_) {
        // Telemetry must never interrupt producer workflow.
      }

      if (selectedEventIds.length === 1) {
        const ticketType = Number(firstTicket.price || 0) > 0 ? "paid" : "free";
        navigate(nextProducerActivationRoute({
          eventId: selectedEventIds[0],
          ticketId: firstTicket.id,
          ticketType,
        }), { replace: true });
      } else {
        navigate("/event/manage", {
          replace: true,
          state: {
            successMessage: response?.message || `Ingresso aplicado a ${selectedEventIds.length} eventos.`,
          },
        });
      }
    } catch (err) {
      const errors = err?.errors || {};
      setFieldErrors(errors);
      if (errors?.limit_date || errors?.description) setOptionalDetailsOpen(true);
      setError(err?.message || "Não foi possível aplicar o ingresso aos eventos selecionados.");
    } finally {
      setLoading(false);
    }
  };

  const invalid = (field, local = false) => Boolean(local || firstError(fieldErrors, field));

  return (
    <div className="cut-app-page">
      <NavlogComponent />
      {(loading || initialLoading) && <ProcessingIndicatorComponent label={loading ? "Aplicando ingresso" : "Carregando eventos"} />}
      <Container className="cut-page-container py-4 py-lg-5">
        <div className="cut-page-heading">
          <div>
            <span className="cut-eyebrow">Ingressos do produtor</span>
            <h1>Crie uma vez e use em vários eventos</h1>
            <p>Cadastre um ingresso novo ou reutilize um que já existe. Cada evento receberá seu próprio ingresso, estoque e vendas independentes.</p>
          </div>
        </div>

        {error && <Alert variant="danger">{error}</Alert>}
        {draftRestored && mode === "new" && (
          <Alert variant="info" dismissible onClose={() => setDraftRestored(false)}>Recuperamos o rascunho que você estava configurando.</Alert>
        )}

        {!initialLoading && eligibleEvents.length === 0 ? (
          <Card className="cut-empty-state">
            <Card.Body>
              <h2>Você ainda não tem eventos disponíveis</h2>
              <p>Crie um evento antes de configurar ingressos.</p>
              <Button onClick={() => navigate("/event/create")}>Criar evento</Button>
            </Card.Body>
          </Card>
        ) : (
          <Row className="justify-content-center">
            <Col lg={9} xl={8}>
              <Card className="cut-panel">
                <Card.Body className="p-4 p-lg-5">
                  <div className="d-flex gap-2 flex-wrap mb-4">
                    <Button type="button" variant={mode === "new" ? "primary" : "outline-light"} onClick={() => changeMode("new")}>
                      <i className="fa-solid fa-plus me-2" />Criar novo
                    </Button>
                    <Button type="button" variant={mode === "reuse" ? "primary" : "outline-light"} onClick={() => changeMode("reuse")}>
                      <i className="fa-solid fa-copy me-2" />Usar ingresso já criado
                    </Button>
                  </div>

                  <Form onSubmit={submit} noValidate>
                    <Form.Group className="mb-4">
                      <div className="d-flex align-items-center justify-content-between gap-3 flex-wrap mb-2">
                        <Form.Label className="mb-0">Eventos que receberão o ingresso *</Form.Label>
                        <div className="d-flex gap-2">
                          <Button type="button" size="sm" variant="outline-light" onClick={selectAllEvents}>Selecionar todos</Button>
                          <Button type="button" size="sm" variant="link" onClick={clearEvents}>Limpar</Button>
                        </div>
                      </div>
                      <div className={`border rounded p-2 ${submitted && selectedEventIds.length === 0 ? "border-danger" : ""}`} style={{ maxHeight: 280, overflowY: "auto" }}>
                        {eligibleEvents.map((item) => {
                          const checked = selectedEventIds.includes(String(item.id));
                          return (
                            <label key={item.id} className="d-flex align-items-start gap-3 p-2 rounded" style={{ cursor: "pointer" }}>
                              <Form.Check checked={checked} onChange={() => toggleEvent(item.id)} aria-label={`Selecionar ${item.title}`} />
                              <span className="flex-grow-1">
                                <strong className="d-block">{item.title}</strong>
                                <small className="text-body-secondary">{formatDateTime(item.start_date)} · {item.is_published ? "publicado" : "rascunho"}</small>
                              </span>
                              {checked && <Badge bg="primary">selecionado</Badge>}
                            </label>
                          );
                        })}
                      </div>
                      {(firstError(fieldErrors, "event_ids") || firstError(fieldErrors, "event_id")) && <div className="text-danger small mt-1">{firstError(fieldErrors, "event_ids") || firstError(fieldErrors, "event_id")}</div>}
                      <Form.Text>{selectedEventIds.length} evento(s) selecionado(s). Cada evento terá estoque e vendas separados.</Form.Text>
                    </Form.Group>

                    {mode === "reuse" ? (
                      <div className="mb-4">
                        <h2 className="h5">Ingresso para reutilizar</h2>
                        {libraryLoading ? (
                          <div className="d-flex align-items-center gap-2 py-3"><Spinner size="sm" /> Carregando seus ingressos...</div>
                        ) : library.length === 0 ? (
                          <Alert variant="secondary">Você ainda não possui um ingresso anterior para reutilizar. Use “Criar novo” e ele ficará disponível aqui nas próximas vezes.</Alert>
                        ) : (
                          <Form.Select value={sourceTicketId} onChange={(event) => setSourceTicketId(event.target.value)} isInvalid={submitted && !sourceTicketId}>
                            <option value="">Selecione um ingresso</option>
                            {library.map((ticket) => (
                              <option key={ticket.id} value={ticket.id}>
                                {ticket.name} · {money(ticket.price)} · {ticket.quantity} un. · {ticket.source_event?.title || "evento"}
                              </option>
                            ))}
                          </Form.Select>
                        )}
                        {selectedSourceTicket && (
                          <div className="cut-info-box mt-3">
                            <strong>{selectedSourceTicket.name} · {money(selectedSourceTicket.price)}</strong>
                            <span>Quantidade por evento: {selectedSourceTicket.quantity}. O prazo será reaproveitado quando compatível; em eventos com outra data, a API adapta o fechamento mantendo a segurança da venda.</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <Row className="g-3">
                        <Col xs={12}>
                          <Form.Group>
                            <Form.Label>Tipo *</Form.Label>
                            <div className="d-flex gap-2 flex-wrap">
                              <Button type="button" variant={kind === "paid" ? "primary" : "outline-light"} onClick={() => changeKind("paid")}>Ingresso pago</Button>
                              <Button type="button" variant={kind === "free" ? "primary" : "outline-light"} onClick={() => changeKind("free")}>Cortesia</Button>
                            </div>
                          </Form.Group>
                        </Col>
                        <Col md={kind === "paid" ? 5 : 7}>
                          <Form.Group>
                            <Form.Label>Nome do ingresso *</Form.Label>
                            <Form.Control value={name} onChange={(event) => setName(event.target.value)} isInvalid={invalid("name", submitted && !name.trim())} />
                            <Form.Control.Feedback type="invalid">{firstError(fieldErrors, "name") || "Informe o nome do ingresso."}</Form.Control.Feedback>
                          </Form.Group>
                        </Col>
                        {kind === "paid" && (
                          <Col md={2}>
                            <Form.Group>
                              <Form.Label>Preço *</Form.Label>
                              <Form.Control type="number" min="0.01" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} isInvalid={invalid("price", submitted && priceInvalid)} />
                              <Form.Control.Feedback type="invalid">{firstError(fieldErrors, "price") || "Mínimo R$ 0,01."}</Form.Control.Feedback>
                            </Form.Group>
                          </Col>
                        )}
                        <Col md={5}>
                          <Form.Group>
                            <Form.Label>Quantidade por evento *</Form.Label>
                            <Form.Control type="number" min={1} max={100000} value={quantity} onChange={(event) => setQuantity(event.target.value)} isInvalid={invalid("quantity", submitted && (Number(quantity) < 1 || Number(quantity) > 100000))} />
                            <Form.Control.Feedback type="invalid">{firstError(fieldErrors, "quantity") || "Informe de 1 a 100.000."}</Form.Control.Feedback>
                          </Form.Group>
                        </Col>
                        <Col xs={12}>
                          {!optionalDetailsOpen ? (
                            <Button type="button" variant="link" className="px-0" onClick={() => setOptionalDetailsOpen(true)}>Definir prazo ou descrição</Button>
                          ) : (
                            <Row className="g-3">
                              <Col xs={12}>
                                <Form.Group>
                                  <Form.Label>Disponível até</Form.Label>
                                  <Form.Control type="datetime-local" min={minimumLimit} max={maximumLimit || undefined} value={limitDate} onChange={(event) => setLimitDate(event.target.value)} isInvalid={invalid("limit_date", submitted && limitDateInvalid)} />
                                  <Form.Text>Quando vários eventos estiverem selecionados, o prazo precisa ser anterior ao primeiro deles. Você também pode deixar em branco.</Form.Text>
                                  <Form.Control.Feedback type="invalid">{firstError(fieldErrors, "limit_date") || "Informe um prazo válido."}</Form.Control.Feedback>
                                </Form.Group>
                              </Col>
                              <Col xs={12}>
                                <Form.Group>
                                  <Form.Label>Descrição</Form.Label>
                                  <Form.Control as="textarea" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
                                </Form.Group>
                              </Col>
                            </Row>
                          )}
                        </Col>
                      </Row>
                    )}

                    <div className="cut-info-box mt-4">
                      <strong>{mode === "reuse" ? "Um clique, vários eventos" : `${name || "Novo ingresso"} · ${kind === "free" ? "gratuito" : money(normalizedPrice)}`}</strong>
                      <span>{selectedEventIds.length > 1 ? `A configuração será aplicada a ${selectedEventIds.length} eventos. Cada cópia terá ID, estoque, vendas, reservas e QR Codes independentes.` : "Selecione mais eventos para aplicar a mesma configuração em massa."}</span>
                    </div>

                    <div className="cut-form-actions mt-4">
                      <Button type="button" variant="outline-light" disabled={loading} onClick={() => navigate(requestedEventId ? `/event/edit/${requestedEventId}` : "/event/manage")}>Cancelar</Button>
                      <Button type="submit" disabled={!canSubmit}>
                        {loading ? "Aplicando..." : mode === "reuse" ? `Aplicar em ${selectedEventIds.length || 0} evento(s)` : `Criar em ${selectedEventIds.length || 0} evento(s)`}
                      </Button>
                    </div>
                  </Form>
                </Card.Body>
              </Card>
            </Col>
          </Row>
        )}
      </Container>
    </div>
  );
}
