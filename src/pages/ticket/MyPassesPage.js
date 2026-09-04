import React, { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import QrCodeComponent from "../../components/QrCodeComponent";
import cutinappService from "../../services/CutinappService";

const formatDate = (value) => value
  ? new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value))
  : "Data não informada";

const money = (value) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
const apiMessage = (err, fallback) => err?.response?.data?.message || err?.message || fallback;
const orderFor = (pass) => pass?.order_item?.order || pass?.orderItem?.order || null;
const latestRefund = (order) => Array.isArray(order?.refunds) && order.refunds.length ? order.refunds[order.refunds.length - 1] : null;

const refundPresentation = (refund) => {
  if (!refund) return null;
  if (refund.status === "completed") return { variant: "success", label: "Reembolso concluído" };
  if (refund.status === "failed") return { variant: "warning", label: "Reembolso requer nova tentativa" };
  if (refund.status === "processing") return { variant: "info", label: "Reembolso em processamento" };
  return { variant: "info", label: "Reembolso solicitado" };
};

export default function MyPassesPage() {
  const navigate = useNavigate();
  const [passes, setPasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyOrderId, setBusyOrderId] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("active");

  const load = async () => setPasses(await cutinappService.myPasses());

  useEffect(() => {
    let active = true;
    cutinappService.myPasses()
      .then((items) => active && setPasses(items))
      .catch((err) => active && setError(apiMessage(err, "Não foi possível carregar seus ingressos.")))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const requestRefund = async (pass) => {
    const order = orderFor(pass);
    if (!order?.public_id) return;
    setBusyOrderId(order.id);
    setError("");
    setSuccess("");
    try {
      const response = await cutinappService.requestRefund(order.public_id, {
        reason: `Solicitação do participante referente ao evento ${pass.event?.title || pass.event_id}.`,
      });
      await load();
      setSuccess(response?.message || "Solicitação de reembolso registrada.");
    } catch (err) {
      setError(apiMessage(err, "Não foi possível solicitar o reembolso."));
    } finally {
      setBusyOrderId(null);
    }
  };

  const filtered = useMemo(() => passes.filter((pass) => {
    const term = search.trim().toLowerCase();
    const matchesText = !term || [pass.event?.title, pass.ticket?.name, pass.event?.city, pass.event?.venue, pass.holder_name, pass.token].filter(Boolean).some((v) => String(v).toLowerCase().includes(term));
    const isUsed = Boolean(pass.checked_in_at);
    const lifecycle = pass.event?.is_cancelled ? "cancelled" : (pass.event?.lifecycle_status || "scheduled");
    const changed = ["cancelled", "postponed", "rescheduled"].includes(lifecycle) || ["cancelled", "refunded", "charged_back"].includes(pass.status);
    const invalid = ["cancelled", "refunded", "charged_back"].includes(pass.status) || lifecycle === "cancelled";
    const matchesStatus = status === "all"
      || (status === "active" && !isUsed && !invalid && lifecycle !== "postponed")
      || (status === "used" && isUsed)
      || (status === "attention" && changed);
    return matchesText && matchesStatus;
  }), [passes, search, status]);

  return (
    <div className="cut-app-page">
      <NavlogComponent />
      {(loading || busyOrderId) && <ProcessingIndicatorComponent label={loading ? "Carregando sua carteira" : "Processando reembolso"} />}
      <Container className="cut-page-container py-4 py-lg-5">
        <div className="cut-page-heading">
          <div>
            <span className="cut-eyebrow">Carteira digital</span>
            <h1>Meus ingressos</h1>
            <p>Se um evento mudar de data ou for cancelado, o ingresso continua aqui com o histórico e a situação do reembolso.</p>
          </div>
          <Button variant="outline-light" onClick={() => navigate("/event")}>Encontrar eventos</Button>
        </div>
        {error && <Alert variant="danger">{error}</Alert>}
        {success && <Alert variant="success">{success}</Alert>}

        <Card className="cut-wallet-toolbar mb-4">
          <Card.Body>
            <div className="cut-search-bar"><i className="fa-solid fa-magnifying-glass"/><Form.Control value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Evento, lote, local ou código" /></div>
            <div className="cut-filter-shortcuts">
              {[["active","Válidos"],["attention","Alterados / reembolsos"],["used","Utilizados"],["all","Todos"]].map(([key,label]) => (
                <button type="button" key={key} className={status===key?"active":""} onClick={() => setStatus(key)}>{label}</button>
              ))}
            </div>
          </Card.Body>
        </Card>

        {!loading && filtered.length === 0 ? (
          <Card className="cut-empty-state"><Card.Body><i className="fa-solid fa-ticket cut-empty-icon"/><h2>{passes.length ? "Nenhum ingresso corresponde aos filtros" : "Sua carteira ainda está vazia"}</h2><p>{passes.length ? "Tente outro termo ou situação." : "Encontre um evento e obtenha seu primeiro ingresso."}</p><Button onClick={() => navigate("/event")}>Explorar eventos</Button></Card.Body></Card>
        ) : (
          <Row className="g-4">
            {filtered.map((pass) => {
              const event = pass.event || {};
              const order = orderFor(pass);
              const refund = latestRefund(order);
              const refundState = refundPresentation(refund);
              const lifecycle = event.is_cancelled ? "cancelled" : (event.lifecycle_status || "scheduled");
              const used = Boolean(pass.checked_in_at);
              const refunded = pass.status === "refunded" || order?.status === "refunded" || refund?.status === "completed";
              const chargedBack = pass.status === "charged_back";
              const cancelled = lifecycle === "cancelled" || pass.status === "cancelled";
              const postponed = lifecycle === "postponed";
              const rescheduled = lifecycle === "rescheduled";

              let state = { label: "Válido", bg: "success" };
              if (refunded) state = { label: "Reembolsado", bg: "secondary" };
              else if (chargedBack) state = { label: "Pagamento contestado", bg: "danger" };
              else if (cancelled) state = { label: "Evento cancelado", bg: "danger" };
              else if (postponed) state = { label: "Evento adiado", bg: "warning" };
              else if (used) state = { label: "Utilizado", bg: "secondary" };
              else if (rescheduled) state = { label: "Reagendado", bg: "info" };

              const deadlineOpen = !event.refund_deadline_at || new Date(event.refund_deadline_at) >= new Date();
              const canRequestRefund = Boolean(
                order?.public_id
                && ["paid", "refund_pending"].includes(order.status)
                && !used
                && !refunded
                && (cancelled || ((postponed || rescheduled) && deadlineOpen))
              );
              const qrUsable = !refunded && !chargedBack && !cancelled && !postponed;

              return (
                <Col xl={6} key={pass.id}>
                  <Card className={`cut-ticket-wallet-card ${used ? "is-used" : ""} ${(cancelled || refunded) ? "is-cancelled" : ""}`}>
                    <div className="cut-ticket-wallet-card__accent"/>
                    <Card.Body className="p-0">
                      <div className="cut-ticket-wallet-card__main">
                        <div className="cut-ticket-wallet-card__info">
                          <div className="d-flex flex-wrap gap-2 mb-3">
                            <Badge bg={state.bg}>{state.label}</Badge>
                            <Badge bg="dark">{pass.ticket?.type || pass.ticket?.ticket_type || "Ingresso"}</Badge>
                          </div>
                          <span className="cut-eyebrow">{pass.ticket?.name || "Ingresso Cutinapp"}</span>
                          <h2>{event.title || "Evento"}</h2>
                          <div className="cut-ticket-wallet-card__meta">
                            <span><i className="fa-regular fa-calendar"/>{postponed ? "Nova data ainda não definida" : formatDate(event.start_date)}</span>
                            <span><i className="fa-solid fa-location-dot"/>{event.venue || event.city || "Local do evento"}</span>
                            <span><i className="fa-regular fa-user"/>{pass.holder_name || pass.holder_email}</span>
                            {used && <span><i className="fa-solid fa-circle-check"/>Entrada validada em {formatDate(pass.checked_in_at)}</span>}
                          </div>
                        </div>
                        <div className="cut-ticket-wallet-card__qr">
                          {qrUsable ? <QrCodeComponent value={pass.token} size={150}/> : <i className="fa-solid fa-shield-halved fs-1" aria-hidden="true" />}
                          <small>{qrUsable ? (rescheduled ? "QR válido para a nova data" : "Apresente na entrada") : postponed ? "QR preservado até a nova data" : "QR sem validade para entrada"}</small>
                        </div>
                      </div>

                      {postponed && (
                        <Alert variant="warning" className="mx-3 mb-3">
                          O evento foi adiado. Seu ingresso continua registrado, mas a entrada fica suspensa até a definição da nova data.
                          {event.refund_deadline_at && <> Você pode pedir reembolso até <strong>{formatDate(event.refund_deadline_at)}</strong>.</>}
                        </Alert>
                      )}
                      {rescheduled && (
                        <Alert variant="info" className="mx-3 mb-3">
                          O evento foi reagendado. Seu ingresso e QR continuam válidos automaticamente.
                          {event.previous_start_date && <> Data anterior: <strong>{formatDate(event.previous_start_date)}</strong>.</>}
                          {event.refund_deadline_at && <> Se a nova data não funcionar para você, o reembolso pode ser solicitado até <strong>{formatDate(event.refund_deadline_at)}</strong>.</>}
                        </Alert>
                      )}
                      {cancelled && !refunded && (
                        <Alert variant="danger" className="mx-3 mb-3">
                          O evento foi cancelado. O ingresso não pode mais ser usado e qualquer pagamento elegível permanece protegido pelo fluxo de reembolso.
                        </Alert>
                      )}
                      {refundState && (
                        <Alert variant={refundState.variant} className="mx-3 mb-3">
                          <strong>{refundState.label}</strong>
                          {refund?.amount != null && <> · {money(refund.amount)}</>}
                          {refund?.status === "failed" && <>. Você pode tentar novamente sem criar um reembolso duplicado.</>}
                        </Alert>
                      )}

                      <div className="cut-ticket-wallet-card__footer">
                        <span>ID #{pass.id}</span>
                        <div className="cut-card-actions">
                          <Button size="sm" onClick={() => navigate(`/passes/${pass.id}`)}>Abrir ingresso</Button>
                          {event.slug && <Button size="sm" variant="outline-light" onClick={() => navigate(`/event/${event.slug}`)}>Evento</Button>}
                          {canRequestRefund && (
                            <Button size="sm" variant="outline-warning" disabled={busyOrderId === order.id} onClick={() => requestRefund(pass)}>
                              {refund?.status === "failed" || order.status === "refund_pending" ? "Tentar reembolso" : "Solicitar reembolso"}
                            </Button>
                          )}
                        </div>
                      </div>
                    </Card.Body>
                  </Card>
                </Col>
              );
            })}
          </Row>
        )}
      </Container>
    </div>
  );
}
