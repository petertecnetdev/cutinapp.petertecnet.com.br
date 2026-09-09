import React, { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Container, Spinner } from "react-bootstrap";
import { Link, useNavigate } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import commerceService from "../../services/CommerceService";
import { writeCheckoutRecovery } from "../../utils/checkoutRecovery";
import { checkoutSelectionFromOrder, isPendingPixRecoverable, latestPendingPaymentFromOrder, paymentMethodFromOrder } from "../../utils/orderRecovery";
import { writePaymentRecoveryAttribution } from "../../utils/paymentRecoveryAttribution";
import { safeSetSessionJson } from "../../utils/safeStorage";
import "./CommerceHistory.css";

const money = (value) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const statusLabel = { paid: "Pago", pending: "Aguardando pagamento", cancelled: "Cancelado", refunded: "Reembolsado", charged_back: "Contestada" };

export default function PurchasesPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [recoveringOrderId, setRecoveringOrderId] = useState(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    let active = true;
    commerceService.purchases({ per_page: 50 })
      .then((response) => active && setData(response))
      .catch((err) => active && setError(err?.message || "Não foi possível carregar suas compras."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 15000);
    return () => window.clearInterval(intervalId);
  }, []);

  const resumePendingPix = async (order) => {
    const orderId = Number(order?.id || 0);
    const slug = String(order?.event?.slug || "").trim();
    if (!orderId || !slug || !isPendingPixRecoverable(order, Date.now())) return;

    setRecoveringOrderId(orderId);
    setError("");
    try {
      const response = await commerceService.recoverPendingCheckout(orderId);
      const recoveredOrder = response?.order;
      const selection = checkoutSelectionFromOrder(recoveredOrder);
      const payment = latestPendingPaymentFromOrder(recoveredOrder);
      const recoveredPayment = { order: recoveredOrder, payment };

      safeSetSessionJson(`cutinapp_checkout_${slug}`, selection);
      safeSetSessionJson(`cutinapp_payment_${slug}`, recoveredPayment);
      writeCheckoutRecovery(slug, { selection, orderPublicId: recoveredOrder?.public_id || null });
      writePaymentRecoveryAttribution({
        orderPublicId: recoveredOrder?.public_id || "",
        amount: Number(recoveredOrder?.total || 0),
      });

      try {
        window.PeterTecnetTelemetry?.track?.("checkout_recovery_resumed", {
          label: "PIX pendente retomado em Minhas compras",
          target: slug,
          metadata: {
            order_id: orderId,
            order_public_id: recoveredOrder?.public_id || null,
            amount: Number(recoveredOrder?.total || 0),
            payment_method: "pix",
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
      setRecoveringOrderId(null);
    }
  };

  return <>
    <NavlogComponent />
    <Container className="cut-commerce-history py-4 py-lg-5">
      <div className="cut-commerce-heading">
        <div><span className="cut-commerce-kicker">Minha conta</span><h1>Minhas compras</h1><p>Acompanhe pagamentos, recibos e ingressos em um só lugar.</p></div>
        <Button as={Link} to="/passes" variant="outline-light"><i className="fa-solid fa-ticket me-2" />Meus ingressos</Button>
      </div>

      {loading && <div className="text-center py-5"><Spinner animation="border" /><div className="mt-2">Carregando compras...</div></div>}
      {error && <Alert variant="danger">{error}</Alert>}
      {!loading && !error && !(data?.data || []).length && <Card className="cut-commerce-card"><Card.Body><h2>Nenhuma compra ainda</h2><p>Quando você comprar ingressos ou itens de eventos, eles aparecerão aqui.</p><Button as={Link} to="/event">Explorar eventos</Button></Card.Body></Card>}

      <div className="cut-commerce-list">
        {(data?.data || []).map((order) => {
          const paymentMethod = paymentMethodFromOrder(order);
          const canResumePix = isPendingPixRecoverable(order, nowMs);
          return <Card className="cut-commerce-card" key={order.public_id}>
            <Card.Body>
              <div className="cut-commerce-order-top">
                <div><small>Pedido #{String(order.public_id).slice(0, 8).toUpperCase()}</small><h2>{order.event?.title || "Evento"}</h2><p>{order.production?.name || "Produção"}</p></div>
                <Badge bg={order.status === "paid" ? "success" : order.status === "pending" ? "warning" : "secondary"}>{statusLabel[order.status] || order.status}</Badge>
              </div>
              <div className="cut-commerce-order-grid">
                <span><strong>{money(order.total)}</strong><small>Total</small></span>
                <span><strong>{paymentMethod ? paymentMethod.toUpperCase() : "-"}</strong><small>Pagamento</small></span>
                <span><strong>{order.items?.reduce((sum, item) => sum + Number(item.quantity || 0), 0) || 0}</strong><small>Itens</small></span>
              </div>
              <div className="cut-commerce-actions"><Button as={Link} to={`/purchases/${order.public_id}`}>Ver compra e recibo</Button>{canResumePix && <Button variant="success" onClick={() => resumePendingPix(order)} disabled={recoveringOrderId === Number(order.id)}>{recoveringOrderId === Number(order.id) ? "Retomando PIX..." : "Retomar PIX"}</Button>}{order.status === "paid" && <Button as={Link} to="/passes" variant="outline-light">Ver ingressos</Button>}</div>
            </Card.Body>
          </Card>;
        })}
      </div>
    </Container>
  </>;
}
