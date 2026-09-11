import React, { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Modal, Row, Spinner } from "react-bootstrap";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import QrCodeComponent from "../../components/QrCodeComponent";
import cutinappService from "../../services/CutinappService";
import { mapsUrl, money } from "../../utils/passWallet";
import "./PassDetailPage.css";

const formatDate = (value) => value
  ? new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
  : "Não informado";

const invalidStatuses = ["cancelled", "refunded", "charged_back"];

const ticketStatus = (pass, { used, invalid, eventEnded }) => {
  if (pass?.status === "refunded") return { label: "Reembolsado", variant: "info" };
  if (pass?.status === "charged_back") return { label: "Pagamento contestado", variant: "danger" };
  if (pass?.status === "cancelled" || pass?.event?.is_cancelled) return { label: "Cancelado", variant: "danger" };
  if (used) return { label: "Utilizado", variant: "secondary" };
  if (eventEnded) return { label: "Evento encerrado", variant: "secondary" };
  return { label: "Válido para entrada", variant: "success" };
};

export default function PassDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [pass, setPass] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferEmail, setTransferEmail] = useState("");
  const [transferConfirmed, setTransferConfirmed] = useState(false);
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferError, setTransferError] = useState("");
  const [transferred, setTransferred] = useState(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const refreshNow = () => setNow(Date.now());
    const timerId = window.setInterval(refreshNow, 30000);
    document.addEventListener("visibilitychange", refreshNow);
    window.addEventListener("focus", refreshNow);

    return () => {
      window.clearInterval(timerId);
      document.removeEventListener("visibilitychange", refreshNow);
      window.removeEventListener("focus", refreshNow);
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    cutinappService.getPass(id)
      .then((item) => active && setPass(item))
      .catch((err) => active && setError(err?.message || "Não foi possível abrir este ingresso."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [id]);

  const used = Boolean(pass?.checked_in_at) || pass?.status === "checked_in";
  const invalid = invalidStatuses.includes(pass?.status) || Boolean(pass?.event?.is_cancelled);
  const eventEnded = useMemo(() => {
    if (!pass?.event?.end_date) return false;
    const end = new Date(pass.event.end_date);
    return Number.isFinite(end.getTime()) && end.getTime() <= now;
  }, [pass?.event?.end_date, now]);
  const eventStarted = useMemo(() => {
    if (!pass?.event?.start_date) return false;
    const start = new Date(pass.event.start_date);
    return Number.isFinite(start.getTime()) && start.getTime() <= now;
  }, [pass?.event?.start_date, now]);
  const canTransfer = Boolean(
    pass
    && (typeof pass?.wallet_state?.transferable === "boolean"
      ? pass.wallet_state.transferable
      : !used && !invalid && !eventEnded)
  );
  const status = ticketStatus(pass, { used, invalid, eventEnded });
  const routeToMap = mapsUrl(pass?.event);
  const purchase = pass?.purchase || null;
  const complimentary = Boolean(pass?.is_complimentary) || Number(pass?.ticket?.price || 0) <= 0;

  useEffect(() => {
    if (!pass || !location.state?.openTransfer) return;
    if (canTransfer) {
      setTransferEmail("");
      setTransferConfirmed(false);
      setTransferError("");
      setTransferOpen(true);
    } else {
      setNotice("Este ingresso não está disponível para transferência.");
    }
    navigate(location.pathname, { replace: true, state: null });
  }, [canTransfer, location.pathname, location.state, navigate, pass]);

  const shareEvent = async () => {
    if (!pass?.event?.slug) return;
    const url = `${window.location.origin}/event/${encodeURIComponent(pass.event.slug)}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: pass.event.title || "Evento na Cutinapp",
          text: `${pass.event.title || "Evento"} · ${formatDate(pass.event.start_date)}`,
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        setNotice("Link do evento copiado. Seu QR Code não foi compartilhado.");
      }
    } catch (err) {
      if (err?.name !== "AbortError") {
        setError("Não foi possível compartilhar o evento neste navegador.");
      }
    }
  };

  const copyToken = async () => {
    if (!pass?.token) return;
    try {
      await navigator.clipboard.writeText(pass.token);
      setNotice("Código de validação copiado.");
    } catch (_) {
      setError("Não foi possível copiar o código.");
    }
  };

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
      setQrOpen(false);
      setTransferOpen(false);
      setError("");
    } catch (err) {
      setTransferError(err?.response?.data?.message || err?.message || "Não foi possível transferir este ingresso.");
    } finally {
      setTransferLoading(false);
    }
  };

  const goToProduction = () => {
    const production = pass?.event?.production;
    if (production?.slug) navigate(`/production/${production.slug}/public`);
    else if (production?.id) navigate(`/production/${production.id}`);
  };

  return <div className="cut-app-page cut-pass-detail-page">
    <NavlogComponent />
    {loading && <ProcessingIndicatorComponent label="Abrindo ingresso" />}

    <Container className="cut-page-container py-4 py-lg-5">
      <div className="cut-page-heading cut-pass-detail-heading">
        <div>
          <span className="cut-eyebrow">Ingresso digital protegido</span>
          <h1>{pass?.event?.title || transferred?.event_title || "Meu ingresso"}</h1>
          <p>Seu QR Code é individual e só aparece nesta área autenticada. Para entregar o ingresso a outra pessoa, use a transferência oficial.</p>
        </div>
        <div className="cut-card-actions">
          <Button variant="outline-light" onClick={() => navigate("/passes")}>
            <i className="fa-solid fa-wallet me-2" />Minha carteira
          </Button>
          {pass?.event?.slug && <Button variant="outline-light" onClick={shareEvent}>
            <i className="fa-solid fa-share-nodes me-2" />Compartilhar evento
          </Button>}
          {canTransfer && <Button onClick={openTransfer}>
            <i className="fa-solid fa-arrow-right-arrow-left me-2" />Transferir ingresso
          </Button>}
        </div>
      </div>

      {error && <Alert variant="danger" dismissible onClose={() => setError("")}>{error}</Alert>}
      {notice && <Alert variant="info" dismissible onClose={() => setNotice("")}>{notice}</Alert>}

      {transferred && <Row className="justify-content-center">
        <Col xl={8}>
          <Card className="cut-empty-state">
            <Card.Body>
              <i className="fa-solid fa-circle-check cut-empty-icon" />
              <h2>Ingresso transferido</h2>
              <p>O ingresso agora pertence a <strong>{transferred.recipient_name || transferred.recipient_email}</strong> ({transferred.recipient_email}). Seu QR Code anterior foi invalidado e o destinatário recebeu um novo código.</p>
              <div className="cut-card-actions justify-content-center">
                <Button onClick={() => navigate("/passes", { replace: true })}>Voltar para minha carteira</Button>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>}

      {pass && <>
        {(eventStarted && !eventEnded && !invalid) && <Alert variant="success" className="cut-pass-live-alert">
          <div>
            <strong>{used ? "Entrada já validada" : "Seu evento está acontecendo."}</strong>
            <span>{used ? "Aproveite o evento e volte depois para o Reviva." : "Deixe o QR em tela cheia antes de chegar à portaria."}</span>
          </div>
          {!used && <Button size="sm" variant="light" onClick={() => setQrOpen(true)}>Abrir QR agora</Button>}
        </Alert>}

        {pass.event?.is_cancelled && <Alert variant="danger">
          <strong>Evento cancelado.</strong> Consulte a página do evento e sua compra para acompanhar orientações de reembolso.
        </Alert>}

        <Row className="justify-content-center g-4">
          <Col xl={9}>
            <Card className={`cut-ticket-detail ${used ? "is-used" : ""} ${invalid ? "is-cancelled" : ""}`}>
              <div className="cut-ticket-detail__top">
                <div>
                  <div className="d-flex flex-wrap gap-2 mb-3">
                    <Badge bg={status.variant}>{status.label}</Badge>
                    <Badge bg="dark">{pass.ticket?.type || pass.ticket?.ticket_type || "Ingresso"}</Badge>
                    <Badge bg={complimentary ? "primary" : "dark"}>
                      {complimentary ? "Cortesia" : money(purchase?.line_unit_price ?? pass.ticket?.price)}
                    </Badge>
                  </div>
                  <span className="cut-eyebrow">{pass.ticket?.name || "Ingresso Cutinapp"}</span>
                  <h2>{pass.event?.title || "Evento"}</h2>
                  <p>{formatDate(pass.event?.start_date)}</p>
                </div>
                <div className="cut-ticket-detail__mark">
                  <i className="fa-solid fa-ticket" />
                  <span>CUTINAPP</span>
                </div>
              </div>

              <div className="cut-ticket-detail__perforation"><span /><span /></div>

              <div className="cut-ticket-detail__body">
                <div className="cut-ticket-detail__qr">
                  <button
                    type="button"
                    className="cut-pass-qr-button"
                    onClick={() => setQrOpen(true)}
                    aria-label="Abrir QR Code em destaque"
                    disabled={!pass.token}
                  >
                    <div className="cut-ticket-detail__qrbox">
                      <QrCodeComponent value={pass.token} size={300} />
                    </div>
                    {!invalid && !used && !eventEnded && <span className="cut-pass-qr-button__hint">
                      <i className="fa-solid fa-expand me-2" />Toque para ampliar
                    </span>}
                  </button>
                  <strong>{invalid ? "Ingresso inválido" : used ? "Entrada já validada" : eventEnded ? "Evento encerrado" : "Aponte o QR para a câmera da portaria"}</strong>
                  <small>Não envie print deste QR. A transferência oficial invalida o código anterior e protege sua entrada.</small>
                </div>

                <div className="cut-ticket-detail__facts">
                  <div><span>Titular</span><strong>{pass.holder_name || pass.holder_email}</strong></div>
                  <div><span>E-mail</span><strong>{pass.holder_email || "—"}</strong></div>
                  <div><span>Data e horário</span><strong>{formatDate(pass.event?.start_date)}</strong></div>
                  <div><span>Local</span><strong>{pass.event?.venue || pass.event?.formatted_address || pass.event?.address || "Consulte o evento"}</strong></div>
                  <div><span>Produção</span><strong>{pass.event?.production?.name || "Cutinapp"}</strong></div>
                  <div><span>Identificador</span><strong>#{pass.id}</strong></div>
                  {purchase && <div><span>Compra</span><strong>#{String(purchase.public_id).slice(0, 8).toUpperCase()}</strong></div>}
                  {purchase && <div><span>Pagamento</span><strong>{String(purchase.payment_method || "—").toUpperCase()} · {purchase.status === "paid" ? "Pago" : purchase.status}</strong></div>}
                  {used && <div className="cut-ticket-detail__checkin"><span>Check-in</span><strong>{formatDate(pass.checked_in_at)}</strong></div>}
                </div>
              </div>

              <div className="cut-pass-detail-quick-actions">
                {!invalid && !used && !eventEnded && <Button onClick={() => setQrOpen(true)}>
                  <i className="fa-solid fa-qrcode me-2" />QR em tela cheia
                </Button>}
                {routeToMap && !eventEnded && <Button variant="outline-light" onClick={() => window.open(routeToMap, "_blank", "noopener,noreferrer")}>
                  <i className="fa-solid fa-route me-2" />Como chegar
                </Button>}
                {pass.event?.slug && <Button variant="outline-light" onClick={() => navigate(`/event/${pass.event.slug}`)}>
                  <i className="fa-regular fa-calendar me-2" />Ver evento
                </Button>}
                {pass.event?.production?.id && <Button variant="outline-light" onClick={goToProduction}>
                  <i className="fa-solid fa-bolt me-2" />Ver produção
                </Button>}
                {purchase?.public_id && <Button variant="outline-light" onClick={() => navigate(`/purchases/${purchase.public_id}`)}>
                  <i className="fa-regular fa-file-lines me-2" />Compra e recibo
                </Button>}
                {(used || eventEnded) && pass.event?.slug && <Button onClick={() => navigate(`/event/${pass.event.slug}`)}>
                  <i className="fa-solid fa-photo-film me-2" />Reviva este evento
                </Button>}
              </div>

              <div className="cut-ticket-detail__footer">
                <details className="cut-token-details">
                  <summary>Código para validação manual</summary>
                  <code>{pass.token}</code>
                  <Button size="sm" variant="outline-light" className="mt-2" onClick={copyToken}>
                    <i className="fa-regular fa-copy me-2" />Copiar código
                  </Button>
                </details>
                <div className="cut-card-actions">
                  {canTransfer && <Button onClick={openTransfer}>
                    <i className="fa-solid fa-arrow-right-arrow-left me-2" />Transferir
                  </Button>}
                  {pass.event?.slug && <Button variant="outline-light" onClick={shareEvent}>
                    <i className="fa-solid fa-user-group me-2" />Convidar amigos
                  </Button>}
                </div>
              </div>
            </Card>
          </Col>
        </Row>
      </>}
    </Container>

    <Modal
      show={qrOpen && Boolean(pass)}
      onHide={() => setQrOpen(false)}
      centered
      size="lg"
      contentClassName="cut-pass-qr-modal"
    >
      <Modal.Header closeButton>
        <Modal.Title>{pass?.event?.title || "Ingresso"}</Modal.Title>
      </Modal.Header>
      <Modal.Body className="cut-pass-qr-modal__body">
        <span className="cut-eyebrow">Entrada rápida</span>
        <h2>{pass?.ticket?.name || "Ingresso Cutinapp"}</h2>
        <div className="cut-pass-qr-modal__code">
          {pass?.token && <QrCodeComponent value={pass.token} size={420} />}
        </div>
        <strong>{used ? "Este ingresso já foi utilizado" : invalid ? "Este ingresso não está válido" : "Apresente este QR na portaria"}</strong>
        <small>Evite compartilhar prints. Use a transferência oficial para trocar o titular.</small>
        <div className="d-flex flex-wrap justify-content-center gap-2 mt-3">
          {routeToMap && <Button variant="outline-light" onClick={() => window.open(routeToMap, "_blank", "noopener,noreferrer")}>
            <i className="fa-solid fa-route me-2" />Como chegar
          </Button>}
          <Button variant="outline-light" onClick={copyToken}>
            <i className="fa-regular fa-copy me-2" />Código manual
          </Button>
        </div>
      </Modal.Body>
    </Modal>

    <Modal show={transferOpen} onHide={() => !transferLoading && setTransferOpen(false)} centered backdrop={transferLoading ? "static" : true}>
      <Form onSubmit={transfer}>
        <Modal.Header closeButton={!transferLoading}><Modal.Title>Transferir ingresso</Modal.Title></Modal.Header>
        <Modal.Body>
          <p className="mb-3">Informe o e-mail da conta Cutinapp que receberá este ingresso. Ao concluir, você deixará de ser o titular e o QR Code exibido agora será invalidado imediatamente.</p>
          {transferError && <Alert variant="danger">{transferError}</Alert>}
          <Form.Group className="mb-3" controlId="ticket-transfer-email">
            <Form.Label>E-mail do novo titular</Form.Label>
            <Form.Control
              type="email"
              autoComplete="email"
              value={transferEmail}
              onChange={(e) => setTransferEmail(e.target.value)}
              placeholder="pessoa@exemplo.com"
              disabled={transferLoading}
              required
              autoFocus
            />
            <Form.Text>A pessoa precisa possuir uma conta Cutinapp com esse e-mail.</Form.Text>
          </Form.Group>
          <Form.Check
            type="checkbox"
            id="ticket-transfer-confirm"
            checked={transferConfirmed}
            onChange={(e) => setTransferConfirmed(e.target.checked)}
            disabled={transferLoading}
            label="Confirmo que quero transferir a titularidade deste ingresso e entendo que meu QR Code atual deixará de funcionar."
          />
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setTransferOpen(false)} disabled={transferLoading}>Cancelar</Button>
          <Button type="submit" disabled={transferLoading || !transferConfirmed || !transferEmail.trim()}>
            {transferLoading
              ? <><Spinner animation="border" size="sm" className="me-2" />Transferindo...</>
              : "Confirmar transferência"}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  </div>;
}
