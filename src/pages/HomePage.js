import React, { useEffect, useState } from "react";
import { Button, Container } from "react-bootstrap";
import { Link } from "react-router-dom";
import eventService from "../services/EventService";
import PeterTecnetSignature from "../components/PeterTecnetSignature";
import "./HomePage.css";

const dateLabel = (value) => value ? new Intl.DateTimeFormat("pt-BR", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" }).format(new Date(value)) : "Data a confirmar";

export default function HomePage() {
  const [events, setEvents] = useState([]);
  useEffect(() => { let active = true; eventService.list({ per_page: 6 }).then((items) => active && setEvents(items.filter((item) => !item.is_cancelled))).catch(() => {}); return () => { active = false; }; }, []);

  return (
    <div className="cut-home">
      <header className="cut-home__nav"><Container className="cut-home__navInner"><Link to="/" className="cut-home__brand"><img src="/images/logo.png" alt="Cutinapp" /><span>Cutinapp</span></Link><nav><a href="#eventos">Eventos</a><a href="#como-funciona">Como funciona</a><Link to="/login">Entrar</Link><Button as={Link} to="/register" className="cut-home__cta">Criar conta</Button></nav></Container></header>

      <main>
        <section className="cut-home__hero"><div className="cut-home__glow" /><Container className="cut-home__heroInner"><div className="cut-home__copy"><span className="cut-home__eyebrow">Eventos Peter Tecnet</span><h1>Do anúncio à entrada.<br/><em>Um evento conectado.</em></h1><p>Crie eventos, disponibilize cortesias, entregue QR Codes individuais e valide a entrada pelo celular.</p><div className="cut-home__actions"><Button as={Link} to="/event" className="cut-home__primary">Explorar eventos</Button><Button as={Link} to="/register" variant="outline-light">Quero produzir um evento</Button></div><div className="cut-home__proof"><span><i className="fa-solid fa-ticket"/> Cortesias digitais</span><span><i className="fa-solid fa-qrcode"/> QR individual</span><span><i className="fa-solid fa-mobile-screen"/> Check-in mobile</span></div></div><div className="cut-home__visual"><div className="cut-home__visualCard"><div className="cut-home__visualLogo"><img src="/images/logo.png" alt="" /></div><span>Operação de evento</span><h2>Crie. Compartilhe. Valide.</h2><div className="cut-home__steps"><b>01 <small>Produção</small></b><b>02 <small>Evento</small></b><b>03 <small>Ingresso</small></b><b>04 <small>Check-in</small></b></div></div></div></Container></section>

        <section id="eventos" className="cut-home__section"><Container><div className="cut-home__sectionHead"><div><span className="cut-home__eyebrow">Descubra</span><h2>Eventos na Cutinapp</h2><p>Veja o que já está disponível e retire sua entrada quando houver cortesias.</p></div><Button as={Link} to="/event" variant="outline-light">Ver todos</Button></div><div className="cut-home__eventGrid">{events.length ? events.map((event) => <Link key={event.id} to={`/event/${event.slug}`} className="cut-home__eventCard"><div className="cut-home__eventMedia">{event.image ? <img src={`https://api.petertecnet.com.br/storage/${event.image}`} alt=""/> : <i className="fa-regular fa-calendar-days"/>}</div><div><span>{event.production?.name || "Cutinapp"}</span><h3>{event.title}</h3><p>{dateLabel(event.start_date)} · {event.city || event.venue || "Local a confirmar"}</p></div></Link>) : <div className="cut-home__empty"><i className="fa-regular fa-calendar-plus"/><h3>Novos eventos estão chegando</h3><p>Produtores já podem criar e publicar os primeiros eventos da plataforma.</p></div>}</div></Container></section>

        <section id="como-funciona" className="cut-home__section cut-home__section--soft"><Container><div className="cut-home__sectionHead"><div><span className="cut-home__eyebrow">Fluxo simples</span><h2>Uma plataforma para os dois lados do evento</h2></div></div><div className="cut-home__featureGrid"><article><i className="fa-solid fa-user"/><h3>Participante</h3><p>Acessa o evento, retira a cortesia e encontra seu QR Code em Meus ingressos.</p></article><article><i className="fa-solid fa-bullhorn"/><h3>Produtor</h3><p>Organiza sua produção, cria eventos e configura lotes de cortesia gratuitos.</p></article><article><i className="fa-solid fa-qrcode"/><h3>Portaria</h3><p>Lê o QR pela câmera, valida no backend e informa imediatamente se já foi utilizado.</p></article></div></Container></section>
      </main>
      <PeterTecnetSignature />
    </div>
  );
}
