import React, { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Modal, Row } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import eventService from "../../services/EventService";
import cutinappService from "../../services/CutinappService";

const formatDate = (value) => value
  ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
  : "Data não informada";

const toDateTimeLocal = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
};

const apiMessage = (err, fallback) => err?.response?.data?.message || err?.message || fallback;
const money = (value) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));

const lifecyclePresentation = (event) => {
  const status = event?.is_cancelled ? "cancelled" : (event?.lifecycle_status || "scheduled");
  if (status === "cancelled") return { label: "Cancelado", bg: "danger" };
  if (status === "postponed") return { label: "Adiado", bg: "warning" };
  if (status === "rescheduled") return { label: "Reagendado", bg: "info" };
  if (event?.is_published) return { label: "Publicado", bg: "success" };
  return { label: "Rascunho", bg: "secondary" };
};

const actionCopy = {
  cancel: {
    title: "Cancelar evento",
    submit: "Confirmar cancelamento",
    variant: "danger",
    description: "O evento deixará de aceitar novas vendas. Pedidos pagos entrarão no fluxo de reembolso e o histórico será preservado.",
  },
  postpone: {
    title: "Adiar evento",
    submit: "Confirmar adiamento",
    variant: "warning",
    description: "As vendas e novas retiradas de cortesias serão pausadas enquanto a nova data não for definida. Os ingressos existentes continuam registrados.",
  },
  reschedule: {
    title: "Reagendar evento",
    submit: "Confirmar nova data",
    variant: "primary",
    description: "Os ingressos e QR Codes existentes continuam válidos. Participantes serão avisados e poderão solicitar reembolso dentro da janela definida pela plataforma.",
  },
  delete: {
    title: "Excluir evento",
    submit: "Excluir definitivamente",
    variant: "danger",
    description: "A exclusão definitiva só é permitida quando não existe nenhum pedido, venda ou ingresso emitido.",
  },
};

