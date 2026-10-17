import React, { useContext, useEffect, useMemo, useState } from "react";
import { Alert, Button, Form } from "react-bootstrap";
import { Link, useSearchParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import { AuthContext } from "../../context/AuthContext";
import supportService from "../../services/SupportService";
import { trackTelemetry } from "../../utils/telemetry";
import { buildCutinappWhatsappHref, getPeterWhatsapp } from "../../utils/peterWhatsappFallback";
import { buildSupportMailto, DEFAULT_SUPPORT_EMAIL, getPeterSupportEmail } from "../../utils/peterSupportEmail";
import { filterSupportFaqs, SUPPORT_TOPICS } from "./supportKnowledgeBase";
import "./SupportCenterPage.css";

const STATUS_LABELS = {
  open: "Aberto", waiting_customer: "Aguardando você",
  waiting_agent: "Em atendimento", resolved: "Resolvido", closed: "Encerrado",
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

const CONTACT_ICON = {
  whatsapp: "fa-brands fa-whatsapp", email: "fa-regular fa-envelope",
  ticket: "fa-regular fa-pen-to-square",
};

export default function SupportCenterPage() {
  const { user } = useContext(AuthContext);
  const [params] = useSearchParams();
  const orderPublicId = params.get("order") || "";
  const topic = params.get("topic") || "";
  const initialSubject = topic === "refund"
    ? `Solicitação de análise de reembolso${orderPublicId ? ` — pedido ${orderPublicId.slice(0, 8).toUpperCase()}` : ""}` : "";
  const initialMessage = topic === "refund"
    ? "Quero solicitar a análise de reembolso desta compra. Entendo que a elegibilidade depende das condições do evento, do status do ingresso e das regras aplicáveis." : "";

  const [query, setQuery] = useState("");
  const [faqTopic, setFaqTopic] = useState("all");
  const faqs = useMemo(() => filterSupportFaqs(query, faqTopic), [query, faqTopic]);
  const [whatsappDestination, setWhatsappDestination] = useState("");
  const [supportEmail, setSupportEmail] = useState(DEFAULT_SUPPORT_EMAIL);
  const [form, setForm] = useState({
    name: "", email: "", category: topic === "refund" ? "billing" : "general",
    subject: initialSubject, message: initialMessage,
  });
  const [tickets, setTickets] = useState([]);
  const [loadingTickets, setLoadingTickets] = useState(Boolean(user));
  const [ticketsError, setTicketsError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    let active = true;
    getPeterWhatsapp()
      .then((value) => { if (active) setWhatsappDestination(value || ""); })
      .catch(() => { if (active) setWhatsappDestination(""); });
    getPeterSupportEmail().then((email) => { if (active) setSupportEmail(email); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!user) {
      setTickets([]);
      setTicketsError("");
      setLoadingTickets(false);
      return;
    }
    let active = true;
    setLoadingTickets(true);
    setTicketsError("");
    supportService.mine({ per_page: 20 })
      .then((response) => { if (active) setTickets(Array.isArray(response?.data) ? response.data : []); })
      .catch(() => { if (active) setTicketsError("Não foi possível carregar seus chamados agora."); })
      .finally(() => { if (active) setLoadingTickets(false); });
    return () => { active = false; };
  }, [user]);

  const whatsappHref = buildCutinappWhatsappHref(
    whatsappDestination, "/help", typeof window !== "undefined" ? window.location.origin : ""
  );
  const emailHref = buildSupportMailto(supportEmail);
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
      setSuccess(ticket || { public_id: "" });
      if (ticket && user) setTickets((current) => [ticket, ...current.filter((item) => item.public_id !== ticket.public_id)]);
      trackTelemetry("support_ticket_created", {
        label: topic === "refund" ? "Solicitação de análise de reembolso aberta" : "Chamado de suporte aberto",
        target: ticket?.public_id || "support", metadata: { category: form.category, order_public_id: orderPublicId || null },
      });
      setForm((current) => ({ ...current, subject: "", message: "" }));
    } catch (err) {
      setError(err?.message || "Não foi possível abrir o chamado. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  const channelTelemetry = (channel) => trackTelemetry("support_contact_selected", {
    label: `Atendimento Cutinapp via ${channel}`,
    metadata: { app: "cutinapp", channel, path: "/help" },
  });

  return <div className="cut-app-page cut-support-page">
    <NavlogComponent />
    <main className="cut-page-container cut-support-main">
      <header className="cut-support-hero">
        <div>
          <span className="cut-support-eyebrow"><i className="fa-regular fa-life-ring" aria-hidden="true" /> Central de ajuda Cutinapp</span>
          <h1>Como podemos ajudar?</h1>
          <p>Encontre respostas, resolva dúvidas ou fale com a equipe. Tudo em um único lugar.</p>
        </div>
        <nav className="cut-support-jumps" aria-label="Seções da central de ajuda">
          <a href="#duvidas">Dúvidas frequentes</a>
          <a href="#contato">Fale conosco</a>
          <a href="#abrir-chamado">Abrir chamado</a>
        </nav>
      </header>

      <section id="duvidas" className="cut-support-section" aria-labelledby="faq-heading">
        <div className="cut-support-section-heading">
          <div><span className="cut-support-kicker">Respostas rápidas</span><h2 id="faq-heading">Dúvidas frequentes</h2><p>Pesquise por assunto ou escolha uma categoria.</p></div>
          <div className="cut-support-search">
            <label htmlFor="cut-support-search" className="visually-hidden">Pesquisar respostas</label>
            <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
            <input id="cut-support-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ex.: ingresso, PIX, reembolso..." autoComplete="off" />
          </div>
        </div>
        <div className="cut-support-topics" role="group" aria-label="Filtrar dúvidas por assunto">
          {SUPPORT_TOPICS.map((entry) => <button key={entry.id} type="button" className={faqTopic === entry.id ? "active" : ""} aria-pressed={faqTopic === entry.id} onClick={() => setFaqTopic(entry.id)}><i className={entry.icon} aria-hidden="true" />{entry.label}</button>)}
        </div>
        <div className="cut-support-faq-list" aria-live="polite">
          {faqs.length ? faqs.map((entry) => <details key={entry.id} className="cut-support-faq">
            <summary><span className="cut-support-faq__label"><small>{entry.category}</small><strong>{entry.question}</strong></span><i className="fa-solid fa-plus" aria-hidden="true" /></summary>
            <p>{entry.answer}</p>
          </details>) : <div className="cut-support-empty"><strong>Nenhuma resposta encontrada.</strong><p>Tente outra palavra ou abra um chamado para falar sobre o seu problema.</p><a href="#abrir-chamado">Descrever meu problema <i className="fa-solid fa-arrow-right" aria-hidden="true" /></a></div>}
        </div>
      </section>

      <section id="contato" className="cut-support-section" aria-labelledby="contact-heading">
        <div className="cut-support-section-heading"><div><span className="cut-support-kicker">Atendimento</span><h2 id="contact-heading">Prefere falar com a gente?</h2><p>Escolha o canal mais adequado. O atendimento é feito pela equipe Peter Tecnet, responsável pela Cutinapp.</p></div></div>
        <div className="cut-support-channels">
          {whatsappHref ? <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="cut-support-channel cut-support-channel--whatsapp" onClick={() => channelTelemetry("whatsapp")}>
            <span className="cut-support-channel__icon"><i className={CONTACT_ICON.whatsapp} aria-hidden="true" /></span>
            <span><strong>Conversar pelo WhatsApp</strong><small>Abra uma conversa com a equipe usando uma mensagem inicial sobre a Cutinapp.</small><em>Abrir WhatsApp <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" /></em></span>
          </a> : <div className="cut-support-channel cut-support-channel--unavailable">
            <span className="cut-support-channel__icon"><i className={CONTACT_ICON.whatsapp} aria-hidden="true" /></span>
            <span><strong>WhatsApp</strong><small>Canal indisponível no momento. Você pode enviar um e-mail ou abrir um chamado abaixo.</small><em>Contato ainda não configurado</em></span>
          </div>}
          <a href={emailHref} className="cut-support-channel" onClick={() => channelTelemetry("email")}>
            <span className="cut-support-channel__icon"><i className={CONTACT_ICON.email} aria-hidden="true" /></span>
            <span><strong>Enviar um e-mail</strong><small>{supportEmail}</small><em>Escrever e-mail <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" /></em></span>
          </a>
          <a href="#abrir-chamado" className="cut-support-channel" onClick={() => channelTelemetry("ticket")}>
            <span className="cut-support-channel__icon"><i className={CONTACT_ICON.ticket} aria-hidden="true" /></span>
            <span><strong>Abrir um chamado</strong><small>Relate o problema com detalhes e acompanhe seu atendimento na Cutinapp.</small><em>Preencher formulário <i className="fa-solid fa-arrow-right" aria-hidden="true" /></em></span>
          </a>
        </div>
        <p className="cut-support-security"><i className="fa-solid fa-shield-halved" aria-hidden="true" /> Nunca compartilhe senhas, códigos de verificação, dados completos do cartão ou tokens de acesso nos canais de suporte.</p>
      </section>

      <section id="abrir-chamado" className="cut-support-section" aria-labelledby="ticket-heading">
        <div className="cut-support-section-heading"><div><span className="cut-support-kicker">Atendimento organizado</span><h2 id="ticket-heading">Conte o que aconteceu</h2><p>Envie os detalhes do problema para que a equipe possa analisá-lo. Você também pode abrir um chamado sem estar conectado.</p></div></div>
        <div className="cut-support-layout">
          <div className="cut-support-form-panel">
            {topic === "refund" && <Alert variant="info">A solicitação será analisada conforme as condições do evento, o status do ingresso e as regras aplicáveis. Abrir o chamado não garante reembolso automático.</Alert>}
            {error && <Alert variant="danger" role="alert">{error}</Alert>}
            {success && <Alert variant="success" role="status"><strong>Chamado enviado com sucesso.</strong> {success.public_id ? `Protocolo ${String(success.public_id).slice(0, 8).toUpperCase()}. ` : ""}{user ? "Você pode acompanhar abaixo, em Seus chamados." : "Guarde as informações da confirmação para referência."}</Alert>}
            <Form onSubmit={submit} className="cut-support-form">
              {!user && <div className="cut-support-form__grid">
                <Form.Group controlId="support-name"><Form.Label>Seu nome</Form.Label><Form.Control value={form.name} onChange={update("name")} autoComplete="name" maxLength={120} required placeholder="Como podemos chamar você?" /></Form.Group>
                <Form.Group controlId="support-email"><Form.Label>Seu e-mail</Form.Label><Form.Control type="email" value={form.email} onChange={update("email")} autoComplete="email" maxLength={254} required placeholder="voce@exemplo.com" /></Form.Group>
              </div>}
              <div className="cut-support-form__grid">
                <Form.Group controlId="support-category"><Form.Label>Assunto da solicitação</Form.Label><Form.Select value={form.category} onChange={update("category")}>{CATEGORY_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Form.Select></Form.Group>
                <Form.Group controlId="support-subject"><Form.Label>Título do problema</Form.Label><Form.Control value={form.subject} onChange={update("subject")} maxLength={200} minLength={3} required placeholder="Ex.: Pagamento aprovado, ingresso não apareceu" /></Form.Group>
              </div>
              <Form.Group controlId="support-message"><Form.Label>Descreva o que aconteceu</Form.Label><Form.Control as="textarea" rows={5} value={form.message} onChange={update("message")} minLength={3} maxLength={12000} required placeholder="O que você estava tentando fazer? O que aconteceu? Informe a página, o evento e quando o problema ocorreu, sem enviar informações sensíveis." /><Form.Text>Quanto mais contexto, mais fácil entender a solicitação.</Form.Text></Form.Group>
              {orderPublicId && <div className="cut-support-context"><i className="fa-solid fa-receipt" aria-hidden="true" /><span><strong>Pedido relacionado</strong>{orderPublicId}</span></div>}
              <div className="cut-support-form-footer">
                {submitting ? <ProcessingIndicatorComponent fullscreen={false} label="Enviando chamado" /> : <Button type="submit" disabled={!canSubmit} className="cut-support-submit"><i className="fa-regular fa-paper-plane me-2" aria-hidden="true" />Enviar chamado</Button>}
                <small>Seu relato será enviado ao suporte da Cutinapp para análise.</small>
              </div>
            </Form>
          </div>
          <aside className="cut-support-aside" aria-label="Atalhos e acompanhamento">
            {user && <section className="cut-support-aside-block" aria-labelledby="my-tickets-heading"><h3 id="my-tickets-heading">Seus chamados</h3>
              {loadingTickets ? <ProcessingIndicatorComponent fullscreen={false} label="Carregando chamados" /> : ticketsError ? <p role="alert">{ticketsError}</p> : tickets.length ? <div className="cut-support-tickets">{tickets.map((entry) => <article key={entry.public_id}><div><strong>{entry.subject}</strong><span>{STATUS_LABELS[entry.status] || entry.status}</span></div><small>{entry.category} · {String(entry.public_id || "").slice(0, 8).toUpperCase()}</small></article>)}</div> : <p>Você ainda não abriu nenhum chamado.</p>}
            </section>}
            <section className="cut-support-aside-block" aria-labelledby="shortcuts-heading"><h3 id="shortcuts-heading">Atalhos que ajudam</h3>
              <div className="cut-support-shortcuts">
                <Link to="/purchases"><i className="fa-solid fa-receipt" aria-hidden="true" /><span><strong>Minhas compras</strong><small>Veja o status dos seus pedidos.</small></span><i className="fa-solid fa-chevron-right" aria-hidden="true" /></Link>
                <Link to="/passes"><i className="fa-solid fa-qrcode" aria-hidden="true" /><span><strong>Meus ingressos</strong><small>Encontre os ingressos e QR Codes.</small></span><i className="fa-solid fa-chevron-right" aria-hidden="true" /></Link>
                <Link to="/event"><i className="fa-regular fa-calendar-days" aria-hidden="true" /><span><strong>Explorar eventos</strong><small>Consulte detalhes e organizadores.</small></span><i className="fa-solid fa-chevron-right" aria-hidden="true" /></Link>
              </div>
            </section>
            <div className="cut-support-help-note"><i className="fa-regular fa-lightbulb" aria-hidden="true" /><p>Para problemas em ingressos ou pagamentos, informe a identificação do pedido, se tiver. Nunca envie dados bancários ou senhas.</p></div>
          </aside>
        </div>
      </section>
    </main>
  </div>;
}
