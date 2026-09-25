import React from "react";
import { Button, Container } from "react-bootstrap";
import { Link } from "react-router-dom";
import CommerceTrustRail from "../components/CommerceTrustRail";
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

const highIntentTopics = [
  ["Vender ingressos online", "Monte lotes e tipos de ingresso, publique o evento e conduza o participante do evento ao checkout sem separar divulgação e operação em ferramentas desconectadas."],
  ["Criar evento online", "Cadastre informações, local, programação, mídia, produção responsável e ingressos em um fluxo que termina em uma página pública compartilhável."],
  ["Plataforma para produtores de eventos", "Centralize publicação, participantes, vendas, check-in e próximas edições para transformar o primeiro evento em uma operação recorrente."],
  ["Check-in de ingressos por QR Code", "Use o ingresso emitido no fluxo de compra para validar a entrada e manter o histórico operacional ligado ao evento."],
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
          <Button as={Link} to="/register" state={{ from: "/event/create", acquisitionSource: "producer_landing" }}>Iniciar trial grátis</Button>
        </nav>
      </Container>
    </header>

    <main>
      <section className="cut-producer-landing__hero">
        <Container className="cut-producer-landing__heroGrid">
          <div>
            <span className="cut-eyebrow">30 dias para operar antes de decidir</span>
            <h1>Publique, venda e opere seu evento <em>em um fluxo só.</em></h1>
            <p>A Cutinapp é uma plataforma por assinatura para produtores. No trial inicial de 30 dias, você pode cadastrar sua produção, preparar eventos e incorporar o fluxo à operação antes de decidir pela assinatura.</p>
            <div className="cut-producer-landing__actions">
              <Button as={Link} to="/register" state={{ from: "/event/create", acquisitionSource: "producer_landing" }} size="lg">Iniciar meu trial <i className="fa-solid fa-arrow-right ms-2" /></Button>
              <Link to="/login">Já tenho conta</Link>
            </div>
            <p><small>A assinatura da Cutinapp é separada das taxas inevitáveis do meio de pagamento. Planos e condições aplicáveis são apresentados no fluxo da conta.</small></p>
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
          <div className="cut-producer-landing__heading"><span className="cut-eyebrow">Do trial ao uso real</span><h2>Use o primeiro mês para colocar a operação para funcionar.</h2><p>O objetivo do trial não é apenas conhecer telas: é cadastrar sua produção, publicar seu primeiro evento, operar participantes e perceber se a Cutinapp merece continuar na sua rotina.</p></div>
          <div className="cut-producer-landing__grid">{capabilities.map(([icon,title,description]) => <article key={title}><i className={icon} /><h3>{title}</h3><p>{description}</p></article>)}</div>
        </Container>
      </section>

      <section className="cut-producer-landing__section" aria-labelledby="producer-use-cases">
        <Container>
          <div className="cut-producer-landing__heading">
            <span className="cut-eyebrow">Da descoberta à entrada</span>
            <h2 id="producer-use-cases">Venda ingressos online e opere o evento no mesmo fluxo.</h2>
            <p>Da página pública ao check-in, a Cutinapp conecta as etapas que geram valor durante o trial. O produtor pode começar sem depender de uma cidade específica: cada evento informa sua própria localização e pode ser descoberto e compartilhado pela sua página pública.</p>
          </div>
          <div className="cut-producer-landing__grid">
            {highIntentTopics.map(([title, description]) => <article key={title}><h3>{title}</h3><p>{description}</p></article>)}
          </div>
          <div className="cut-producer-landing__actions">
            <Link to="/event">Explorar eventos publicados</Link>
            <Link to="/productions">Conhecer produções</Link>
          </div>
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
          <div><span className="cut-eyebrow">Comece pelo uso real</span><h2>Seu trial deve chegar ao primeiro evento, não parar no cadastro.</h2><p>Crie a conta, cadastre sua produção e avance pelo fluxo guiado. Você tem 30 dias iniciais para experimentar a operação antes da etapa de assinatura.</p></div>
          <Button as={Link} to="/register" state={{ from: "/event/create", acquisitionSource: "producer_landing_bottom" }} size="lg">Iniciar trial grátis</Button>
        </Container>
      </section>
    </main>
  </div>;
}
