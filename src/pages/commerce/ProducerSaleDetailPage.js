import React, { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Row, Spinner } from "react-bootstrap";
import { Link, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import commerceService from "../../services/CommerceService";
import "./CommerceHistory.css";

const money = (value) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const statusLabel = { paid: "Pago", pending: "Pendente", cancelled: "Cancelado", refunded: "Reembolsado", charged_back: "Contestada" };

export default function ProducerSaleDetailPage() {
  const { productionId, publicId } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    commerceService.producerSale(productionId, publicId)
      .then((response) => active && setOrder(response))
      .catch((err) => active && setError(err?.message || "Não foi possível carregar esta venda."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [productionId, publicId]);

  const downloadReceipt = async () => {
    setDownloading(true); setError("");
    try {
      const blob = await commerceService.receiptPdf(publicId);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `cutinapp-recibo-${String(publicId).slice(0, 8)}.pdf`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
    } catch (err) { setError(err?.message || "Não foi possível gerar o recibo."); }
    finally { setDownloading(false); }
  };

  const payment = order?.payments?.[0];
  return <><NavlogComponent /><Container className="cut-commerce-history py-4 py-lg-5">
    <div className="cut-commerce-heading"><div><span className="cut-commerce-kicker">Venda</span><h1>Pedido #{String(publicId).slice(0, 8).toUpperCase()}</h1><p>Auditoria completa da venda e entrega.</p></div><Button as={Link} to="/producer/sales" variant="outline-light">Voltar às vendas</Button></div>
    {loading && <div className="text-center py-5"><Spinner animation="border" /></div>}{error && <Alert variant="danger">{error}</Alert>}
    {order && <>
      <Card className="cut-commerce-card mb-3"><Card.Body><div className="cut-commerce-order-top"><div><h2>{order.event?.title || "Evento"}</h2><p>{[order.user?.first_name, order.user?.last_name].filter(Boolean).join(" ") || order.user?.email} · {order.user?.email}</p></div><Badge bg={order.status === "paid" ? "success" : order.status === "pending" ? "warning" : "secondary"}>{statusLabel[order.status] || order.status}</Badge></div>
      <Row className="g-3 mt-1"><Col md={3}><div className="cut-commerce-stat"><small>Bruto</small><strong>{money(order.total)}</strong></div></Col><Col md={3}><div className="cut-commerce-stat"><small>Taxa Cutinapp</small><strong>{money(order.platform_fee)}</strong></div></Col><Col md={3}><div className="cut-commerce-stat"><small>Taxa processador</small><strong>{money(order.processor_fee)}</strong></div></Col><Col md={3}><div className="cut-commerce-stat"><small>Líquido</small><strong>{money(order.producer_net)}</strong></div></Col></Row></Card.Body></Card>
      <Row className="g-3"><Col lg={7}><Card className="cut-commerce-card h-100"><Card.Body><h2>Itens vendidos</h2><div className="cut-commerce-items">{(order.items || []).map((item) => <div className="cut-commerce-item" key={item.id}><div><strong>{item.name}</strong><small>{item.type === "ticket" ? "Ingresso" : "Item"}</small></div><span>{item.quantity} × {money(item.unit_price)}<strong>{money(item.subtotal)}</strong></span></div>)}</div></Card.Body></Card></Col><Col lg={5}><Card className="cut-commerce-card h-100"><Card.Body><h2>Controle</h2><dl className="cut-commerce-dl"><div><dt>Pagamento</dt><dd>{payment?.status || order.status}</dd></div><div><dt>ID Mercado Pago</dt><dd>{payment?.provider_payment_id || "-"}</dd></div><div><dt>Fulfillment</dt><dd>{order.fulfillment_status || "-"}</dd></div><div><dt>Ingressos emitidos</dt><dd>{order.passes?.length || 0}</dd></div></dl><Button className="w-100" onClick={downloadReceipt} disabled={downloading}><i className="fa-regular fa-file-pdf me-2" />{downloading ? "Gerando..." : "Baixar recibo"}</Button></Card.Body></Card></Col></Row>
    </>}
  </Container></>;
}