export default function EventManagePage() {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [modal, setModal] = useState(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [reason, setReason] = useState("");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");

  const load = async () => setEvents(await eventService.myEvents());

  useEffect(() => {
    let active = true;
    eventService.myEvents()
      .then((items) => active && setEvents(items))
      .catch((err) => active && setError(apiMessage(err, "Não foi possível carregar seus eventos.")))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const modalCopy = useMemo(() => actionCopy[modal?.action] || null, [modal]);

  const publication = async (event) => {
    setBusyId(event.id);
    setError("");
    setSuccess("");
    try {
      const response = event.is_published
        ? await cutinappService.unpublishEvent(event.id)
        : await cutinappService.publishEvent(event.id);
      await load();
      setSuccess(response.message || "Situação do evento atualizada.");
    } catch (err) {
      setError(apiMessage(err, "Não foi possível alterar a publicação do evento."));
    } finally {
      setBusyId(null);
    }
  };

  const openLifecycle = async (event, action) => {
    setError("");
    setSuccess("");
    setReason("");
    setNewStart(toDateTimeLocal(event.start_date));
    setNewEnd(toDateTimeLocal(event.end_date));
    setModal({ event, action, impact: null, history: [] });
    setImpactLoading(true);
    try {
      const data = await cutinappService.eventLifecycle(event.id);
      setModal((current) => current ? { ...current, event: data.event || event, impact: data.impact || null, history: data.history || [] } : current);
    } catch (err) {
      setError(apiMessage(err, "Não foi possível consultar o impacto desta ação."));
      setModal(null);
    } finally {
      setImpactLoading(false);
    }
  };

  const closeModal = () => {
    if (busyId) return;
    setModal(null);
    setReason("");
    setNewStart("");
    setNewEnd("");
  };

  const submitLifecycle = async () => {
    if (!modal?.event || !modalCopy) return;
    const eventId = modal.event.id;
    setBusyId(eventId);
    setError("");
    setSuccess("");

    try {
      let response;
      if (modal.action === "cancel") {
        response = await cutinappService.cancelEvent(eventId, { reason: reason.trim() });
      } else if (modal.action === "postpone") {
        response = await cutinappService.postponeEvent(eventId, { reason: reason.trim() });
      } else if (modal.action === "reschedule") {
        response = await cutinappService.rescheduleEvent(eventId, {
          reason: reason.trim(),
          start_date: newStart,
          end_date: newEnd,
        });
      } else if (modal.action === "delete") {
        response = await cutinappService.deleteEvent(eventId);
      }

      await load();
      setSuccess(response?.message || "Evento atualizado com sucesso.");
      setModal(null);
      setReason("");
      setNewStart("");
      setNewEnd("");
    } catch (err) {
      setError(apiMessage(err, "Não foi possível concluir esta ação."));
    } finally {
      setBusyId(null);
    }
  };

  const share = async (event) => {
    if (!event.is_published || !event.slug) return;
    const url = `${window.location.origin}/event/${event.slug}`;
    try {
      if (navigator.share) await navigator.share({ title: event.title, url });
      else {
        await navigator.clipboard.writeText(url);
        setSuccess("Link público copiado.");
      }
    } catch (err) {
      if (err?.name !== "AbortError") setError("Não foi possível compartilhar o link deste navegador.");
    }
  };

  const canSubmitModal = (() => {
    if (!modal || impactLoading || busyId) return false;
    if (modal.action === "delete") return modal.impact?.can_delete === true;
    if (reason.trim().length < 5) return false;
    if (modal.action === "reschedule") return Boolean(newStart && newEnd && new Date(newEnd) > new Date(newStart));
    return true;
  })();

  return (
    <div className="cut-app-page">
      <NavlogComponent />
      {(loading || busyId) && <ProcessingIndicatorComponent label={loading ? "Carregando eventos" : "Atualizando evento"} />}
      <Container className="cut-page-container py-4 py-lg-5">
        <div className="cut-page-heading">
          <div>
            <span className="cut-eyebrow">Área do produtor</span>
            <h1>Meus eventos</h1>
            <p>Gerencie publicação, programação, vendas, participantes, reembolsos e portaria preservando o histórico de cada evento.</p>
          </div>
          <Button onClick={() => navigate("/event/create")}><i className="fa-solid fa-plus me-2" />Novo evento</Button>
        </div>
        {error && <Alert variant="danger">{error}</Alert>}
        {success && <Alert variant="success">{success}</Alert>}

        {!loading && events.length === 0 ? (
          <Card className="cut-empty-state"><Card.Body><h2>Nenhum evento criado</h2><p>Crie um evento. Se ainda não houver produção, a Cutinapp direcionará você para cadastrá-la primeiro.</p><Button onClick={() => navigate("/event/create")}>Criar evento</Button></Card.Body></Card>
        ) : (
          <Row className="g-4">
            {events.map((event) => {
              const state = lifecyclePresentation(event);
              const postponed = (event.lifecycle_status || "") === "postponed";
              const cancelled = event.is_cancelled || event.lifecycle_status === "cancelled";
              const activeForEntry = event.is_published && !cancelled && !postponed;

              return (
                <Col lg={6} key={event.id}>
                  <Card className="cut-panel h-100"><Card.Body className="p-4">
                    <div className="d-flex justify-content-between gap-3 align-items-start">
                      <div><span className="cut-eyebrow">{event.production?.name || "Produção"}</span><h2 className="cut-section-title mt-2 mb-1">{event.title}</h2></div>
                      <Badge bg={state.bg}>{state.label}</Badge>
                    </div>
                    <p className="mb-1">{postponed ? "Nova data ainda não definida" : formatDate(event.start_date)}</p>
                    <p className="text-secondary">{event.venue || event.address}</p>

                    {postponed && (
                      <Alert variant="warning" className="mt-3 mb-0">
                        Vendas e novas cortesias estão pausadas até o reagendamento. Os ingressos já emitidos continuam preservados.
                      </Alert>
                    )}
                    {event.lifecycle_status === "rescheduled" && (
                      <Alert variant="info" className="mt-3 mb-0">
                        Evento reagendado. Os ingressos existentes permanecem válidos para a nova data.
                      </Alert>
                    )}
                    {cancelled && (
                      <Alert variant="danger" className="mt-3 mb-0">
                        Evento cancelado. O histórico permanece disponível para acompanhamento de participantes e reembolsos.
                      </Alert>
                    )}

                    <div className="cut-info-box mt-3">
                      <strong>{event.tickets_count || 0} lote(s) · {event.orders_count || 0} pedido(s)</strong>
                      <span>{activeForEntry ? "Evento ativo para operação." : cancelled ? "Operação encerrada por cancelamento." : postponed ? "Operação pausada até nova data." : "Finalize a configuração antes da publicação."}</span>
                    </div>

                    <div className="cut-card-actions mt-4">
                      {!cancelled && <Button onClick={() => navigate(`/event/edit/${event.id}`)}>Editar</Button>}
                      <Button variant="outline-light" onClick={() => navigate(`/event/${event.id}/courtesies`)}>Ingressos</Button>
                      <Button variant="outline-light" onClick={() => navigate(`/event/${event.id}/participants`)}>Participantes</Button>

                      {!cancelled && !postponed && (
                        <Button variant={event.is_published ? "outline-warning" : "outline-success"} onClick={() => publication(event)} disabled={busyId === event.id}>
                          {event.is_published ? "Despublicar" : "Publicar"}
                        </Button>
                      )}

                      {!cancelled && !postponed && <Button variant="outline-warning" onClick={() => openLifecycle(event, "postpone")}>Adiar</Button>}
                      {!cancelled && <Button variant="outline-info" onClick={() => openLifecycle(event, "reschedule")}>Reagendar</Button>}
                      {!cancelled && <Button variant="outline-danger" onClick={() => openLifecycle(event, "cancel")}>Cancelar evento</Button>}
                      <Button variant="outline-danger" onClick={() => openLifecycle(event, "delete")}>Excluir</Button>

                      {activeForEntry && (
                        <>
                          <Button variant="outline-light" onClick={() => navigate(`/checkin?eventId=${event.id}`)}>Portaria</Button>
                          <Button variant="outline-light" onClick={() => navigate(`/event/${event.slug}`)}>Página pública</Button>
                          <Button variant="outline-light" onClick={() => share(event)}>Compartilhar</Button>
                        </>
                      )}
                    </div>
                  </Card.Body></Card>
                </Col>
              );
            })}
          </Row>
        )}
      </Container>

      <Modal show={Boolean(modal)} onHide={closeModal} centered size="lg">
        <Modal.Header closeButton={!busyId}>
          <Modal.Title>{modalCopy?.title || "Gerenciar evento"}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {impactLoading ? (
            <div className="py-4 text-center">Calculando impacto comercial...</div>
          ) : (
            <>
              <p>{modalCopy?.description}</p>
              {modal?.impact && (
                <Row className="g-2 mb-4">
                  <Col sm={6} lg={3}><Card className="h-100"><Card.Body><small>Pedidos pagos</small><strong className="d-block fs-4">{modal.impact.paid_orders_count || 0}</strong></Card.Body></Card></Col>
                  <Col sm={6} lg={3}><Card className="h-100"><Card.Body><small>Compradores</small><strong className="d-block fs-4">{modal.impact.buyers_count || 0}</strong></Card.Body></Card></Col>
                  <Col sm={6} lg={3}><Card className="h-100"><Card.Body><small>Ingressos ativos</small><strong className="d-block fs-4">{modal.impact.issued_passes_count || 0}</strong></Card.Body></Card></Col>
                  <Col sm={6} lg={3}><Card className="h-100"><Card.Body><small>Valor pago</small><strong className="d-block fs-5">{money(modal.impact.gross_paid)}</strong></Card.Body></Card></Col>
                </Row>
              )}

              {modal?.action === "cancel" && (modal?.impact?.paid_orders_count || 0) > 0 && (
                <Alert variant="danger">
                  Este evento possui pagamentos confirmados. Ao cancelar, novas vendas serão bloqueadas e a API iniciará o reembolso dos pedidos pagos, preservando os registros para auditoria e suporte.
                </Alert>
              )}

              {modal?.action === "delete" && modal?.impact?.can_delete !== true && (
                <Alert variant="warning">
                  Este evento possui histórico e não pode ser apagado. Use cancelamento, adiamento ou reagendamento conforme a situação.
                </Alert>
              )}

              {modal?.action !== "delete" && (
                <Form.Group className="mb-3">
                  <Form.Label>Motivo</Form.Label>
                  <Form.Control as="textarea" rows={4} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explique o motivo para que o participante saiba o que aconteceu." maxLength={4000} />
                  <Form.Text>Informe pelo menos 5 caracteres. O motivo ficará registrado no histórico do evento.</Form.Text>
                </Form.Group>
              )}

              {modal?.action === "reschedule" && (
                <Row className="g-3">
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label>Novo início</Form.Label>
                      <Form.Control type="datetime-local" value={newStart} onChange={(e) => setNewStart(e.target.value)} />
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label>Novo término</Form.Label>
                      <Form.Control type="datetime-local" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} />
                    </Form.Group>
                  </Col>
                </Row>
              )}
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={closeModal} disabled={Boolean(busyId)}>Voltar</Button>
          <Button variant={modalCopy?.variant || "primary"} onClick={submitLifecycle} disabled={!canSubmitModal}>
            {busyId ? "Processando..." : (modalCopy?.submit || "Confirmar")}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
