import React, { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import { useNavigate, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import artistService from "../../services/ArtistService";
import { storageUrl } from "../../config";
import "./ArtistInvitationPage.css";

const money = (cents) => cents == null ? "Não informado" : Number(cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dateTime = (value) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeStyle: "short" }).format(new Date(value)) : "A definir";
const imageUrl = (value) => {
  if (!value) return "";
  const image = String(value);
  return /^https?:\/\//i.test(image) ? image : `${storageUrl}${image.replace(/^\/+/, "")}`;
};

const STATUS = {
  pending: ["Aguardando sua resposta", "warning"],
  pending_change: ["Alterações aguardando nova confirmação", "warning"],
  accepted: ["Convite aceito", "success"],
  confirmed: ["Participação confirmada", "success"],
  declined: ["Convite recusado", "secondary"],
  expired: ["Convite expirado", "secondary"],
  cancelled_by_producer: ["Cancelado pela produção", "danger"],
  event_cancelled: ["Evento cancelado", "danger"],
};

export default function ArtistInvitationPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [decision, setDecision] = useState("");
  const [declineReason, setDeclineReason] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await artistService.invitation(token);
      setData(response);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Não foi possível carregar este convite.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [token]);

  const invitation = data?.invitation;
  const event = data?.event;
  const production = data?.production;
  const participation = data?.participation;
  const conflicts = Array.isArray(data?.schedule_conflicts) ? data.schedule_conflicts : [];
  const [statusLabel, statusVariant] = STATUS[invitation?.status] || [invitation?.status || "Convite", "secondary"];
  const canRespond = Boolean(invitation?.can_respond);
  const image = useMemo(() => imageUrl(event?.image), [event?.image]);

  const respond = async (nextDecision) => {
    if (nextDecision === "reject" && !decision) setDecision("reject");
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await artistService.respondInvitation(token, nextDecision, nextDecision === "reject" ? declineReason : "");
      setSuccess(response?.message || (nextDecision === "accept" ? "Participação confirmada." : "Convite recusado."));
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Não foi possível responder ao convite.");
    } finally {
      setBusy(false);
    }
  };

  const addToCalendar = async () => {
    setBusy(true);
    setError("");
    try {
      const blob = await artistService.invitationCalendar(token);
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = `${event?.slug || "evento"}-artista.ics`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
    } catch (err) {
      setError(err?.response?.data?.message || "Não foi possível gerar o arquivo de agenda.");
    } finally {
      setBusy(false);
    }
  };

  const talkToProduction = () => {
    const userId = Number(data?.actions?.message_user_id || production?.user_id || 0);
    navigate(userId ? `/messages?user=${userId}&context=event&event_id=${event?.id || ""}` : "/messages");
  };

  if (loading) return <div className="cut-app-page"><NavlogComponent /><ProcessingIndicatorComponent label="Carregando convite artístico" /></div>;

  return <div className="cut-app-page cut-artist-invitation-page">
    <NavlogComponent />
    {busy && <ProcessingIndicatorComponent label="Atualizando convite" />}
    <Container className="cut-page-container py-4 py-lg-5">
      <div className="cut-artist-invitation-page__heading">
        <div>
          <span className="cut-eyebrow">Convite artístico</span>
          <h1>{event?.title || "Participação em evento"}</h1>
          <p>{production?.name ? `${production.name} convidou você para este evento.` : "Você recebeu um convite para participar deste evento."}</p>
        </div>
        <Badge bg={statusVariant} className="cut-artist-invitation-page__status">{statusLabel}</Badge>
      </div>

      {error && <Alert variant="danger" dismissible onClose={() => setError("")}>{error}</Alert>}
      {success && <Alert variant="success" dismissible onClose={() => setSuccess("")}>{success}</Alert>}

      {invitation?.status === "pending_change" && <Alert variant="warning">
        <strong>Este convite mudou depois da sua última confirmação.</strong> Revise horário, função, palco e cachê antes de aceitar novamente.
      </Alert>}

      {conflicts.length > 0 && <Alert variant="warning">
        <strong>Possível conflito de agenda.</strong> Você já possui {conflicts.length} participação{conflicts.length === 1 ? "" : "ões"} confirmada{conflicts.length === 1 ? "" : "s"} em horário próximo. Isso não impede o aceite, mas vale revisar antes de confirmar.
      </Alert>}

      <Row className="g-4">
        <Col lg={7}>
          <Card className="cut-panel cut-artist-invitation-page__main">
            {image && <img src={image} alt="" className="cut-artist-invitation-page__cover" />}
            <Card.Body className="p-4">
              <div className="cut-artist-invitation-page__facts">
                <div><i className="fa-regular fa-calendar" /><span><small>Data do evento</small><strong>{dateTime(event?.start_date)}</strong></span></div>
                <div><i className="fa-solid fa-music" /><span><small>Participação</small><strong>{participation?.participation_type || "A definir"}</strong></span></div>
                <div><i className="fa-regular fa-clock" /><span><small>Horário artístico</small><strong>{dateTime(participation?.scheduled_at)}</strong></span></div>
                <div><i className="fa-solid fa-location-dot" /><span><small>Palco / espaço</small><strong>{participation?.stage || "A definir"}</strong></span></div>
                <div><i className="fa-solid fa-sack-dollar" /><span><small>Cachê informado</small><strong>{money(participation?.fee_cents)}</strong></span></div>
                <div><i className="fa-solid fa-building" /><span><small>Produção</small><strong>{production?.name || "Produção responsável"}</strong></span></div>
              </div>

              {participation?.description && <div className="cut-artist-invitation-page__description"><span className="cut-eyebrow">Sobre sua participação</span><p>{participation.description}</p></div>}

              <div className="cut-artist-invitation-page__place">
                <span className="cut-eyebrow">Local</span>
                <h2>{event?.venue || event?.formatted_address || "Local a definir"}</h2>
                {event?.formatted_address && <p>{event.formatted_address}</p>}
                <div className="d-flex gap-2 flex-wrap">
                  {event?.google_maps_url && <Button as="a" href={event.google_maps_url} target="_blank" rel="noopener noreferrer" variant="outline-light"><i className="fa-solid fa-map-location-dot me-2" />Abrir mapa</Button>}
                  {event?.slug && <Button variant="outline-light" onClick={() => navigate(`/event/${event.slug}`)}><i className="fa-solid fa-arrow-up-right-from-square me-2" />Ver evento</Button>}
                </div>
              </div>

              {conflicts.length > 0 && <div className="cut-artist-invitation-page__conflicts">
                <span className="cut-eyebrow">Agenda próxima</span>
                {conflicts.map((conflict) => <div key={conflict.id}><strong>{conflict.title}</strong><span>{dateTime(conflict.scheduled_at)}{conflict.stage ? ` · ${conflict.stage}` : ""}</span></div>)}
              </div>}
            </Card.Body>
          </Card>
        </Col>

        <Col lg={5}>
          <Card className="cut-panel cut-artist-invitation-page__decision">
            <Card.Body className="p-4">
              <span className="cut-eyebrow">Sua decisão</span>
              <h2>{canRespond ? "Você participa deste evento?" : statusLabel}</h2>
              <p className="text-secondary">A produção não pode confirmar sua presença em seu nome. Sua resposta fica registrada na conta responsável.</p>

              {canRespond ? <>
                <Button className="w-100 mb-2" size="lg" disabled={busy} onClick={() => respond("accept")}>
                  <i className="fa-solid fa-circle-check me-2" />Aceitar convite
                </Button>
                <Button className="w-100" size="lg" variant="outline-danger" disabled={busy} onClick={() => setDecision(decision === "reject" ? "" : "reject")}>
                  <i className="fa-regular fa-circle-xmark me-2" />Recusar convite
                </Button>
                {decision === "reject" && <div className="cut-artist-invitation-page__decline mt-3">
                  <Form.Group>
                    <Form.Label>Motivo <span className="text-secondary">(opcional)</span></Form.Label>
                    <Form.Select value={declineReason} onChange={(e) => setDeclineReason(e.target.value)}>
                      <option value="">Prefiro não informar</option>
                      <option value="Conflito de agenda">Conflito de agenda</option>
                      <option value="Cachê ou condições não atendem">Cachê ou condições não atendem</option>
                      <option value="Distância ou deslocamento">Distância ou deslocamento</option>
                      <option value="Indisponibilidade pessoal">Indisponibilidade pessoal</option>
                      <option value="Outro motivo">Outro motivo</option>
                    </Form.Select>
                  </Form.Group>
                  <Button className="w-100 mt-2" variant="danger" disabled={busy} onClick={() => respond("reject")}>Confirmar recusa</Button>
                </div>}
              </> : <Alert variant={invitation?.status === "accepted" ? "success" : "secondary"} className="mb-0">
                {invitation?.status === "accepted"
                  ? "Sua participação está confirmada."
                  : invitation?.status === "declined"
                    ? `Você recusou este convite${invitation?.decline_reason ? `: ${invitation.decline_reason}` : "."}`
                    : "Este convite não aceita mais resposta."}
              </Alert>}

              {invitation?.status === "accepted" && <Button className="w-100 mt-3" variant="outline-light" onClick={addToCalendar} disabled={busy}><i className="fa-regular fa-calendar-plus me-2" />Adicionar à agenda</Button>}

              <hr />
              <div className="cut-artist-invitation-page__contact">
                <strong>Precisa alinhar detalhes?</strong>
                <Button variant="outline-light" className="w-100 mt-2" onClick={talkToProduction}><i className="fa-regular fa-comments me-2" />Falar com a produção</Button>
                {(event?.contact_email || event?.contact_phone) && <small>{[event.contact_email, event.contact_phone].filter(Boolean).join(" · ")}</small>}
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  </div>;
}
