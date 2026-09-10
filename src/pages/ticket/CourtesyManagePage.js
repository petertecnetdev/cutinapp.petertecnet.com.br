import React, { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import cutinappService from "../../services/CutinappService";
import { copyText } from "../../utils/clipboard";
import { buildEventSaleShareText, buildEventSaleUrl, buildWhatsAppShareUrl } from "../../utils/eventSaleShare";

const toLocalInput = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const trackProducerActivation = (type, event, metadata = {}) => {
  try {
    window.PeterTecnetTelemetry?.track?.(type, {
      label: event?.title || "Evento",
      target: String(event?.id || ""),
      metadata: {
        event_id: Number(event?.id || 0),
        ...metadata,
      },
    });
  } catch (_) {
    // Telemetry must never interrupt producer activation.
  }
};

export default function CourtesyManagePage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const activation = new URLSearchParams(location.search).get("activation") || "";
  const [event, setEvent] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [editing, setEditing] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const applyResponse = (response) => {
    setEvent(response.event || null);
    setTickets(response.tickets || []);
    const next = {};
    (response.tickets || []).forEach((ticket) => {
      next[ticket.id] = {
        name: ticket.name || "Cortesia",
        quantity: ticket.quantity || 1,
        limit_date: toLocalInput(ticket.limit_date),
        description: ticket.description || "",
      };
    });
    setEditing(next);
  };

  const load = async () => {
    const response = await cutinappService.eventCourtesies(eventId);
    applyResponse(response);
    return response;
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    cutinappService.eventCourtesies(eventId)
      .then((response) => active && applyResponse(response))
      .catch((err) => active && setError(err?.message || "Não foi possível carregar os ingressos."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [eventId]);

  const totalIssued = useMemo(() => tickets.reduce((sum, ticket) => sum + Number(ticket.passes_count || 0), 0), [tickets]);
  const eventSaleUrl = useMemo(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return buildEventSaleUrl(event, origin);
  }, [event]);
  const whatsappShareUrl = useMemo(() => buildWhatsAppShareUrl(eventSaleUrl, event), [eventSaleUrl, event]);

  const change = (ticketId, field, value) => {
    setEditing((current) => ({ ...current, [ticketId]: { ...current[ticketId], [field]: value } }));
  };

  const save = async (ticketId) => {
    setBusyId(ticketId);
    setError("");
    setSuccess("");
    try {
      const values = editing[ticketId];
      await cutinappService.updateCourtesy(ticketId, {
        name: values.name.trim(),
        quantity: Number(values.quantity),
        limit_date: values.limit_date || null,
        description: values.description.trim() || null,
      });
      await load();
      setSuccess("Ingresso atualizado com sucesso.");
    } catch (err) {
      setError(err?.message || "Não foi possível atualizar o ingresso.");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (ticket) => {
    if (!window.confirm(`Remover o ingresso “${ticket.name}”?`)) return;
    setBusyId(ticket.id);
    setError("");
    setSuccess("");
    try {
      await cutinappService.deleteCourtesy(ticket.id);
      await load();
      setSuccess("Ingresso removido.");
    } catch (err) {
      setError(err?.message || "Não foi possível remover o ingresso.");
    } finally {
      setBusyId(null);
    }
  };

  const publish = async () => {
    if (!event || publishing || event.is_published || event.is_cancelled || tickets.length === 0) return;
    setPublishing(true);
    setError("");
    setSuccess("");
    try {
      const response = await cutinappService.publishEvent(event.id);
      const refreshed = await load();
      const publishedEvent = refreshed?.event || event;
      setSuccess(response?.message || "Evento publicado. As vendas já podem começar pela página pública.");
      trackProducerActivation("producer_event_published", publishedEvent, {
        activation_stage: "event_published",
        next_step: "first_sale",
        ticket_lots: tickets.length,
      });
    } catch (err) {
      setError(err?.message || "Não foi possível publicar o evento. Revise os dados e tente novamente.");
    } finally {
      setPublishing(false);
    }
  };

  const copySaleLink = async () => {
    if (!eventSaleUrl) return;
    setError("");
    const copiedOk = await copyText(eventSaleUrl);
    setCopied(copiedOk);
    if (!copiedOk) {
      setError("Não foi possível copiar o link neste navegador. Abra a página pública e copie o endereço manualmente.");
      return;
    }
    setSuccess("Link de venda copiado. Envie para seu público para buscar a primeira venda.");
    trackProducerActivation("producer_sale_link_copied", event, {
      activation_stage: "event_distribution",
      next_step: "first_sale",
    });
    window.setTimeout(() => setCopied(false), 2500);
  };

  const shareSaleLink = async () => {
    if (!eventSaleUrl || sharing) return;
    setSharing(true);
    setError("");
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({
          title: event?.title || "Evento na Cutinapp",
          text: buildEventSaleShareText(event),
          url: eventSaleUrl,
        });
        trackProducerActivation("producer_sale_link_shared", event, {
          activation_stage: "event_distribution",
          next_step: "first_sale",
          channel: "native_share",
        });
        return;
      }

      const copiedOk = await copyText(eventSaleUrl);
      if (!copiedOk) throw new Error("share_unavailable");
      setSuccess("Link de venda copiado. Cole no WhatsApp, Instagram ou onde seu público estiver.");
      trackProducerActivation("producer_sale_link_shared", event, {
        activation_stage: "event_distribution",
        next_step: "first_sale",
        channel: "clipboard_fallback",
      });
    } catch (err) {
      if (err?.name !== "AbortError") {
        setError("Não foi possível abrir o compartilhamento. Você ainda pode copiar o link de venda.");
      }
    } finally {
      setSharing(false);
    }
  };

  const openWhatsApp = () => {
    if (!whatsappShareUrl) return;
    trackProducerActivation("producer_sale_link_shared", event, {
      activation_stage: "event_distribution",
      next_step: "first_sale",
      channel: "whatsapp",
    });
    window.open(whatsappShareUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="cut-app-page">
      <NavlogComponent />
      {(loading || busyId || publishing) && <ProcessingIndicatorComponent label={loading ? "Carregando ingressos" : publishing ? "Publicando evento" : "Atualizando ingresso"} />}
      <Container className="cut-page-container py-4 py-lg-5">
        <div className="cut-page-heading">
          <div><span className="cut-eyebrow">Ingressos</span><h1>{event?.title || "Ingressos do evento"}</h1><p>{tickets.length} lote(s) · {totalIssued} ingresso(s) emitido(s).</p></div>
          <div className="cut-card-actions"><Button variant="outline-light" onClick={() => navigate(`/event/edit/${eventId}`)}>Voltar ao evento</Button><Button onClick={() => navigate(`/ticket/create?eventId=${eventId}`)}>Novo ingresso</Button></div>
        </div>

        {error && <Alert variant="danger">{error}</Alert>}
        {success && <Alert variant="success">{success}</Alert>}

        {!loading && activation === "first-ticket" && event && tickets.length > 0 && !event.is_cancelled && (
          <Card className="cut-panel mb-4"><Card.Body className="p-4">
            <span className="cut-eyebrow">Ativação do produtor</span>
            <h2 className="cut-section-title mt-2">{event.is_published ? "Evento publicado. Agora busque a primeira venda." : "Primeiro lote criado. Agora coloque o evento à venda."}</h2>
            <p className="text-secondary mb-3">{event.is_published ? "A página pública já está pronta. Compartilhe o link de venda agora, enquanto o evento está fresco para você e sua equipe." : "Seu evento já tem ingresso configurado. Publique agora para liberar a página pública e reduzir o tempo até a primeira venda."}</p>
            <div className="d-flex flex-wrap gap-2">
              {!event.is_published && <Button onClick={publish} disabled={publishing}>{publishing ? "Publicando..." : "Publicar evento e começar a vender"}</Button>}
              {event.is_published && eventSaleUrl && <Button onClick={shareSaleLink} disabled={sharing}>{sharing ? "Abrindo..." : "Compartilhar link de venda"}</Button>}
              {event.is_published && whatsappShareUrl && <Button variant="success" onClick={openWhatsApp}>Enviar no WhatsApp</Button>}
              {event.is_published && eventSaleUrl && <Button variant="outline-light" onClick={copySaleLink}>{copied ? "Link copiado" : "Copiar link"}</Button>}
              {event.is_published && event.slug && <Button variant="outline-light" onClick={() => navigate(`/event/${event.slug}`)}>Ver página pública</Button>}
              <Button variant="outline-light" onClick={() => navigate(`/event/edit/${event.id}`)}>Revisar evento</Button>
            </div>
            {event.is_published && eventSaleUrl && <div className="cut-info-box mt-3"><strong>Link de venda pronto</strong><span className="text-break">{eventSaleUrl}</span></div>}
          </Card.Body></Card>
        )}

        {!loading && tickets.length === 0 ? (
          <Card className="cut-empty-state"><Card.Body><h2>Nenhum ingresso configurado</h2><p>Crie o primeiro lote antes de publicar o evento.</p><Button onClick={() => navigate(`/ticket/create?eventId=${eventId}`)}>Criar ingresso</Button></Card.Body></Card>
        ) : (
          <Row className="g-4">
            {tickets.map((ticket) => {
              const issued = Number(ticket.passes_count || 0);
              const remaining = Math.max(0, Number(ticket.quantity || 0) - issued);
              const values = editing[ticket.id] || {};
              return <Col xl={6} key={ticket.id}><Card className="cut-panel h-100"><Card.Body className="p-4">
                <div className="d-flex justify-content-between align-items-start gap-3 mb-4"><div><span className="cut-eyebrow">Lote de ingresso</span><h2 className="cut-section-title mt-2">{ticket.name}</h2></div><Badge bg={remaining > 0 ? "success" : "secondary"}>{remaining > 0 ? `${remaining} restantes` : "Esgotado"}</Badge></div>
                <Row className="g-3">
                  <Col xs={12}><Form.Group><Form.Label>Nome</Form.Label><Form.Control value={values.name || ""} onChange={(e) => change(ticket.id, "name", e.target.value)} /></Form.Group></Col>
                  <Col md={6}><Form.Group><Form.Label>Quantidade total</Form.Label><Form.Control type="number" min={Math.max(1, issued)} max={100000} value={values.quantity ?? ""} onChange={(e) => change(ticket.id, "quantity", e.target.value)} /></Form.Group></Col>
                  <Col md={6}><Form.Group><Form.Label>Ingressos emitidos</Form.Label><Form.Control value={issued} readOnly /></Form.Group></Col>
                  <Col xs={12}><Form.Group><Form.Label>Disponível até</Form.Label><Form.Control type="datetime-local" value={values.limit_date || ""} onChange={(e) => change(ticket.id, "limit_date", e.target.value)} /></Form.Group></Col>
                  <Col xs={12}><Form.Group><Form.Label>Orientações</Form.Label><Form.Control as="textarea" rows={3} value={values.description || ""} onChange={(e) => change(ticket.id, "description", e.target.value)} /></Form.Group></Col>
                </Row>
                <div className="cut-card-actions mt-4">
                  <Button onClick={() => save(ticket.id)} disabled={busyId === ticket.id}>Salvar</Button>
                  <Button variant="outline-light" onClick={() => navigate(`/ticket/bulk-edit/${ticket.id}`)}>Editar semelhantes</Button>
                  <Button variant="outline-danger" onClick={() => remove(ticket)} disabled={issued > 0 || busyId === ticket.id}>Excluir</Button>
                </div>
                {issued > 0 && <div className="cut-info-box mt-3"><strong>Exclusão protegida</strong><span>Este lote já emitiu ingressos. Você pode aumentar a quantidade, mas não apagar o histórico nem reduzir abaixo de {issued}.</span></div>}
              </Card.Body></Card></Col>;
            })}
          </Row>
        )}
      </Container>
    </div>
  );
}
