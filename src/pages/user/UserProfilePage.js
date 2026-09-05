import React, { useContext, useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { Alert, Badge, Button, Card, Col, Container, Row } from "react-bootstrap";
import { useNavigate, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import SkeletonCard from "../../components/SkeletonCard";
import { ProfileActorBadges, ProfileActorLinks, actorThemeClass } from "../../components/user/ProfileActorIdentity";
import { AuthContext } from "../../context/AuthContext";
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

EventTile.propTypes = {
  event: PropTypes.shape({
    slug: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
    image: PropTypes.string,
    start_date: PropTypes.string,
    city: PropTypes.string,
    uf: PropTypes.string,
    production: PropTypes.shape({ name: PropTypes.string }),
  }).isRequired,
  badge: PropTypes.string,
};

export default function UserProfilePage() {
  const navigate = useNavigate();
  const { userId } = useParams();
  const { user } = useContext(AuthContext);
  const requestedUserId = userId ? Number(userId) : Number(user?.id || 0);
  const isOwnProfile = Boolean(user?.id) && (!userId || Number(userId) === Number(user.id));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("tickets");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setData(null);

    if (!requestedUserId) {
      setError("Não foi possível identificar este perfil.");
      setLoading(false);
      return () => { active = false; };
    }

    const request = isOwnProfile
      ? cutinappService.profileOverview()
      : cutinappService.publicProfile(requestedUserId);

    request
      .then((response) => active && setData(response))
      .catch((err) => active && setError(err?.response?.status === 404 ? "Este perfil não está disponível." : err?.message || "Não foi possível carregar este perfil agora."))
      .finally(() => active && setLoading(false));

    return () => { active = false; };
  }, [requestedUserId, isOwnProfile]);

  const profile = data?.profile || {};
  const stats = data?.stats || {};
  const socialSettings = data?.social_settings || {};
  const actorIdentity = data?.actor_identity || { primary_role: "participant", roles: [{ key: "participant", label: "Participante" }] };
  const actorRoles = Array.isArray(actorIdentity.roles) ? actorIdentity.roles : [];
  const interests = Array.isArray(data?.interests) ? data.interests : [];
  const publicInterestedEvents = Array.isArray(data?.interested_events) ? data.interested_events : [];
  const currentEvents = useMemo(() => {
    if (!data || !isOwnProfile) return [];
    if (tab === "interest") return data.interested_events || [];
    if (tab === "favorites") return data.favorite_events || [];
    if (tab === "history") return data.past_with_ticket || [];
    return data.upcoming_with_ticket || [];
  }, [data, isOwnProfile, tab]);

  const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.user_name || "Participante Cutinapp";
  const initials = `${profile.first_name?.[0] || "C"}${profile.last_name?.[0] || ""}`.toUpperCase();
  const background = image(profile.background);
  const profileEyebrow = isOwnProfile
    ? "Seu perfil Cutinapp"
    : actorRoles.length > 1
      ? "Perfil multiator Cutinapp"
      : actorRoles[0]?.label ? `${actorRoles[0].label} na Cutinapp` : "Perfil Cutinapp";

  return <div className="cut-app-page"><NavlogComponent />
    {data?.profile && <section
      className={`cut-user-profile-hero ${actorThemeClass(actorIdentity)}${background ? " has-background" : ""}`}
      style={background ? { backgroundImage: `url(${JSON.stringify(background)})` } : undefined}
    ><Container className="cut-page-container"><div className="cut-user-profile-hero__inner">
      <div className="cut-user-profile-avatar">{profile.avatar ? <img src={image(profile.avatar)} alt={fullName} /> : <span>{initials}</span>}</div>
      <div className="cut-user-profile-identity">
        <span className="cut-eyebrow">{profileEyebrow}</span>
        <h1>{fullName}</h1>
        <ProfileActorBadges identity={actorIdentity} />
        {profile.user_name && <p>@{profile.user_name}</p>}
        <div className="cut-user-profile-meta">{profile.city && <span><i className="fa-solid fa-location-dot" />{profile.city}{profile.uf ? ` - ${profile.uf}` : ""}</span>}{profile.favorite_genre && <span><i className="fa-solid fa-music" />{profile.favorite_genre}</span>}</div>
        {profile.about && <p className="cut-user-profile-bio">{profile.about}</p>}
      </div>
      {isOwnProfile && <Button variant="outline-light" onClick={() => navigate("/user/edit")}><i className="fa-regular fa-pen-to-square me-2" />Editar perfil</Button>}
    </div></Container></section>}

    <Container className="cut-page-container py-4 py-lg-5">
      {error && <Alert variant="danger">{error}</Alert>}
      {loading ? <Row className="g-4">{Array.from({ length: 3 }).map((_, index) => <Col md={4} key={index}><SkeletonCard /></Col>)}</Row> : data ? <>
        <ProfileActorLinks identity={actorIdentity} />

        {isOwnProfile ? <>
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
        </> : <>
          <div className="cut-user-profile-stats">
            <div><strong>{stats.followers || 0}</strong><span>Seguidores</span></div>
            <div><strong>{stats.following_participants || 0}</strong><span>Pessoas seguindo</span></div>
            <div><strong>{stats.following_artists || 0}</strong><span>Artistas seguindo</span></div>
            <div><strong>{stats.following_productions || 0}</strong><span>Produções seguindo</span></div>
            <div><strong>{stats.posts || 0}</strong><span>Publicações</span></div>
            {stats.interested !== null && stats.interested !== undefined && <div><strong>{stats.interested || 0}</strong><span>Eventos de interesse</span></div>}
          </div>

          {interests.length > 0 && <section className="mb-5"><div className="cut-section-heading"><div><span className="cut-eyebrow">Interesses</span><h2>O que combina com {profile.first_name || "este participante"}</h2></div></div><div className="d-flex flex-wrap gap-2">{interests.map((interest) => <Badge bg="dark" key={interest} className="px-3 py-2">{interest}</Badge>)}</div></section>}

          {socialSettings.show_event_interests !== false && <section><div className="cut-section-heading"><div><span className="cut-eyebrow">Eventos</span><h2>Eventos que despertaram interesse</h2></div></div>{publicInterestedEvents.length === 0 ? <Card className="cut-empty-state"><Card.Body><i className="fa-regular fa-calendar cut-empty-icon" /><h2>Nenhum evento público por aqui</h2><p>Quando este participante demonstrar interesse em eventos públicos, eles poderão aparecer aqui.</p></Card.Body></Card> : <div className="cut-profile-event-grid">{publicInterestedEvents.map((event) => <EventTile key={event.id} event={event} badge="Interesse" />)}</div>}</section>}
        </>}
      </> : null}
    </Container>
  </div>;
}
