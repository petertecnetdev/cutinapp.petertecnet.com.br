import React, { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Row, Spinner } from "react-bootstrap";
import { Link, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import commerceService from "../../services/CommerceService";
import "./CommerceHistory.css";

const money = (value) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const statusLabel = { paid: "Pago", pending: "Aguardando pagamento", cancelled: "Cancelado", refunded: "Reembolsado", charged_back: "Contestada" };

export default function PurchaseDetailPage() {
  const { publicId } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    commerceService.purchase(publicId)
      .then((response) => active && setOrder(response))
      .catch((err) => active && setError(err?.message || "Não foi possível carregar esta compra."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [publicId]);

  const payment = useMemo(() => order?.payments?.[0], [order]);

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
        <div><span className="cut-commerce-kicker">Compra</span><h1>Pedido #{String(publicId).slice(0, 8).toUpperCase()}</h1><p>Detalhes do pagamento, itens e entrega.</p></div>
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
            <Col md={4}><div className="cut-commerce-stat"><small>Pagamento</small><strong>{String(order.payment_method || payment?.method || "-").toUpperCase()}</strong></div></Col>
            <Col md={4}><div className="cut-commerce-stat"><small>Entrega</small><strong>{order.fulfillment_status === "completed" ? "Concluída" : order.status === "paid" ? "Processando" : "Aguardando pagamento"}</strong></div></Col>
          </Row>
        </Card.Body></Card>

        <Row className="g-3">
          <Col lg={7}><Card className="cut-commerce-card h-100"><Card.Body><h2>Itens</h2>
            <div className="cut-commerce-items">{(order.items || []).map((item) => <div key={item.id} className="cut-commerce-item"><div><strong>{item.name}</strong><small>{item.type === "ticket" ? "Ingresso" : "Item do evento"}</small></div><span>{item.quantity} × {money(item.unit_price)}<strong>{money(item.subtotal)}</strong></span></div>)}</div>
          </Card.Body></Card></Col>
          <Col lg={5}><Card className="cut-commerce-card h-100"><Card.Body><h2>Pagamento</h2>
            <dl className="cut-commerce-dl"><div><dt>Status</dt><dd>{payment?.status || order.status}</dd></div><div><dt>Provedor</dt><dd>{payment?.provider || "Mercado Pago"}</dd></div><div><dt>ID da transação</dt><dd>{payment?.provider_payment_id || "-"}</dd></div><div><dt>Valor</dt><dd>{money(payment?.amount || order.total)}</dd></div></dl>
            <Button onClick={downloadReceipt} disabled={downloading} className="w-100"><i className="fa-regular fa-file-pdf me-2" />{downloading ? "Gerando recibo..." : "Baixar recibo em PDF"}</Button>
            {order.status === "paid" && <Button as={Link} to="/passes" variant="outline-light" className="w-100 mt-2">Abrir meus ingressos</Button>}
          </Card.Body></Card></Col>
        </Row>
        <div className="cut-commerce-note mt-3">O recibo comprova a compra e o pagamento. O ingresso com QR Code continua sendo o documento usado para acesso ao evento.</div>
      </>}
    </Container>
  </>;
}
