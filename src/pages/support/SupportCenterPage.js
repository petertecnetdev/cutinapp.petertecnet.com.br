import React, { useContext, useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Container, Form } from "react-bootstrap";
import { Link, useSearchParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import { AuthContext } from "../../context/AuthContext";
import supportService from "../../services/SupportService";
import { trackTelemetry } from "../../utils/telemetry";
import "./SupportCenterPage.css";

const STATUS_LABELS = {
  open: "Aberto",
  waiting_customer: "Aguardando você",
  waiting_agent: "Em atendimento",
  resolved: "Resolvido",
  closed: "Encerrado",
};

const CATEGORY_OPTIONS = [
  ["general", "Dúvida geral"],
  ["billing", "Compra, pagamento ou reembolso"],
  ["access", "Acesso à conta"],
  ["technical", "Problema técnico"],
  ["bug", "Algo não funcionou"],
  ["security", "Segurança"],
  ["suggestion", "Sugestão"],
];

export default function SupportCenterPage() {
  const { user } = useContext(AuthContext);
  const [params] = useSearchParams();
  const orderPublicId = params.get("order") || "";
  const topic = params.get("topic") || "";
  const initialSubject = topic === "refund"
    ? `Solicitação de análise de reembolso${orderPublicId ? ` — pedido ${orderPublicId.slice(0, 8).toUpperCase()}` : ""}`
    : "";
  const initialMessage = topic === "refund"
    ? "Quero solicitar a análise de reembolso desta compra. Entendo que a elegibilidade depende das condições do evento, do status do ingresso e das regras aplicáveis."
    : "";

  const [form, setForm] = useState({
    name: "",
    email: "",
    category: topic === "refund" ? "billing" : "general",
    subject: initialSubject,
    message: initialMessage,
  });
  const [tickets, setTickets] = useState([]);
  const [loadingTickets, setLoadingTickets] = useState(Boolean(user));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    if (!user) {
      setLoadingTickets(false);
      return;
    }
    let active = true;
    setLoadingTickets(true);
    supportService.mine({ per_page: 20 })
      .then((response) => {
        if (!active) return;
        setTickets(Array.isArray(response?.data) ? response.data : []);
      })
      .catch((err) => active && setError(err?.message || "Não foi possível carregar seus chamados."))
      .finally(() => active && setLoadingTickets(false));
    return () => { active = false; };
  }, [user]);

  const canSubmit = useMemo(() => {
    const identityReady = Boolean(user) || (form.name.trim() && form.email.trim());
    return identityReady && form.subject.trim().length >= 3 && form.message.trim().length >= 3;
  }, [form, user]);

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError("");
    setSuccess(null);
    try {
      const response = await supportService.create({
        name: user ? undefined : form.name.trim(),
        email: user ? undefined : form.email.trim(),
        category: form.category,
        subject: form.subject.trim(),
        message: form.message.trim(),
        metadata: {
          order_id: orderPublicId || undefined,
          screen: "support_center",
          action: topic === "refund" ? "refund_review_request" : "support_request",
        },
      });
      const ticket = response?.ticket || null;
      setSuccess(ticket);
      if (ticket && user) setTickets((current) => [ticket, ...current.filter((item) => item.public_id !== ticket.public_id)]);
      trackTelemetry("support_ticket_created", {
        label: topic === "refund" ? "Solicitação de análise de reembolso aberta" : "Chamado de suporte aberto",
        target: ticket?.public_id || "support",
        metadata: { category: form.category, order_public_id: orderPublicId || null },
      });
      setForm((current) => ({ ...current, subject: "", message: "" }));
    } catch (err) {
      setError(err?.message || "Não foi possível abrir o chamado.");
    } finally {
      setSubmitting(false);
    }
  };

  return <div className="cut-app-page cut-support-page">
    <NavlogComponent />
    <Container className="cut-page-container py-4 py-lg-5">
      <header className="cut-support-hero">
        <div>
          <span className="cut-eyebrow">Central de ajuda</span>
          <h1>Ajuda sem sair da Cutinapp</h1>
          <p>Compra, pagamento, ingresso, conta ou problema técnico. Abra um chamado com o contexto da tela para a equipe conseguir agir mais rápido.</p>
        </div>
        <div className="cut-support-hero__links">
          <Button as={Link} to="/purchases" variant="outline-light"><i className="fa-solid fa-receipt me-2" />Minhas compras</Button>
          <Button as={Link} to="/passes" variant="outline-light"><i className="fa-solid fa-ticket me-2" />Meus ingressos</Button>
        </div>
      </header>

      {error && <Alert variant="danger">{error}</Alert>}
      {success && <Alert variant="success" role="status"><strong>Chamado aberto.</strong> Protocolo {String(success.public_id || "").slice(0, 8).toUpperCase()}. Acompanhe por esta página quando estiver conectado à sua conta.</Alert>}

      <div className="cut-support-layout">
        <Card className="cut-panel cut-support-form-card">
          <Card.Body className="p-4 p-lg-5">
            <span className="cut-eyebrow">{topic === "refund" ? "Compra e reembolso" : "Novo chamado"}</span>
            <h2 className="cut-section-title mt-2">{topic === "refund" ? "Solicitar análise de reembolso" : "Como podemos ajudar?"}</h2>
            {topic === "refund" && <Alert variant="info" className="mt-3">A abertura do chamado não garante reembolso automático. A equipe valida o status do pagamento, uso do ingresso, regras do evento e condições aplicáveis antes de responder.</Alert>}
            <Form onSubmit={submit} className="cut-support-form">
              {!user && <div className="cut-support-form__grid">
                <Form.Group><Form.Label>Nome</Form.Label><Form.Control value={form.name} onChange={update("name")} autoComplete="name" /></Form.Group>
                <Form.Group><Form.Label>E-mail</Form.Label><Form.Control type="email" value={form.email} onChange={update("email")} autoComplete="email" /></Form.Group>
              </div>}
              <Form.Group><Form.Label>Assunto</Form.Label><Form.Control value={form.subject} onChange={update("subject")} maxLength={200} placeholder="Resuma o que aconteceu" /></Form.Group>
              <Form.Group><Form.Label>Categoria</Form.Label><Form.Select value={form.category} onChange={update("category")}>{CATEGORY_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Form.Select></Form.Group>
              <Form.Group><Form.Label>Detalhes</Form.Label><Form.Control as="textarea" rows={6} value={form.message} onChange={update("message")} maxLength={12000} placeholder="Conte o que aconteceu, o que você esperava e o que apareceu na tela." /></Form.Group>
              {orderPublicId && <div className="cut-support-context"><i className="fa-solid fa-receipt" /><span><strong>Pedido relacionado</strong>{orderPublicId}</span></div>}
              {submitting ? <ProcessingIndicatorComponent fullscreen={false} label="Abrindo chamado" /> : <Button type="submit" size="lg" disabled={!canSubmit}>Enviar para o suporte</Button>}
            </Form>
          </Card.Body>
        </Card>

        <aside className="cut-support-side">
          <Card className="cut-panel"><Card.Body className="p-4">
            <span className="cut-eyebrow">Antes de abrir</span>
            <h2 className="h5 mt-2">Atalhos úteis</h2>
            <div className="cut-support-shortcuts">
              <Link to="/purchases"><i className="fa-solid fa-rotate" /><span><strong>PIX pendente</strong>Retome a mesma compra sem gerar cobrança duplicada.</span></Link>
              <Link to="/passes"><i className="fa-solid fa-qrcode" /><span><strong>QR do ingresso</strong>Abra sua carteira e confira o status do passe.</span></Link>
              <Link to="/event"><i className="fa-solid fa-compass" /><span><strong>Eventos</strong>Volte para descoberta e informações públicas.</span></Link>
            </div>
          </Card.Body></Card>

          {user && <Card className="cut-panel"><Card.Body className="p-4">
            <span className="cut-eyebrow">Seus chamados</span>
            <h2 className="h5 mt-2">Acompanhamento</h2>
            {loadingTickets ? <ProcessingIndicatorComponent fullscreen={false} label="Carregando chamados" /> : tickets.length ? <div className="cut-support-tickets">{tickets.map((ticket) => <article key={ticket.public_id}><div><strong>{ticket.subject}</strong><span>{STATUS_LABELS[ticket.status] || ticket.status}</span></div><small>{ticket.category} · {ticket.public_id.slice(0, 8).toUpperCase()}</small></article>)}</div> : <p className="text-secondary mb-0">Você ainda não abriu nenhum chamado.</p>}
          </Card.Body></Card>}
        </aside>
      </div>
    </Container>
  </div>;
}
