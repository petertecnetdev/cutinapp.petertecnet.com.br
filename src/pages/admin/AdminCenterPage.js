import React, { useContext, useEffect, useMemo, useState } from "react";
import { Alert, Badge, Card, Col, Container, Row, Spinner } from "react-bootstrap";
import { Link } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import { AuthContext } from "../../context/AuthContext";
import appApiClient from "../../services/AppApiClient";
import { isPeterTecnetRoot } from "../../utils/applicationRoles";

const scalar = (value) => {
  if (typeof value === "number") return value;
  if (value && typeof value === "object") return value.total ?? value.count ?? null;
  return value ?? null;
};

const statDefinitions = [
  { key: "events", label: "Eventos", icon: "fa-regular fa-calendar-days", to: "/admin/events" },
  { key: "establishments", label: "Produções", icon: "fa-solid fa-building", to: "/admin/productions" },
  { key: "tickets", label: "Ingressos", icon: "fa-solid fa-ticket", to: "/admin/tickets" },
  { key: "users", label: "Usuários", icon: "fa-solid fa-users", to: "/admin/users" },
  { key: "orders", label: "Pedidos", icon: "fa-solid fa-receipt", to: "/admin/orders" },
  { key: "interactions", label: "Interações", icon: "fa-solid fa-comments", to: "/admin/moderation" },
];

export default function AdminCenterPage() {
  const { user } = useContext(AuthContext);
  const [context, setContext] = useState(null);
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const root = isPeterTecnetRoot(user);

  useEffect(() => {
    let active = true;
    if (!root) {
      setLoading(false);
      return undefined;
    }

    Promise.all([
      appApiClient.get("/admin/context"),
      appApiClient.get("/admin/overview"),
    ]).then(([contextResponse, overviewResponse]) => {
      if (!active) return;
      setContext(contextResponse.data?.data || null);
      setOverview(overviewResponse.data?.data || null);
    }).catch((err) => {
      if (!active) return;
      setError(err?.response?.data?.message || err?.message || "Não foi possível carregar o Admin Center.");
    }).finally(() => active && setLoading(false));

    return () => { active = false; };
  }, [root]);

  const stats = useMemo(() => {
    if (!overview || typeof overview !== "object") return [];

    const values = {
      events: scalar(overview.events_count ?? overview.events),
      establishments: scalar(overview.establishments_count ?? overview.establishments),
      tickets: scalar(overview.tickets_count ?? overview.tickets),
      users: scalar(overview.users_count ?? overview.users),
      orders: scalar(overview.orders_count ?? overview.orders),
      interactions: scalar(overview.interactions_count ?? overview.interactions),
    };

    return statDefinitions
      .map((definition) => ({ ...definition, value: values[definition.key] }))
      .filter(({ value }) => value !== undefined && value !== null);
  }, [overview]);

  if (!root) {
    return <div className="cut-app-page"><NavlogComponent /><Container className="cut-page-container py-5"><Alert variant="danger"><strong>Acesso restrito.</strong> O Admin Center da Cutinapp é exclusivo do Owner Peter Tecnet.</Alert></Container></div>;
  }

  return <div className="cut-app-page">
    <NavlogComponent />
    <Container className="cut-page-container py-4 py-lg-5">
      <div className="cut-page-heading align-items-start">
        <div>
          <span className="cut-eyebrow">Peter Tecnet · Cutinapp · autoridade máxima</span>
          <h1>Owner Admin Center</h1>
          <p>Escolha uma área abaixo para abrir diretamente a administração global da Cutinapp.</p>
        </div>
        <div className="d-flex flex-wrap gap-2 justify-content-end"><Badge bg="danger">OWNER</Badge><Badge bg="dark">{context?.profile?.name || "Cutinapp Owner"}</Badge></div>
      </div>

      <Alert variant="info"><strong>Escopo global ativo.</strong> Os indicadores abaixo também funcionam como atalhos para administração.</Alert>
      {error && <Alert variant="danger">{error}</Alert>}

      {loading ? <div className="text-center py-5"><Spinner /><p className="mt-2">Carregando administração global da Cutinapp...</p></div> : <>
        {stats.length > 0 && <Row className="g-3 mb-4">
          {stats.map(({ label, value, icon, to }) => <Col xs={6} lg={4} xl={2} key={label}>
            <Card as={Link} to={to} className="cut-panel h-100 text-decoration-none text-reset" style={{ cursor: "pointer" }} aria-label={`Gerenciar ${label.toLowerCase()}`}>
              <Card.Body className="d-flex flex-column justify-content-between gap-3">
                <div className="d-flex align-items-center justify-content-between gap-2">
                  <span className="cut-eyebrow">{label}</span>
                  <i className={`${icon} opacity-75`} aria-hidden="true" />
                </div>
                <div className="display-6 fw-bold">{value}</div>
                <small className="text-secondary">Gerenciar <i className="fa-solid fa-arrow-right ms-1" aria-hidden="true" /></small>
              </Card.Body>
            </Card>
          </Col>)}
        </Row>}
      </>}
    </Container>
  </div>;
}
