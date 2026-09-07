import React, { useContext, useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Row, Spinner } from "react-bootstrap";
import { Link } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import { AuthContext } from "../../context/AuthContext";
import appApiClient from "../../services/AppApiClient";
import { isPeterTecnetRoot } from "../../utils/applicationRoles";

const modules = [
  { title: "Usuários", description: "Cadastre e administre usuários vinculados à Cutinapp.", icon: "fa-solid fa-users", to: "/admin/users", badge: "Gestão" },
  { title: "Produções", description: "Crie produções e administre a operação dos estabelecimentos produtores.", icon: "fa-solid fa-building", to: "/production/create", badge: "Operação" },
  { title: "Eventos", description: "Cadastre eventos, publique, replique agendas e acompanhe o portfólio da aplicação.", icon: "fa-regular fa-calendar-days", to: "/admin/events", badge: "Operação" },
  { title: "Ingressos", description: "Cadastre lotes, cortesias e acompanhe participantes e vendas por evento.", icon: "fa-solid fa-ticket", to: "/ticket/create", badge: "Receita" },
  { title: "Vendas", description: "Acompanhe vendas, pedidos e performance comercial das produções.", icon: "fa-solid fa-chart-line", to: "/producer/sales", badge: "Receita" },
  { title: "Financeiro", description: "Consulte indicadores financeiros e a operação de recebimentos da Cutinapp.", icon: "fa-solid fa-wallet", to: "/producer/finance", badge: "Financeiro" },
  { title: "Check-in", description: "Abra a portaria e acompanhe validações de ingressos e acessos.", icon: "fa-solid fa-qrcode", to: "/checkin", badge: "Operação" },
  { title: "Moderação", description: "Revise denúncias e atividades que exigem ação administrativa.", icon: "fa-solid fa-shield-halved", to: "/moderation/reports", badge: "Segurança" },
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
    const candidates = [
      ["Eventos", overview.events_count ?? overview.events?.total],
      ["Produções", overview.establishments_count ?? overview.establishments?.total],
      ["Ingressos", overview.tickets_count ?? overview.tickets?.total],
      ["Usuários", overview.users_count ?? overview.users?.total],
    ];
    return candidates.filter(([, value]) => value !== undefined && value !== null);
  }, [overview]);

  if (!root) {
    return <div className="cut-app-page"><NavlogComponent /><Container className="cut-page-container py-5"><Alert variant="danger"><strong>Acesso restrito.</strong> O Admin Center da Cutinapp é exclusivo da Peter Tecnet.</Alert></Container></div>;
  }

  return <div className="cut-app-page">
    <NavlogComponent />
    <Container className="cut-page-container py-4 py-lg-5">
      <div className="cut-page-heading align-items-start">
        <div>
          <span className="cut-eyebrow">Peter Tecnet · Cutinapp</span>
          <h1>Admin Center</h1>
          <p>Administração completa da Cutinapp, separada da operação comum de usuários, gerentes, produtores, artistas e promoters.</p>
        </div>
        <Badge bg="dark">{context?.profile?.name || "Super Administrador"}</Badge>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}
      {loading ? <div className="text-center py-5"><Spinner /><p className="mt-2">Carregando administração da Cutinapp...</p></div> : <>
        {stats.length > 0 && <Row className="g-3 mb-4">{stats.map(([label, value]) => <Col xs={6} lg={3} key={label}><Card className="cut-panel h-100"><Card.Body><span className="cut-eyebrow">{label}</span><div className="display-6 fw-bold mt-2">{value}</div></Card.Body></Card></Col>)}</Row>}
        <Row className="g-3">
          {modules.map((module) => <Col md={6} xl={4} key={module.title}><Card className="cut-panel h-100"><Card.Body className="d-flex flex-column">
            <div className="d-flex justify-content-between align-items-start gap-3 mb-3"><span className="fs-3"><i className={module.icon} /></span><Badge bg="secondary">{module.badge}</Badge></div>
            <h2 className="cut-section-title">{module.title}</h2>
            <p className="text-secondary flex-grow-1">{module.description}</p>
            <Button as={Link} to={module.to}>Abrir {module.title.toLowerCase()}</Button>
          </Card.Body></Card></Col>)}
        </Row>
      </>}
    </Container>
  </div>;
}
