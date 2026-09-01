import React, { useEffect, useState } from "react";
import { Button, Container } from "react-bootstrap";
import { Link } from "react-router-dom";
import eventService from "../services/EventService";
import PeterTecnetSignature from "../components/PeterTecnetSignature";
import SkeletonCard from "../components/SkeletonCard";
import "./HomePage.css";

const dateLabel = (value) => value
  ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value))
  : "Data a confirmar";

export default function HomePage() {
  const [events, setEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(true);

  useEffect(() => {
    let active = true;

    eventService.list({ per_page: 6 })
      .then((items) => {
        if (active) setEvents(items.filter((item) => !item.is_cancelled));
      })
      .catch(() => {
        if (active) setEvents([]);
      })
      .finally(() => {
        if (active) setLoadingEvents(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="cut-home">
      <header className="cut-home__nav">
        <Container className="cut-home__navInner">
          <Link to="/" className="cut-home__brand">
            <span className="cut-home__brandOrb"><img src="/images/logo.png" alt="Cutinapp" /></span>
            <span className="cut-home__brandText"><strong>Cutinapp</strong><small>LIVE EVENT SYSTEM</small></span>
          </Link>
          <nav aria-label="Navegação pública">
            <a href="#eventos">Eventos</a>
            <a href="#como-funciona">Plataforma</a>
            <Link to="/login">Entrar</Link>
            <Button as={Link} to="/register" className="cut-home__cta">Criar conta</Button>
          </nav>
        </Container>
      </header>

      <main>
        <section className="cut-home__hero">
          <div className="cut-home__glow" />
          <div className="cut-home__beam cut-home__beam--a" />
          <div className="cut-home__beam cut-home__beam--b" />
          <Container className="cut-home__heroInner">
            <div className="cut-home__copy">
              <div className="cut-home__statusline">
                <span className="cut-home__liveDot" />
                <span>ECOSSISTEMA DE EVENTOS EM TEMPO REAL</span>
                <b>ONLINE</b>
              </div>
              <span className="cut-home__eyebrow">Experiência conectada</span>
              <h1>O evento começa <br /><em>antes da entrada.</em></h1>
              <p>Uma experiência digital para descoberta, produção, ingressos, artistas, comunidade e acesso. Tudo conectado em uma única plataforma.</p>
              <div className="cut-home__actions">
                <Button as={Link} to="/event" className="cut-home__primary"><span>Explorar eventos</span><i className="fa-solid fa-arrow-right" /></Button>
                <Button as={Link} to="/register" variant="outline-light">Quero produzir um evento</Button>
              </div>
              <div className="cut-home__proof">
                <span><i className="fa-solid fa-ticket" /> Ingressos digitais</span>
                <span><i className="fa-solid fa-qrcode" /> QR individual</span>
                <span><i className="fa-solid fa-bolt" /> Check-in instantâneo</span>
              </div>
            </div>

            <div className="cut-home__visual" aria-hidden="true">
              <div className="cut-home__techFrame">
                <span className="cut-home__corner cut-home__corner--tl" />
                <span className="cut-home__corner cut-home__corner--tr" />
                <span className="cut-home__corner cut-home__corner--bl" />
                <span className="cut-home__corner cut-home__corner--br" />

                <div className="cut-home__visualHeader">
                  <span><i className="fa-solid fa-wave-square" /> CUTINAPP CONTROL</span>
                  <b>LIVE</b>
                </div>

                <div className="cut-home__orbital">
                  <div className="cut-home__orbit cut-home__orbit--outer"><span /></div>
                  <div className="cut-home__orbit cut-home__orbit--middle"><span /></div>
                  <div className="cut-home__orbit cut-home__orbit--inner" />
                  <div className="cut-home__core"><img src="/images/logo.png" alt="" /></div>
                </div>

                <div className="cut-home__telemetry">
                  <article><small>OPERAÇÃO</small><strong>100%</strong><span><i /></span></article>
                  <article><small>ACESSO</small><strong>QR</strong><span><i /></span></article>
                  <article><small>STATUS</small><strong>LIVE</strong><span><i /></span></article>
                </div>

                <div className="cut-home__signal">
                  {Array.from({ length: 26 }).map((_, index) => <i key={index} style={{ "--i": index }} />)}
                </div>
              </div>
            </div>
          </Container>
          <div className="cut-home__ticker" aria-hidden="true">
            <div>
              <span>EVENTOS</span><i /> <span>INGRESSOS</span><i /> <span>ARTISTAS</span><i /> <span>PRODUÇÕES</span><i /> <span>QR CODE</span><i /> <span>CHECK-IN</span><i />
              <span>EVENTOS</span><i /> <span>INGRESSOS</span><i /> <span>ARTISTAS</span><i /> <span>PRODUÇÕES</span><i /> <span>QR CODE</span><i /> <span>CHECK-IN</span><i />
            </div>
          </div>
        </section>

        <section id="eventos" className="cut-home__section">
          <Container>
            <div className="cut-home__sectionHead">
              <div>
                <span className="cut-home__eyebrow">Radar de experiências</span>
                <h2>Eventos na Cutinapp</h2>
                <p>Descubra experiências, acompanhe produções e mantenha seus acessos em um só lugar.</p>
              </div>
              <Button as={Link} to="/event" variant="outline-light">Abrir radar</Button>
            </div>

            <div className="cut-home__eventGrid" aria-busy={loadingEvents}>
              {loadingEvents ? (
                Array.from({ length: 3 }).map((_, index) => <SkeletonCard key={index} />)
              ) : events.length ? (
                events.map((event, index) => (
                  <Link key={event.id} to={`/event/${event.slug}`} className="cut-home__eventCard">
                    <div className="cut-home__eventIndex">0{index + 1}</div>
                    <div className="cut-home__eventMedia">
                      {event.image
                        ? <img src={`https://api.petertecnet.com.br/storage/${event.image}`} alt={`Capa de ${event.title}`} loading="lazy" />
                        : <i className="fa-regular fa-calendar-days" />}
                    </div>
                    <div>
                      <span>{event.production?.name || "Cutinapp"}</span>
                      <h3>{event.title}</h3>
                      <p>{dateLabel(event.start_date)} · {event.city || event.venue || "Local a confirmar"}</p>
                      <b className="cut-home__eventLink">ABRIR EVENTO <i className="fa-solid fa-arrow-up-right-from-square" /></b>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="cut-home__empty">
                  <i className="fa-regular fa-calendar-plus" />
                  <h3>Novos eventos estão chegando</h3>
                  <p>Explore a descoberta ou volte em breve para conferir novas experiências.</p>
                  <Button as={Link} to="/event" variant="outline-light" className="mt-3">Explorar descoberta</Button>
                </div>
              )}
            </div>
          </Container>
        </section>

        <section id="como-funciona" className="cut-home__section cut-home__section--soft">
          <Container>
            <div className="cut-home__sectionHead">
              <div>
                <span className="cut-home__eyebrow">Infraestrutura da experiência</span>
                <h2>Um único fluxo. Muitos pontos conectados.</h2>
                <p>Participantes, produtores, artistas e operação trabalham sobre a mesma experiência digital.</p>
              </div>
            </div>
            <div className="cut-home__featureGrid">
              <article><span className="cut-home__featureCode">01 / DISCOVER</span><i className="fa-solid fa-user-astronaut" /><h3>Participante</h3><p>Descobre eventos, segue artistas e produções e mantém seus ingressos sempre acessíveis.</p><b>EXPERIÊNCIA PESSOAL</b></article>
              <article><span className="cut-home__featureCode">02 / OPERATE</span><i className="fa-solid fa-satellite-dish" /><h3>Produtor</h3><p>Organiza produção, publica eventos, line-up, ingressos e acompanha a operação em um só lugar.</p><b>CONTROLE CENTRAL</b></article>
              <article><span className="cut-home__featureCode">03 / ACCESS</span><i className="fa-solid fa-fingerprint" /><h3>Portaria</h3><p>Lê o QR pela câmera, valida no backend e responde imediatamente ao operador.</p><b>VALIDAÇÃO DIGITAL</b></article>
            </div>
          </Container>
        </section>
      </main>
      <PeterTecnetSignature />
    </div>
  );
}
