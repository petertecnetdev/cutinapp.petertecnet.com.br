import React, { useContext, useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { Alert, Badge, Button, Card, Col, Container, Row } from "react-bootstrap";
import { useNavigate, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import SkeletonCard from "../../components/SkeletonCard";
import { AuthContext } from "../../context/AuthContext";
import cutinappService from "../../services/CutinappService";
import { storageUrl } from "../../config";

const fmt = (value) => value ? new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(value)) : "Data não informada";
const shortFmt = (value) => value ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Sao_Paulo" }).format(new Date(value)) : "";
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
  const { user } = useContext(AuthContext);
  const { userId } = useParams();
  const navigate = useNavigate();
  const isPublicRoute = Boolean(userId);
  const isOwnProfile = !isPublicRoute || Number(userId) === Number(user?.id);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("posts");

  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    const request = isPublicRoute
      ? cutinappService.publicProfile(userId)
      : Promise.all([cutinappService.profileOverview(), cutinappService.publicProfile(user.id)]).then(([privateData, socialData]) => ({
        ...privateData,
        posts: socialData.posts || [],
        public_tickets: socialData.public_tickets || [],
        stats: { ...(privateData.stats || {}), ...(socialData.stats || {}), upcoming_with_ticket: privateData.stats?.upcoming_with_ticket || 0, interested: privateData.stats?.interested || 0, favorites: privateData.stats?.favorites || 0 },
      }));
    request
      .then((response) => active && setData(response))
      .catch((err) => active && setError(err?.message || "Não foi possível carregar este perfil agora."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [isPublicRoute, userId, user?.id]);

  const profile = data?.profile || {};
  const stats = data?.stats || {};
  const currentEvents = useMemo(() => {
    if (!data || isPublicRoute) return [];
    if (tab === "interest") return data.interested_events || [];
    if (tab === "favorites") return data.favorite_events || [];
    if (tab === "history") return data.past_with_ticket || [];
    return data.upcoming_with_ticket || [];
  }, [data, tab, isPublicRoute]);

  const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.user_name || "Participante Cutinapp";
  const initials = `${profile.first_name?.[0] || "C"}${profile.last_name?.[0] || ""}`.toUpperCase();
  const posts = data?.posts || [];
  const publicTickets = data?.public_tickets || [];
  const followingProductions = stats.following_productions ?? stats.following_organizations ?? 0;
  const tabs = isPublicRoute ? [["posts", "Publicações"], ["public-tickets", "Ingressos"]] : [["posts", "Publicações"], ["tickets", "Com ingresso"], ["interest", "Tenho interesse"], ["favorites", "Salvos"], ["history", "Histórico"]];

  const postTarget = (post) => {
    if (post.source_type === "event" && post.target_slug) return { label: post.target_title || "Evento", path: `/event/${post.target_slug}` };
    if (post.source_type === "production" && post.target_slug) return { label: post.target_title || "Produção", path: `/production/${post.target_slug}/public` };
    return { label: "Feed geral", path: "/feed" };
  };

  return <div className="cut-app-page"><NavlogComponent />
    <section className="cut-user-profile-hero"><Container className="cut-page-container"><div className="cut-user-profile-hero__inner">
      <div className="cut-user-profile-avatar">{profile.avatar ? <img src={image(profile.avatar)} alt={fullName} /> : <span>{initials}</span>}</div>
      <div className="cut-user-profile-identity"><span className="cut-eyebrow">Perfil público Cutinapp</span><h1>{fullName}</h1>{profile.user_name && <p>@{profile.user_name}</p>}<div className="cut-user-profile-meta">{profile.city && <span><i className="fa-solid fa-location-dot" />{profile.city}{profile.uf ? ` - ${profile.uf}` : ""}</span>}{profile.favorite_genre && <span><i className="fa-solid fa-music" />{profile.favorite_genre}</span>}</div>{profile.about && <p className="cut-user-profile-bio">{profile.about}</p>}</div>
      {isOwnProfile && user && <Button variant="outline-light" onClick={() => navigate("/user/edit")}><i className="fa-regular fa-pen-to-square me-2" />Editar perfil</Button>}
    </div></Container></section>

    <Container className="cut-page-container py-4 py-lg-5">
      {error && <Alert variant="danger">{error}</Alert>}
      {loading ? <Row className="g-4">{Array.from({ length: 3 }).map((_, index) => <Col md={4} key={index}><SkeletonCard /></Col>)}</Row> : <>
        <div className="cut-user-profile-stats">
          <div><strong>{stats.tickets || 0}</strong><span>Ingressos</span></div>
          <div><strong>{stats.posts || 0}</strong><span>Publicações</span></div>
          <div><strong>{stats.following_artists || 0}</strong><span>Artistas seguindo</span></div>
          <div><strong>{followingProductions}</strong><span>Produções seguindo</span></div>
          {!isPublicRoute && <div><strong>{stats.interested || 0}</strong><span>Tenho interesse</span></div>}
          {!isPublicRoute && <div><strong>{stats.favorites || 0}</strong><span>Salvos</span></div>}
        </div>

        <div className="cut-user-profile-tabs" role="tablist" aria-label="Conteúdo do perfil">
          {tabs.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}</button>)}
        </div>

        {tab === "posts" ? <section className="cut-profile-social-section">
          <div className="cut-section-heading"><div><span className="cut-eyebrow">Atividade pública</span><h2>Publicações de {isOwnProfile ? "você" : fullName}</h2></div>{isOwnProfile && <Button variant="outline-light" onClick={() => navigate("/feed")}>Publicar no feed</Button>}</div>
          {posts.length === 0 ? <Card className="cut-empty-state"><Card.Body><i className="fa-regular fa-message cut-empty-icon" /><h2>Nenhuma publicação ainda</h2><p>As publicações feitas no feed geral, em eventos e em produções aparecem aqui.</p></Card.Body></Card> : <div className="cut-profile-post-list">{posts.map((post) => { const target = postTarget(post); return <article key={`${post.source_type}-${post.id}`}><div className="cut-profile-post-meta"><button type="button" onClick={() => navigate(target.path)}><i className={post.source_type === "event" ? "fa-regular fa-calendar" : post.source_type === "production" ? "fa-solid fa-bullhorn" : "fa-solid fa-earth-americas"} />{target.label}</button><time>{shortFmt(post.created_at)}</time></div><p>{post.body}</p><div className="cut-profile-post-stats"><span><i className="fa-regular fa-heart" /> {post.likes_count || 0}</span><span><i className="fa-regular fa-comment" /> {post.comments_count || 0}</span><span><i className="fa-regular fa-eye" /> {post.views_count || 0}</span></div></article>; })}</div>}
        </section> : tab === "public-tickets" ? <section>
          <div className="cut-section-heading"><div><span className="cut-eyebrow">Rolês confirmados</span><h2>Ingressos de {fullName}</h2></div></div>
          {publicTickets.length === 0 ? <Card className="cut-empty-state"><Card.Body><i className="fa-solid fa-ticket cut-empty-icon" /><h2>Nenhum ingresso público</h2><p>Quando houver ingressos vinculados a eventos públicos, eles aparecem aqui sem expor QR Code ou código de validação.</p></Card.Body></Card> : <div className="cut-profile-public-ticket-grid">{publicTickets.filter((item) => item.event).map((item, index) => <button type="button" key={`${item.event.slug}-${index}`} onClick={() => navigate(`/event/${item.event.slug}`)}><div className="cut-profile-public-ticket__media">{item.event.image ? <img src={image(item.event.image)} alt={item.event.title} /> : <i className="fa-solid fa-ticket" />}</div><div><small>{item.checked_in ? "Ingresso utilizado" : item.event.is_cancelled ? "Evento cancelado" : "Ingresso"}</small><strong>{item.event.title}</strong><span>{item.ticket?.name || "Ingresso"}</span><span><i className="fa-regular fa-calendar me-2" />{fmt(item.event.start_date)}</span><span><i className="fa-solid fa-location-dot me-2" />{item.event.city ? `${item.event.city}${item.event.uf ? ` - ${item.event.uf}` : ""}` : "Local a confirmar"}</span></div></button>)}</div>}
        </section> : <>
          <div className="cut-section-heading"><div><span className="cut-eyebrow">Sua agenda</span><h2>{tab === "tickets" ? "Eventos para os quais você já tem ingresso" : tab === "interest" ? "Eventos que você quer acompanhar" : tab === "favorites" ? "Eventos salvos" : "Eventos que já passaram"}</h2></div>{tab === "tickets" && <Button variant="outline-light" onClick={() => navigate("/passes")}>Abrir carteira</Button>}</div>
          {currentEvents.length === 0 ? <Card className="cut-empty-state"><Card.Body><i className="fa-regular fa-calendar-plus cut-empty-icon" /><h2>Nada por aqui ainda</h2><p>{tab === "tickets" ? "Quando você obtiver um ingresso, o evento aparecerá aqui automaticamente." : "Explore eventos e use os botões de interesse ou salvar para montar seu perfil."}</p><Button onClick={() => navigate("/event")}>Descobrir eventos</Button></Card.Body></Card> : <div className="cut-profile-event-grid">{currentEvents.map((event) => <EventTile key={event.id} event={event} badge={tab === "tickets" ? "Ingresso" : tab === "interest" ? "Interesse" : tab === "favorites" ? "Salvo" : "Histórico"} />)}</div>}
        </>}

        {!isPublicRoute && data?.passes?.length > 0 && <section className="cut-profile-ticket-strip"><div className="cut-section-heading"><div><span className="cut-eyebrow">Carteira privada</span><h2>Seus ingressos recentes</h2></div><Button variant="outline-light" onClick={() => navigate("/passes")}>Ver todos</Button></div><div className="cut-profile-pass-list">{data.passes.slice(0, 6).map((pass) => <button type="button" key={pass.id} onClick={() => navigate(`/passes/${pass.id}`)}><span className={`cut-profile-pass-dot ${pass.checked_in_at ? "used" : ""}`} /><div><strong>{pass.event?.title || pass.ticket?.name || "Ingresso"}</strong><span>{pass.checked_in_at ? "Utilizado" : "Disponível"} · {pass.ticket?.name || "Ingresso"}</span></div><i className="fa-solid fa-chevron-right" /></button>)}</div></section>}
      </>}
    </Container>
  </div>;
}
