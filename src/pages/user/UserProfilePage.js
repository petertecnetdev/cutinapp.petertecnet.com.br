import React, { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Row } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import SkeletonCard from "../../components/SkeletonCard";
import cutinappService from "../../services/CutinappService";
import { storageUrl } from "../../config";

const fmt = (value) => value ? new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(value)) : "Data não informada";
const image = (value) => !value ? "" : /^https?:/.test(value) ? value : `${storageUrl}${String(value).replace(/^\//, "")}`;

function EventTile({ event, badge }) {
  const navigate = useNavigate();
  return <button type="button" className="cut-profile-event-card" onClick={() => navigate(`/event/${event.slug}`)}>
    <div className="cut-profile-event-card__media">{event.image ? <img src={image(event.image)} alt={event.title} /> : <span><i className="fa-regular fa-calendar" /></span>}{badge && <Badge>{badge}</Badge>}</div>
    <div className="cut-profile-event-card__body"><small>{event.production?.name || "Cutinapp"}</small><strong>{event.title}</strong><span><i className="fa-regular fa-calendar me-2" />{fmt(event.start_date)}</span><span><i className="fa-solid fa-location-dot me-2" />{event.city ? `${event.city}${event.uf ? ` - ${event.uf}` : ""}` : "Local a confirmar"}</span></div>
  </button>;
}

export default function UserProfilePage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("tickets");

  useEffect(() => {
    let active = true;
    cutinappService.profileOverview()
      .then((response) => active && setData(response))
      .catch((err) => active && setError(err?.message || "Não foi possível carregar seu perfil agora."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const profile = data?.profile || {};
  const stats = data?.stats || {};
  const currentEvents = useMemo(() => {
    if (!data) return [];
    if (tab === "interest") return data.interested_events || [];
    if (tab === "favorites") return data.favorite_events || [];
    if (tab === "history") return data.past_with_ticket || [];
    return data.upcoming_with_ticket || [];
  }, [data, tab]);

  const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.user_name || "Participante Cutinapp";
  const initials = `${profile.first_name?.[0] || "C"}${profile.last_name?.[0] || ""}`.toUpperCase();

  return <div className="cut-app-page"><NavlogComponent />
    <section className="cut-user-profile-hero"><Container className="cut-page-container"><div className="cut-user-profile-hero__inner">
      <div className="cut-user-profile-avatar">{profile.avatar ? <img src={image(profile.avatar)} alt={fullName} /> : <span>{initials}</span>}</div>
      <div className="cut-user-profile-identity"><span className="cut-eyebrow">Perfil Cutinapp</span><h1>{fullName}</h1>{profile.user_name && <p>@{profile.user_name}</p>}<div className="cut-user-profile-meta">{profile.city && <span><i className="fa-solid fa-location-dot" />{profile.city}{profile.uf ? ` - ${profile.uf}` : ""}</span>}{profile.favorite_genre && <span><i className="fa-solid fa-music" />{profile.favorite_genre}</span>}</div>{profile.about && <p className="cut-user-profile-bio">{profile.about}</p>}</div>
      <Button variant="outline-light" onClick={() => navigate("/user/edit")}><i className="fa-regular fa-pen-to-square me-2" />Editar perfil</Button>
    </div></Container></section>

    <Container className="cut-page-container py-4 py-lg-5">
      {error && <Alert variant="danger">{error}</Alert>}
      {loading ? <Row className="g-4">{Array.from({ length: 3 }).map((_, index) => <Col md={4} key={index}><SkeletonCard /></Col>)}</Row> : <>
        <div className="cut-user-profile-stats">
          <div><strong>{stats.upcoming_with_ticket || 0}</strong><span>Próximos com ingresso</span></div>
          <div><strong>{stats.interested || 0}</strong><span>Tenho interesse</span></div>
          <div><strong>{stats.favorites || 0}</strong><span>Salvos</span></div>
          <div><strong>{stats.following_artists || 0}</strong><span>Artistas seguindo</span></div>
          <div><strong>{stats.following_productions || 0}</strong><span>Produções seguindo</span></div>
          <div><strong>{stats.posts || 0}</strong><span>Publicações</span></div>
        </div>

        <div className="cut-user-profile-tabs" role="tablist" aria-label="Conteúdo do perfil">
          {[['tickets','Com ingresso'],['interest','Tenho interesse'],['favorites','Salvos'],['history','Histórico']].map(([key,label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}</button>)}
        </div>

        <div className="cut-section-heading"><div><span className="cut-eyebrow">Sua agenda</span><h2>{tab === "tickets" ? "Eventos para os quais você já tem ingresso" : tab === "interest" ? "Eventos que você quer acompanhar" : tab === "favorites" ? "Eventos salvos" : "Eventos que já passaram"}</h2></div>{tab === "tickets" && <Button variant="outline-light" onClick={() => navigate("/passes")}>Abrir carteira</Button>}</div>

        {currentEvents.length === 0 ? <Card className="cut-empty-state"><Card.Body><i className="fa-regular fa-calendar-plus cut-empty-icon" /><h2>Nada por aqui ainda</h2><p>{tab === "tickets" ? "Quando você obtiver um ingresso, o evento aparecerá aqui automaticamente." : "Explore eventos e use os botões de interesse ou salvar para montar seu perfil."}</p><Button onClick={() => navigate("/event")}>Descobrir eventos</Button></Card.Body></Card> : <div className="cut-profile-event-grid">{currentEvents.map((event) => <EventTile key={event.id} event={event} badge={tab === "tickets" ? "Ingresso" : tab === "interest" ? "Interesse" : tab === "favorites" ? "Salvo" : "Histórico"} />)}</div>}

        {data?.passes?.length > 0 && <section className="cut-profile-ticket-strip"><div className="cut-section-heading"><div><span className="cut-eyebrow">Carteira</span><h2>Ingressos recentes</h2></div><Button variant="outline-light" onClick={() => navigate("/passes")}>Ver todos</Button></div><div className="cut-profile-pass-list">{data.passes.slice(0, 6).map((pass) => <button type="button" key={pass.id} onClick={() => navigate(`/passes/${pass.id}`)}><span className={`cut-profile-pass-dot ${pass.checked_in_at ? "used" : ""}`} /><div><strong>{pass.event?.title || pass.ticket?.name || "Ingresso"}</strong><span>{pass.checked_in_at ? "Utilizado" : "Disponível"} · {pass.ticket?.name || "Ingresso"}</span></div><i className="fa-solid fa-chevron-right" /></button>)}</div></section>}
      </>}
    </Container>
  </div>;
}

EventTile.propTypes = {};
