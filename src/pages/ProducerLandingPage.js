import React from "react";
import { Button, Container } from "react-bootstrap";
import { Link } from "react-router-dom";
import CommerceTrustRail from "../components/CommerceTrustRail";
import PeterTecnetSignature from "../components/PeterTecnetSignature";
import "./ProducerLandingPage.css";

const capabilities = [
  ["fa-solid fa-calendar-plus", "Publique sem retrabalho", "Crie eventos, duplique edições e use agenda recorrente para operações semanais."],
  ["fa-solid fa-ticket", "Ingressos e itens", "Organize lotes, cortesias, itens opcionais e uma compra única para o participante."],
  ["fa-solid fa-qrcode", "Check-in conectado", "Valide ingressos, acompanhe entradas e preserve o histórico operacional do evento."],
  ["fa-solid fa-chart-line", "Vendas e operação", "Acompanhe receita, participantes, conversão e resultados por evento e produção."],
  ["fa-solid fa-photo-film", "Mídia reaproveitável", "Use biblioteca de mídia, perfis públicos, line-up e compartilhamento para reduzir retrabalho."],
  ["fa-solid fa-users", "Audiência que continua", "Produção, artistas e comunidade mantêm o vínculo antes e depois do evento."],
];

const steps = [
  "Crie sua produção",
  "Configure o primeiro evento",
  "Adicione ingressos e itens",
  "Publique e compartilhe",
  "Faça check-in",
  "Acompanhe vendas e próxima edição",
];

export default function ProducerLandingPage() {
  return <div className="cut-producer-landing">
    <header className="cut-producer-landing__nav">
      <Container>
        <Link to="/" className="cut-producer-landing__brand"><img src="/images/logo.png" alt="" /><span><strong>Cutinapp</strong><small>PARA PRODUTORES</small></span></Link>
        <nav>
          <Link to="/event">Ver eventos</Link>
          <Link to="/help">Ajuda</Link>
          <Link to="/login">Entrar</Link>
          <Button as={Link} to="/register" state={{ from: "/event/create", acquisitionSource: "producer_landing" }}>Criar meu evento</Button>
        </nav>
      </Container>
    </header>

    <main>
      <section className="cut-producer-landing__hero">
        <Container className="cut-producer-landing__heroGrid">
          <div>
            <span className="cut-eyebrow">Operação de eventos, sem ficar espalhada</span>
            <h1>Publique, venda e opere seu evento <em>em um fluxo só.</em></h1>
            <p>A Cutinapp conecta descoberta pública, ingressos, itens, line-up, participantes, check-in, financeiro e recorrência sem obrigar o produtor a montar a operação em ferramentas desconectadas.</p>
            <div className="cut-producer-landing__actions">
              <Button as={Link} to="/register" state={{ from: "/event/create", acquisitionSource: "producer_landing" }} size="lg">Criar meu primeiro evento <i className="fa-solid fa-arrow-right ms-2" /></Button>
              <Link to="/login">Já tenho conta</Link>
            </div>
            <CommerceTrustRail context="event" />
          </div>
          <div className="cut-producer-landing__command">
            <span>FLUXO DO PRODUTOR</span>
            {steps.map((step, index) => <div key={step}><b>{String(index + 1).padStart(2, "0")}</b><strong>{step}</strong><i className="fa-solid fa-check" /></div>)}
          </div>
        </Container>
      </section>

      <section className="cut-producer-landing__section">
        <Container>
          <div className="cut-producer-landing__heading"><span className="cut-eyebrow">Do cadastro ao pós-evento</span><h2>Ferramentas que acompanham a operação real.</h2><p>Comece pelo essencial e use os recursos avançados conforme a produção cresce.</p></div>
          <div className="cut-producer-landing__grid">{capabilities.map(([icon,title,description]) => <article key={title}><i className={icon} /><h3>{title}</h3><p>{description}</p></article>)}</div>
        </Container>
      </section>

      <section className="cut-producer-landing__section cut-producer-landing__section--focus">
        <Container className="cut-producer-landing__focus">
          <div><span className="cut-eyebrow">Eventos recorrentes</span><h2>Uma agenda semanal não deveria exigir sete cadastros toda semana.</h2><p>Associe eventos-base aos dias da semana, escolha o intervalo e reutilize estrutura, ingressos, mídia e line-up com controle sobre cada edição.</p></div>
          <div className="cut-producer-landing__week">{["SEG","TER","QUA","QUI","SEX","SÁB","DOM"].map((day,index)=><span key={day} className={index>=4?"active":""}>{day}<small>{index>=4?"Evento":"Livre"}</small></span>)}</div>
        </Container>
      </section>

      <section className="cut-producer-landing__cta">
        <Container>
          <div><span className="cut-eyebrow">Comece pelo evento</span><h2>Você não precisa configurar tudo antes de publicar sua primeira estrutura.</h2><p>Crie a conta, cadastre sua produção e avance pelo fluxo guiado. As configurações de operação aparecem quando passam a ser necessárias.</p></div>
          <Button as={Link} to="/register" state={{ from: "/event/create", acquisitionSource: "producer_landing_bottom" }} size="lg">Começar agora</Button>
        </Container>
      </section>
    </main>
    <PeterTecnetSignature />
  </div>;
}
