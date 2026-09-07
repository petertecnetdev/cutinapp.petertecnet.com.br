import React, { useContext, useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Row, Spinner } from "react-bootstrap";
import { Link } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import { AuthContext } from "../../context/AuthContext";
import appApiClient from "../../services/AppApiClient";
import { isPeterTecnetRoot } from "../../utils/applicationRoles";

const modules = [
  { title: "Usuários", description: "Todos os usuários vinculados à Cutinapp, com administração independente de produção.", icon: "fa-solid fa-users", to: "/admin/users", badge: "Global" },
  { title: "Produções", description: "Todas as produções de todos os usuários, com publicação, aprovação e suspensão global.", icon: "fa-solid fa-building", to: "/admin/productions", badge: "Global" },
  { title: "Eventos", description: "Todos os eventos da aplicação, independentemente de produção ou proprietário.", icon: "fa-regular fa-calendar-days", to: "/admin/events", badge: "Global" },
  { title: "Ingressos", description: "Todos os lotes e ingressos de todos os eventos e produções, sem onboarding de produtor.", icon: "fa-solid fa-ticket", to: "/admin/tickets", badge: "Global" },
  { title: "Vendas", description: "Pedidos e vendas consolidados de toda a Cutinapp.", icon: "fa-solid fa-chart-line", to: "/admin/orders", badge: "Global" },
  { title: "Financeiro", description: "Visão financeira consolidada de toda a plataforma, sem filtro pelo usuário logado.", icon: "fa-solid fa-wallet", to: "/admin/finance", badge: "Global" },
  { title: "Check-in", description: "Acompanhe acessos e invalide ingressos de qualquer evento quando necessário.", icon: "fa-solid fa-qrcode", to: "/admin/checkins", badge: "Global" },
  { title: "Moderação", description: "Revise denúncias e ações de segurança no contexto administrativo da Cutinapp.", icon: "fa-solid fa-shield-halved", to: "/admin/moderation", badge: "Segurança" },
];

const scalar = (value) => {
  if (typeof value === "number") return value;
  if (value && typeof value === "object") return value.total ?? value.count ?? null;
  return value ?? null;
};

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
    const candidates = [
      ["Eventos", scalar(overview.events_count ?? overview.events)],
      ["Produções", scalar(overview.establishments_count ?? overview.establishments)],
      ["Ingressos", scalar(overview.tickets_count ?? overview.tickets)],
      ["Usuários", scalar(overview.users_count ?? overview.users)],
      ["Pedidos", scalar(overview.orders_count ?? overview.orders)],
      ["Interações", scalar(overview.interactions_count ?? overview.interactions)],
    ];
    return candidates.filter(([, value]) => value !== undefined && value !== null);
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
          <p>Controle global da Cutinapp. Este contexto não representa produtor, gerente, artista, promoter ou participante e não depende de nenhuma produção pertencente à conta.</p>
        </div>
        <div className="d-flex flex-wrap gap-2 justify-content-end"><Badge bg="danger">OWNER</Badge><Badge bg="dark">{context?.profile?.name || "Cutinapp Owner"}</Badge></div>
      </div>

      <Alert variant="info"><strong>Escopo global ativo.</strong> Os módulos abaixo operam sobre toda a aplicação Cutinapp e não sobre “minha produção”.</Alert>
      {error && <Alert variant="danger">{error}</Alert>}
      {loading ? <div className="text-center py-5"><Spinner /><p className="mt-2">Carregando administração global da Cutinapp...</p></div> : <>
        {stats.length > 0 && <Row className="g-3 mb-4">{stats.map(([label, value]) => <Col xs={6} lg={4} xl={2} key={label}><Card className="cut-panel h-100"><Card.Body><span className="cut-eyebrow">{label}</span><div className="display-6 fw-bold mt-2">{value}</div></Card.Body></Card></Col>)}</Row>}
        <Row className="g-3">
          {modules.map((module) => <Col md={6} xl={4} key={module.title}><Card className="cut-panel h-100"><Card.Body className="d-flex flex-column">
            <div className="d-flex justify-content-between align-items-start gap-3 mb-3"><span className="fs-3"><i className={module.icon} /></span><Badge bg={module.badge === "Global" ? "danger" : "secondary"}>{module.badge}</Badge></div>
            <h2 className="cut-section-title">{module.title}</h2>
            <p className="text-secondary flex-grow-1">{module.description}</p>
            <Button as={Link} to={module.to}>Abrir {module.title.toLowerCase()}</Button>
          </Card.Body></Card></Col>)}
        </Row>
      </>}
    </Container>
  </div>;
}
