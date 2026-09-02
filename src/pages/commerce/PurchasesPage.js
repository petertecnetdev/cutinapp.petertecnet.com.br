import React, { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Container, Spinner } from "react-bootstrap";
import { Link } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import commerceService from "../../services/CommerceService";
import "./CommerceHistory.css";

const money = (value) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const statusLabel = { paid: "Pago", pending: "Aguardando pagamento", cancelled: "Cancelado", refunded: "Reembolsado", charged_back: "Contestada" };

export default function PurchasesPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    commerceService.purchases({ per_page: 50 })
      .then((response) => active && setData(response))
      .catch((err) => active && setError(err?.message || "Não foi possível carregar suas compras."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

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
          const payment = order.payments?.[0];
          return <Card className="cut-commerce-card" key={order.public_id}>
            <Card.Body>
              <div className="cut-commerce-order-top">
                <div><small>Pedido #{String(order.public_id).slice(0, 8).toUpperCase()}</small><h2>{order.event?.title || "Evento"}</h2><p>{order.production?.name || "Produção"}</p></div>
                <Badge bg={order.status === "paid" ? "success" : order.status === "pending" ? "warning" : "secondary"}>{statusLabel[order.status] || order.status}</Badge>
              </div>
              <div className="cut-commerce-order-grid">
                <span><strong>{money(order.total)}</strong><small>Total</small></span>
                <span><strong>{String(order.payment_method || payment?.method || "-").toUpperCase()}</strong><small>Pagamento</small></span>
                <span><strong>{order.items?.reduce((sum, item) => sum + Number(item.quantity || 0), 0) || 0}</strong><small>Itens</small></span>
              </div>
              <div className="cut-commerce-actions"><Button as={Link} to={`/purchases/${order.public_id}`}>Ver compra e recibo</Button>{order.status === "paid" && <Button as={Link} to="/passes" variant="outline-light">Ver ingressos</Button>}</div>
            </Card.Body>
          </Card>;
        })}
      </div>
    </Container>
  </>;
}
