import React, { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Modal, Row, Spinner } from "react-bootstrap";
import { useNavigate, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import QrCodeComponent from "../../components/QrCodeComponent";
import cutinappService from "../../services/CutinappService";

const formatDate = (value) => value
  ? new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value))
  : "Não informado";

const invalidStatuses = ["cancelled", "refunded", "charged_back"];

export default function PassDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [pass, setPass] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferEmail, setTransferEmail] = useState("");
  const [transferConfirmed, setTransferConfirmed] = useState(false);
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferError, setTransferError] = useState("");
  const [transferred, setTransferred] = useState(null);

  useEffect(() => {
    let active = true;
    cutinappService.getPass(id)
      .then((item) => active && setPass(item))
      .catch((err) => active && setError(err?.message || "Não foi possível abrir este ingresso."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [id]);

  const share = async () => {
    if (!pass) return;
    try {
      const url = window.location.href;
      if (navigator.share) await navigator.share({ title: `Ingresso · ${pass.event?.title || "Cutinapp"}`, url });
      else await navigator.clipboard.writeText(url);
    } catch (err) {
      if (err?.name !== "AbortError") {
        setError("Não foi possível compartilhar este ingresso neste navegador.");
      }
    }
  };

  const used = Boolean(pass?.checked_in_at) || pass?.status === "checked_in";
  const invalid = invalidStatuses.includes(pass?.status) || Boolean(pass?.event?.is_cancelled);
  const eventEnded = useMemo(() => {
    if (!pass?.event?.end_date) return false;
    const end = new Date(pass.event.end_date);
    return Number.isFinite(end.getTime()) && end.getTime() < Date.now();
  }, [pass?.event?.end_date]);
  const canTransfer = Boolean(pass && !used && !invalid && !eventEnded);

  const openTransfer = () => {
    setTransferEmail("");
    setTransferConfirmed(false);
    setTransferError("");
    setTransferOpen(true);
  };

  const transfer = async (event) => {
    event.preventDefault();
    if (!transferEmail.trim() || !transferConfirmed || transferLoading) return;

    setTransferLoading(true);
    setTransferError("");
    try {
      const result = await cutinappService.transferPass(id, transferEmail.trim());
      setTransferred(result.transfer);
      setPass(null);
      setTransferOpen(false);
      setError("");
    } catch (err) {
      setTransferError(err?.response?.data?.message || err?.message || "Não foi possível transferir este ingresso.");
    } finally {
      setTransferLoading(false);
    }
  };

  const stateLabel = invalid ? "Inválido" : used ? "Utilizado" : eventEnded ? "Evento encerrado" : "Válido para entrada";

  return <div className="cut-app-page"><NavlogComponent />{loading && <ProcessingIndicatorComponent label="Abrindo ingresso" />}
    <Container className="cut-page-container py-4 py-lg-5">
      <div className="cut-page-heading">
        <div><span className="cut-eyebrow">Ingresso digital</span><h1>{pass?.event?.title || transferred?.event_title || "Meu ingresso"}</h1><p>Seu QR Code é individual. Quando um ingresso é transferido, o código anterior deixa de funcionar e um novo é emitido para o destinatário.</p></div>
        <div className="cut-card-actions">
          <Button variant="outline-light" onClick={() => navigate("/passes")}>Minha carteira</Button>
          {pass && <Button variant="outline-light" onClick={share}>Compartilhar página</Button>}
          {canTransfer && <Button onClick={openTransfer}><i className="fa-solid fa-arrow-right-arrow-left me-2" />Transferir ingresso</Button>}
        </div>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {transferred && <Row className="justify-content-center"><Col xl={8}><Card className="cut-empty-state"><Card.Body>
        <i className="fa-solid fa-circle-check cut-empty-icon" />
        <h2>Ingresso transferido</h2>
        <p>O ingresso agora pertence a <strong>{transferred.recipient_name || transferred.recipient_email}</strong> ({transferred.recipient_email}). Seu QR Code anterior foi invalidado e o destinatário já pode abrir o novo ingresso na própria conta Cutinapp.</p>
        <div className="cut-card-actions justify-content-center"><Button onClick={() => navigate("/passes", { replace: true })}>Voltar para minha carteira</Button></div>
      </Card.Body></Card></Col></Row>}

      {pass && <Row className="justify-content-center g-4"><Col xl={9}><Card className={`cut-ticket-detail ${used ? "is-used" : ""} ${invalid ? "is-cancelled" : ""}`}>
        <div className="cut-ticket-detail__top"><div><div className="d-flex flex-wrap gap-2 mb-3"><Badge bg={invalid ? "danger" : used || eventEnded ? "secondary" : "success"}>{stateLabel}</Badge><Badge bg="dark">{pass.ticket?.type || pass.ticket?.ticket_type || "Ingresso"}</Badge></div><span className="cut-eyebrow">{pass.ticket?.name || "Ingresso Cutinapp"}</span><h2>{pass.event?.title || "Evento"}</h2><p>{formatDate(pass.event?.start_date)}</p></div><div className="cut-ticket-detail__mark"><i className="fa-solid fa-ticket"/><span>CUTINAPP</span></div></div>
        <div className="cut-ticket-detail__perforation"><span/><span/></div>
        <div className="cut-ticket-detail__body"><div className="cut-ticket-detail__qr"><div className="cut-ticket-detail__qrbox"><QrCodeComponent value={pass.token} size={300}/></div><strong>{invalid ? "Ingresso inválido" : used ? "Entrada já validada" : eventEnded ? "Evento encerrado" : "Aponte o QR para a câmera da portaria"}</strong><small>Não compartilhe este QR Code com terceiros. Para passar o ingresso para outra pessoa, use a transferência oficial.</small></div><div className="cut-ticket-detail__facts"><div><span>Titular</span><strong>{pass.holder_name || pass.holder_email}</strong></div><div><span>E-mail</span><strong>{pass.holder_email || "—"}</strong></div><div><span>Data e horário</span><strong>{formatDate(pass.event?.start_date)}</strong></div><div><span>Local</span><strong>{pass.event?.venue || pass.event?.address || "Consulte o evento"}</strong></div><div><span>Produção</span><strong>{pass.event?.production?.name || "Cutinapp"}</strong></div><div><span>Identificador</span><strong>#{pass.id}</strong></div>{used && <div className="cut-ticket-detail__checkin"><span>Check-in</span><strong>{formatDate(pass.checked_in_at)}</strong></div>}</div></div>
        <div className="cut-ticket-detail__footer"><details className="cut-token-details"><summary>Código para validação manual</summary><code>{pass.token}</code></details><div className="cut-card-actions">{canTransfer && <Button onClick={openTransfer}><i className="fa-solid fa-arrow-right-arrow-left me-2" />Transferir</Button>}{pass.event?.slug && <Button variant="outline-light" onClick={() => navigate(`/event/${pass.event.slug}`)}>Ver página do evento</Button>}</div></div>
      </Card></Col></Row>}
    </Container>

    <Modal show={transferOpen} onHide={() => !transferLoading && setTransferOpen(false)} centered backdrop={transferLoading ? "static" : true}>
      <Form onSubmit={transfer}>
        <Modal.Header closeButton={!transferLoading}><Modal.Title>Transferir ingresso</Modal.Title></Modal.Header>
        <Modal.Body>
          <p className="mb-3">Informe o e-mail da conta Cutinapp que receberá este ingresso. Ao concluir, você deixará de ser o titular e o QR Code exibido agora será invalidado imediatamente.</p>
          {transferError && <Alert variant="danger">{transferError}</Alert>}
          <Form.Group className="mb-3" controlId="ticket-transfer-email">
            <Form.Label>E-mail do novo titular</Form.Label>
            <Form.Control type="email" autoComplete="email" value={transferEmail} onChange={(e) => setTransferEmail(e.target.value)} placeholder="pessoa@exemplo.com" disabled={transferLoading} required autoFocus />
            <Form.Text>A pessoa precisa possuir uma conta Cutinapp com esse e-mail.</Form.Text>
          </Form.Group>
          <Form.Check type="checkbox" id="ticket-transfer-confirm" checked={transferConfirmed} onChange={(e) => setTransferConfirmed(e.target.checked)} disabled={transferLoading} label="Confirmo que quero transferir a titularidade deste ingresso e entendo que meu QR Code atual deixará de funcionar." />
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setTransferOpen(false)} disabled={transferLoading}>Cancelar</Button>
          <Button type="submit" disabled={transferLoading || !transferConfirmed || !transferEmail.trim()}>{transferLoading ? <><Spinner animation="border" size="sm" className="me-2" />Transferindo...</> : "Confirmar transferência"}</Button>
        </Modal.Footer>
      </Form>
    </Modal>
  </div>;
}
