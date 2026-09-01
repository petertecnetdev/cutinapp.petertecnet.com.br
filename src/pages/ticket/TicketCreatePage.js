import React, { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import { useLocation, useNavigate } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import ticketService from "../../services/TicketService";
import eventService from "../../services/EventService";

const pad = (value) => String(value).padStart(2, "0");
const toLocalInput = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
const formatDateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeStyle: "short" }).format(date);
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
  const chosen = suggestion >= minimum ? suggestion : start;
  if (chosen < minimum || chosen > start) return "";
  return toLocalInput(chosen);
};
const firstError = (errors, field) => {
  const value = errors?.[field];
  if (Array.isArray(value)) return value[0] || "";
  return typeof value === "string" ? value : "";
};

export default function TicketCreatePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const requestedEventId = new URLSearchParams(location.search).get("eventId") || "";
  const [eventId, setEventId] = useState(requestedEventId);
  const [events, setEvents] = useState([]);
  const [kind, setKind] = useState("paid");
  const [name, setName] = useState("1º Lote");
  const [price, setPrice] = useState("0.01");
  const [quantity, setQuantity] = useState(100);
  const [limitDate, setLimitDate] = useState("");
  const [description, setDescription] = useState("Ingresso para acesso ao evento mediante QR Code individual.");
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let active = true;
    eventService.myEvents()
      .then((items) => {
        if (!active) return;
        setEvents(items);
        const exists = items.some((item) => String(item.id) === String(requestedEventId));
        if (!exists && requestedEventId) {
          setEventId("");
          setError("O evento informado não pertence às suas produções Cutinapp. Selecione um evento válido.");
          return;
        }
        const selected = items.find((item) => String(item.id) === String(requestedEventId));
        if (selected) setLimitDate(suggestedLimitDate(selected));
      })
      .catch((err) => active && setError(err?.message || "Não foi possível carregar seus eventos."))
      .finally(() => active && setInitialLoading(false));
    return () => { active = false; };
  }, [requestedEventId]);

  const selectedEvent = useMemo(() => events.find((item) => String(item.id) === String(eventId)) || null, [events, eventId]);
  const minimumLimit = useMemo(() => toLocalInput(minimumWithdrawalDate()), [eventId]);
  const maximumLimit = useMemo(() => {
    if (!selectedEvent?.start_date) return "";
    const date = new Date(selectedEvent.start_date);
    return Number.isNaN(date.getTime()) ? "" : toLocalInput(date);
  }, [selectedEvent]);
  const limitDateInvalid = useMemo(() => {
    if (!limitDate) return false;
    const limit = new Date(limitDate);
    const minimum = new Date(minimumLimit);
    const maximum = maximumLimit ? new Date(maximumLimit) : null;
    if (Number.isNaN(limit.getTime())) return true;
    if (limit < minimum) return true;
    return Boolean(maximum && limit > maximum);
  }, [limitDate, minimumLimit, maximumLimit]);
  const normalizedPrice = kind === "free" ? 0 : Number(price);
  const priceInvalid = kind === "paid" && (!Number.isFinite(normalizedPrice) || normalizedPrice < 0.01 || normalizedPrice > 999999.99);
  const canSubmit = useMemo(
    () => Boolean(eventId && name.trim() && Number(quantity) > 0 && Number(quantity) <= 100000 && !priceInvalid && !loading && !limitDateInvalid),
    [eventId, name, quantity, priceInvalid, loading, limitDateInvalid]
  );

  const changeEvent = (event) => {
    const value = event.target.value;
    setEventId(value);
    const selected = events.find((item) => String(item.id) === String(value));
    setLimitDate(selected ? suggestedLimitDate(selected) : "");
    setFieldErrors((current) => ({ ...current, event_id: undefined, limit_date: undefined }));
  };

  const changeKind = (value) => {
    setKind(value);
    if (value === "free") {
      setName("Cortesia");
      setPrice("0.00");
      setDescription("Entrada gratuita mediante apresentação do QR Code individual.");
    } else {
      setName("1º Lote");
      setPrice("0.01");
      setDescription("Ingresso para acesso ao evento mediante QR Code individual.");
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setSubmitted(true);
    setError("");
    setFieldErrors({});
    if (!canSubmit) {
      if (limitDateInvalid) setError("O prazo de venda/retirada precisa ficar entre 1 hora após o horário atual e o início do evento.");
      else if (priceInvalid) setError("Informe um preço válido. Para ingresso pago, o mínimo aceito pela Cutinapp é R$ 0,01.");
      else setError("Revise os campos destacados antes de criar o ingresso.");
      return;
    }

    setLoading(true);
    try {
      const response = await ticketService.store({
        event_id: Number(eventId),
        name: name.trim(),
        quantity: Number(quantity),
        price: normalizedPrice,
        ticket_type: kind === "free" ? "courtesy" : "standard",
        limit_date: limitDate || null,
        description: description.trim() || null,
      });
      const ticketId = Number(response?.ticket?.id || 0);
      if (!ticketId) throw new Error("A API informou sucesso, mas não retornou o ingresso criado.");
      if (Number(response?.ticket?.event_id) !== Number(eventId)) throw new Error("A API vinculou o ingresso a um evento diferente do selecionado.");
      if (Math.abs(Number(response?.ticket?.price) - normalizedPrice) > 0.0001) throw new Error("A API retornou um preço diferente do informado.");
      navigate(`/event/${eventId}/courtesies?created=${ticketId}`, { replace: true });
    } catch (err) {
      setFieldErrors(err?.errors || {});
      setError(err?.message || "Não foi possível criar o ingresso.");
    } finally {
      setLoading(false);
    }
  };

  const invalid = (field, local = false) => Boolean(local || firstError(fieldErrors, field));

  return (
    <div className="cut-app-page">
      <NavlogComponent />
      {(loading || initialLoading) && <ProcessingIndicatorComponent label={loading ? "Criando ingresso" : "Carregando eventos"} />}
      <Container className="cut-page-container py-4 py-lg-5">
        <div className="cut-page-heading"><div><span className="cut-eyebrow">Ingressos</span><h1>Criar ingresso</h1><p>Crie cortesias ou lotes pagos. Para homologação, você pode informar R$ 0,01.</p></div></div>
        {error && <Alert variant="danger">{error}</Alert>}

        {!initialLoading && events.length === 0 ? (
          <Card className="cut-empty-state"><Card.Body><h2>Você ainda não tem eventos</h2><p>Crie um evento antes de configurar os ingressos.</p><Button onClick={() => navigate("/event/create")}>Criar evento</Button></Card.Body></Card>
        ) : (
          <Row className="justify-content-center"><Col lg={8} xl={7}><Card className="cut-panel"><Card.Body className="p-4 p-lg-5">
            <div className="cut-feature-badge mb-4"><i className="fa-solid fa-ticket" /> Ingresso com QR Code individual</div>
            <Form onSubmit={submit} noValidate>
              <Row className="g-3">
                <Col xs={12}><Form.Group><Form.Label>Evento *</Form.Label><Form.Select value={eventId} onChange={changeEvent} isInvalid={invalid("event_id", submitted && !eventId)}><option value="">Selecione o evento</option>{events.filter((item) => !item.is_cancelled).map((item) => <option key={item.id} value={item.id}>{item.title} {item.is_published ? "· publicado" : "· rascunho"}</option>)}</Form.Select><Form.Control.Feedback type="invalid">{firstError(fieldErrors, "event_id") || "Selecione um evento válido."}</Form.Control.Feedback></Form.Group></Col>
                {selectedEvent && <Col xs={12}><div className="cut-info-box"><strong>Início do evento</strong><span>{formatDateTime(selectedEvent.start_date)} · Horário de Brasília</span></div></Col>}
                <Col xs={12}><Form.Group><Form.Label>Tipo *</Form.Label><div className="d-flex gap-2 flex-wrap"><Button type="button" variant={kind === "paid" ? "primary" : "outline-light"} onClick={() => changeKind("paid")}>Ingresso pago</Button><Button type="button" variant={kind === "free" ? "primary" : "outline-light"} onClick={() => changeKind("free")}>Cortesia</Button></div></Form.Group></Col>
                <Col md={kind === "paid" ? 5 : 7}><Form.Group><Form.Label>Nome do lote *</Form.Label><Form.Control value={name} onChange={(event) => setName(event.target.value)} isInvalid={invalid("name", submitted && !name.trim())} /><Form.Control.Feedback type="invalid">{firstError(fieldErrors, "name") || "Informe o nome do ingresso."}</Form.Control.Feedback></Form.Group></Col>
                {kind === "paid" && <Col md={2}><Form.Group><Form.Label>Preço *</Form.Label><Form.Control type="number" min="0.01" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} isInvalid={invalid("price", submitted && priceInvalid)} /><Form.Control.Feedback type="invalid">{firstError(fieldErrors, "price") || "Mínimo R$ 0,01."}</Form.Control.Feedback></Form.Group></Col>}
                <Col md={5}><Form.Group><Form.Label>Quantidade *</Form.Label><Form.Control type="number" min={1} max={100000} value={quantity} onChange={(event) => setQuantity(event.target.value)} isInvalid={invalid("quantity", submitted && (Number(quantity) < 1 || Number(quantity) > 100000))} /><Form.Control.Feedback type="invalid">{firstError(fieldErrors, "quantity") || "Informe de 1 a 100.000 ingressos."}</Form.Control.Feedback></Form.Group></Col>
                <Col xs={12}><Form.Group><Form.Label>Disponível até</Form.Label><Form.Control type="datetime-local" min={minimumLimit} max={maximumLimit || undefined} value={limitDate} onChange={(event) => setLimitDate(event.target.value)} isInvalid={invalid("limit_date", submitted && limitDateInvalid)} /><Form.Text>O prazo não pode ultrapassar o início do evento.</Form.Text><Form.Control.Feedback type="invalid">{firstError(fieldErrors, "limit_date") || "Informe um prazo válido."}</Form.Control.Feedback></Form.Group></Col>
                <Col xs={12}><Form.Group><Form.Label>Descrição</Form.Label><Form.Control as="textarea" rows={4} value={description} onChange={(event) => setDescription(event.target.value)} /></Form.Group></Col>
              </Row>
              <div className="cut-info-box mt-4"><strong>{kind === "paid" ? `Preço: R$ ${normalizedPrice.toFixed(2).replace(".", ",")}` : "Preço: R$ 0,00"}</strong><span>{kind === "paid" ? "O pagamento será processado pela conta Mercado Pago conectada à produção." : "Cada participante recebe um ingresso gratuito com token e QR Code únicos."}</span></div>
              <div className="cut-form-actions mt-4"><Button type="button" variant="outline-light" disabled={loading} onClick={() => navigate(eventId ? `/event/edit/${eventId}` : "/event/manage")}>Cancelar</Button><Button type="submit" disabled={loading}>{loading ? "Criando..." : "Salvar ingresso"}</Button></div>
            </Form>
          </Card.Body></Card></Col></Row>
        )}
      </Container>
    </div>
  );
}
