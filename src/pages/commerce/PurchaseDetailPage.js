import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Row, Spinner } from "react-bootstrap";
import { Link, useNavigate, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import QrCodeComponent from "../../components/QrCodeComponent";
import commerceService from "../../services/CommerceService";
import { writeCheckoutRecovery } from "../../utils/checkoutRecovery";
import { checkoutSelectionFromOrder, latestPaymentFromOrder, latestPendingPaymentFromOrder, paymentMethodFromOrder } from "../../utils/orderRecovery";
import { writePaymentRecoveryAttribution } from "../../utils/paymentRecoveryAttribution";
import { safeSetSessionJson } from "../../utils/safeStorage";
import "./CommerceHistory.css";

const money = (value) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const statusLabel = { paid: "Pago", pending: "Aguardando pagamento", cancelled: "Cancelado", refunded: "Reembolsado", charged_back: "Contestada" };
const dateTime = (value) => value ? new Date(value).toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" }) : "-";

export default function PurchaseDetailPage() {
  const { publicId } = useParams();
  const navigate = useNavigate();
  const recoveryLandingTrackedRef = useRef(false);
  const [order, setOrder] = useState(null);
  const [credential, setCredential] = useState(null);
  const [loading, setLoading] = useState(true);
  const [credentialLoading, setCredentialLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [recoveringPix, setRecoveringPix] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    commerceService.purchase(publicId)
      .then((response) => active && setOrder(response))
      .catch((err) => active && setError(err?.message || "Não foi possível carregar esta compra."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [publicId]);

  const payment = useMemo(() => latestPaymentFromOrder(order), [order]);
  const paymentMethod = useMemo(() => paymentMethodFromOrder(order), [order]);
  const itemLines = useMemo(() => (order?.items || []).filter((item) => item.type === "item"), [order]);
  const hasPickup = order?.status === "paid" && itemLines.length > 0;
  const expiresAt = Date.parse(order?.expires_at || "");
  const canResumePix = order?.status === "pending"
    && paymentMethod === "pix"
    && Number.isFinite(expiresAt)
    && expiresAt > Date.now();

  useEffect(() => {
    if (!order || recoveryLandingTrackedRef.current) return;

    const recoverySource = new URLSearchParams(window.location.search).get("recovery_source");
    if (recoverySource !== "in_app") return;

    recoveryLandingTrackedRef.current = true;
    try {
      window.PeterTecnetTelemetry?.track?.("checkout_recovery_landed", {
        label: "Lembrete de PIX abriu o detalhe da compra",
        target: String(order?.event?.slug || "purchase_detail"),
        metadata: {
          order_id: Number(order?.id || 0),
          order_public_id: order?.public_id || publicId,
          amount: Number(order?.total || 0),
          payment_method: paymentMethod,
          recovery_source: recoverySource,
          recovery_entrypoint: "purchase_detail",
          can_resume_pix: canResumePix,
        },
      });
    } catch (_) {
      // Attribution must never block purchase details or payment recovery.
    }
  }, [canResumePix, order, paymentMethod, publicId]);

  useEffect(() => {
    if (!hasPickup) {
      setCredential(null);
      return undefined;
    }

    let active = true;
    setCredentialLoading(true);
    commerceService.pickupCredential(publicId)
      .then((response) => active && setCredential(response))
      .catch((err) => active && setError(err?.message || "Não foi possível carregar o QR Code de retirada."))
      .finally(() => active && setCredentialLoading(false));

    return () => { active = false; };
  }, [hasPickup, publicId]);

  const resumePendingPix = async () => {
    const orderId = Number(order?.id || 0);
    const slug = String(order?.event?.slug || "").trim();
    if (!orderId || !slug || !canResumePix) return;

    setRecoveringPix(true);
    setError("");
    try {
      const response = await commerceService.recoverPendingCheckout(orderId);
      const recoveredOrder = response?.order;
      const selection = checkoutSelectionFromOrder(recoveredOrder);
      const recoveredPayment = latestPendingPaymentFromOrder(recoveredOrder);

      safeSetSessionJson(`cutinapp_checkout_${slug}`, selection);
      safeSetSessionJson(`cutinapp_payment_${slug}`, { order: recoveredOrder, payment: recoveredPayment });
      writeCheckoutRecovery(slug, { selection, orderPublicId: recoveredOrder?.public_id || null });
      writePaymentRecoveryAttribution({
        orderPublicId: recoveredOrder?.public_id || "",
        amount: Number(recoveredOrder?.total || 0),
      });

      try {
        window.PeterTecnetTelemetry?.track?.("checkout_recovery_resumed", {
          label: "PIX pendente retomado no detalhe da compra",
          target: slug,
          metadata: {
            order_id: orderId,
            order_public_id: recoveredOrder?.public_id || publicId,
            amount: Number(recoveredOrder?.total || 0),
            payment_method: "pix",
            recovery_entrypoint: "purchase_detail",
            seconds_remaining: Number(response?.payment_recovery_seconds_remaining || 0),
          },
        });
      } catch (_) {
        // Telemetry must never block payment recovery.
      }

      navigate(`/checkout/${encodeURIComponent(slug)}`);
    } catch (err) {
      setError(err?.status === 409
        ? "Esse PIX não está mais disponível. Abra o evento para iniciar uma nova compra, se ainda houver vendas."
        : err?.message || "Não foi possível retomar esse pagamento agora.");
    } finally {
      setRecoveringPix(false);
    }
  };

  const downloadReceipt = async () => {
    setDownloading(true); setError("");
    try {
      const blob = await commerceService.receiptPdf(publicId);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `cutinapp-recibo-${String(publicId).slice(0, 8)}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err?.message || "Não foi possível gerar o recibo.");
    } finally { setDownloading(false); }
  };

  return <>
    <NavlogComponent />
    <Container className="cut-commerce-history py-4 py-lg-5">
      <div className="cut-commerce-heading">
        <div><span className="cut-commerce-kicker">Compra</span><h1>Pedido #{String(publicId).slice(0, 8).toUpperCase()}</h1><p>Detalhes do pagamento, itens e retirada.</p></div>
        <Button as={Link} to="/purchases" variant="outline-light">Voltar às compras</Button>
      </div>
      {loading && <div className="text-center py-5"><Spinner animation="border" /></div>}
      {error && <Alert variant="danger">{error}</Alert>}
      {order && <>
        <Card className="cut-commerce-card mb-3"><Card.Body>
          <div className="cut-commerce-order-top">
            <div><h2>{order.event?.title || "Evento"}</h2><p>{order.production?.name || "Produção"}</p></div>
            <Badge bg={order.status === "paid" ? "success" : order.status === "pending" ? "warning" : "secondary"}>{statusLabel[order.status] || order.status}</Badge>
          </div>
          <Row className="g-3 mt-1">
            <Col md={4}><div className="cut-commerce-stat"><small>Total</small><strong>{money(order.total)}</strong></div></Col>
            <Col md={4}><div className="cut-commerce-stat"><small>Pagamento</small><strong>{paymentMethod ? paymentMethod.toUpperCase() : "-"}</strong></div></Col>
            <Col md={4}><div className="cut-commerce-stat"><small>Evento</small><strong>{dateTime(order.event?.start_date)}</strong></div></Col>
          </Row>
        </Card.Body></Card>

        <Row className="g-3">
          <Col lg={7}><Card className="cut-commerce-card h-100"><Card.Body><h2>Itens</h2>
            <div className="cut-commerce-items">{(order.items || []).map((item) => <div key={item.id} className="cut-commerce-item"><div><strong>{item.name}</strong><small>{item.type === "ticket" ? "Ingresso" : "Item para retirada no evento"}</small></div><span>{item.quantity} × {money(item.unit_price)}<strong>{money(item.subtotal)}</strong></span></div>)}</div>
          </Card.Body></Card></Col>
          <Col lg={5}><Card className="cut-commerce-card h-100"><Card.Body><h2>Pagamento</h2>
            <dl className="cut-commerce-dl"><div><dt>Status</dt><dd>{payment?.status || order.status}</dd></div><div><dt>Provedor</dt><dd>{payment?.provider || "Mercado Pago"}</dd></div><div><dt>ID da transação</dt><dd>{payment?.provider_payment_id || "-"}</dd></div><div><dt>Valor</dt><dd>{money(payment?.amount || order.total)}</dd></div></dl>
            {canResumePix && <Alert variant="info">Seu PIX ainda está disponível. Você pode retomar o pagamento sem refazer o pedido.</Alert>}
            {canResumePix && <Button variant="success" onClick={resumePendingPix} disabled={recoveringPix} className="w-100 mb-2"><i className="fa-brands fa-pix me-2" />{recoveringPix ? "Retomando PIX..." : "Retomar pagamento PIX"}</Button>}
            <Button onClick={downloadReceipt} disabled={downloading} className="w-100"><i className="fa-regular fa-file-pdf me-2" />{downloading ? "Gerando recibo..." : "Baixar recibo em PDF"}</Button>
            {order.status === "paid" && (order.items || []).some((item) => item.type === "ticket") && <Button as={Link} to="/passes" variant="outline-light" className="w-100 mt-2">Abrir meus ingressos</Button>}
          </Card.Body></Card></Col>
        </Row>

        {hasPickup && <Card className="cut-commerce-card mt-3"><Card.Body>
          <Row className="g-4 align-items-center">
            <Col lg={5} className="text-center">
              <span className="cut-commerce-kicker">Retirada no evento</span>
              <h2 className="mt-2">QR Code dos seus itens</h2>
              {credentialLoading && <div className="py-4"><Spinner animation="border" /></div>}
              {!credentialLoading && credential?.status === "redeemed" && <Alert variant="success" className="mt-3 mb-0">Itens retirados em {dateTime(credential.redeemed_at)}.</Alert>}
              {!credentialLoading && credential?.token && credential?.status !== "redeemed" && <div className="d-flex justify-content-center mt-3"><QrCodeComponent value={credential.token} size={240} subject="retirada" alt="QR Code para retirada dos itens comprados" /></div>}
            </Col>
            <Col lg={7}>
              <h3 className="h5">O que retirar</h3>
              <div className="cut-commerce-items mb-3">{(credential?.items || itemLines).map((item) => <div key={item.id || item.event_item_id} className="cut-commerce-item"><div><strong>{item.name}</strong><small>Apresente este QR no atendimento do evento</small></div><span><strong>{item.quantity} un.</strong></span></div>)}</div>
              <Alert variant={credential?.status === "redeemed" ? "secondary" : "info"} className="mb-0">
                {credential?.status === "redeemed"
                  ? "Este QR já foi utilizado e não pode ser resgatado novamente."
                  : `A retirada fica disponível no período do evento${credential?.available_from ? `, a partir de ${dateTime(credential.available_from)}` : ""}. O QR de retirada é separado do QR do ingresso.`}
              </Alert>
            </Col>
          </Row>
        </Card.Body></Card>}

        <div className="cut-commerce-note mt-3">O recibo comprova a compra e o pagamento. O QR do ingresso é usado na entrada; o QR de retirada é usado somente para receber os produtos comprados antecipadamente.</div>
      </>}
    </Container>
  </>;
}
