import React, { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Row } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import NavlogComponent from "../components/NavlogComponent";
import SkeletonCard from "../components/SkeletonCard";
import cutinappService from "../services/CutinappService";
import { storageUrl } from "../config";

const fmt = (value) => value ? new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(value)) : "";
const imageUrl = (value) => !value ? "" : /^https?:/.test(value) ? value : `${storageUrl}${String(value).replace(/^\//, "")}`;
const reasonLabel = {
  ticket: "Você tem ingresso",
  interest: "Você acompanha",
  production_follow: "Produção seguida",
  artist_follow: "Artista seguido",
  preferred_city: "Na sua cidade",
  discovery: "Para descobrir",
};

export default function FeedPage() {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [activity, setActivity] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [context, setContext] = useState({});
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (nextPage = 1) => {
    nextPage === 1 ? setLoading(true) : setMoreLoading(true);
    setError("");
    try {
      const response = await cutinappService.feed({ page: nextPage, per_page: 12 });
      const batch = response.feed?.data || [];
      setEvents((current) => nextPage === 1 ? batch : [...current, ...batch.filter((item) => !current.some((old) => old.id === item.id))]);
      if (nextPage === 1) {
        setActivity(response.community_activity || []);
        setNotifications(response.notifications || []);
        setContext(response.context || {});
      }
      setPage(response.feed?.current_page || nextPage);
      setLastPage(response.feed?.last_page || 1);
    } catch (err) {
      setError(err?.message || "Não foi possível montar seu feed agora.");
    } finally {
      setLoading(false);
      setMoreLoading(false);
    }
  }, []);

  useEffect(() => { load(1); }, [load]);

  const openNotification = async (notification) => {
    if (!notification.read_at) cutinappService.markNotificationRead(notification.id).catch(() => null);
    if (notification.reference_url) {
      try {
        const url = new URL(notification.reference_url, window.location.origin);
        if (url.origin === window.location.origin) return navigate(`${url.pathname}${url.search}`);
        window.location.href = notification.reference_url;
        return;
      } catch (_) { /* usa fallback abaixo */ }
    }
    if (notification.reference_type === "event" && notification.reference_id) navigate("/event");
  };

  return <div className="cut-app-page"><NavlogComponent />
    <Container className="cut-page-container py-4 py-lg-5">
      <div className="cut-page-heading"><div><span className="cut-eyebrow">Sua rede de eventos</span><h1>Feed Cutinapp</h1><p>Novidades, conversas e eventos conectados ao que você segue, salva, demonstra interesse e participa.</p>{context.preferred_city && <span className="cut-feed-context"><i className="fa-solid fa-location-dot" /> Prioridade para {context.preferred_city}{context.preferred_uf ? ` - ${context.preferred_uf}` : ""}</span>}</div><div className="cut-card-actions"><Button variant="outline-light" onClick={() => navigate("/notifications")}><i className="fa-regular fa-bell me-2" />Notificações</Button><Button onClick={() => navigate("/event")}>Explorar eventos</Button></div></div>
      {error && <Alert variant="danger">{error}</Alert>}

      {loading ? <Row className="g-4" aria-busy="true">{Array.from({ length: 6 }).map((_, index) => <Col md={6} xl={4} key={index}><SkeletonCard /></Col>)}</Row> : <>
        {(notifications.length > 0 || activity.length > 0) && <section className="cut-feed-timeline mb-5">
          <div className="cut-section-heading"><div><span className="cut-eyebrow">Agora na sua rede</span><h2>Atividade</h2></div></div>
          <div className="cut-feed-activity-list">
            {notifications.slice(0, 6).map((item) => <button type="button" key={`n-${item.id}`} className={`cut-feed-activity ${item.read_at ? "" : "is-unread"}`} onClick={() => openNotification(item)}><span className="cut-feed-activity__icon"><i className="fa-regular fa-bell" /></span><span><strong>{item.title}</strong><small>{item.message || "Novidade na sua rede"}</small><time>{fmt(item.created_at)}</time></span><i className="fa-solid fa-chevron-right" /></button>)}
            {activity.map((item) => <button type="button" key={`p-${item.id}`} className="cut-feed-activity" onClick={() => navigate(`/event/${item.event_slug}#comunidade`)}><span className="cut-feed-activity__icon"><i className="fa-regular fa-comments" /></span><span><strong>{[item.first_name, item.last_name].filter(Boolean).join(" ") || "Participante"} publicou em {item.event_title}</strong><small>{item.body.length > 150 ? `${item.body.slice(0, 150)}…` : item.body}</small><time>{fmt(item.created_at)}</time></span><i className="fa-solid fa-chevron-right" /></button>)}
          </div>
        </section>}

        <section><div className="cut-section-heading"><div><span className="cut-eyebrow">Sua descoberta</span><h2>Eventos para você</h2></div><Button variant="ghost" onClick={() => navigate("/event")}>Ver descoberta</Button></div>
          {events.length === 0 ? <Card className="cut-empty-state"><Card.Body><div className="cut-empty-icon"><i className="fa-solid fa-bolt" /></div><h2>Seu feed está começando</h2><p>Siga artistas e produções, salve eventos ou demonstre interesse. A Cutinapp usa essas relações para deixar seu feed cada vez mais relevante.</p><div className="cut-card-actions justify-content-center"><Button onClick={() => navigate("/event")}>Descobrir eventos</Button><Button variant="outline-light" onClick={() => navigate("/artists")}>Descobrir artistas</Button></div></Card.Body></Card> : <Row className="g-4">{events.map((event) => <Col md={6} xl={4} key={event.id}><Card className="cut-feed-card h-100" onClick={() => navigate(`/event/${event.slug}`)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(`/event/${event.slug}`); } }} role="link" tabIndex={0}><div className="cut-event-card__media">{event.image ? <img src={imageUrl(event.image)} alt={event.title} loading="lazy" /> : <div className="cut-event-card__placeholder"><i className="fa-regular fa-calendar" /></div>}<Badge className="cut-event-card__category">{reasonLabel[event.feed_reason] || reasonLabel.discovery}</Badge></div><Card.Body className="p-4"><div className="cut-feed-source"><span>{event.production?.name || "Cutinapp"}</span><small>{event.city || ""}</small></div><h2>{event.title}</h2><p><i className="fa-regular fa-calendar me-2" />{fmt(event.start_date)}</p>{event.artists?.length > 0 && <div className="cut-lineup-preview">{event.artists.slice(0, 4).map((artist) => <span key={artist.id}>{artist.stage_name}</span>)}</div>}</Card.Body></Card></Col>)}</Row>}
          {page < lastPage && <div className="cut-load-more"><Button variant="outline-light" disabled={moreLoading} onClick={() => load(page + 1)}>{moreLoading ? "Carregando..." : "Carregar mais eventos"}</Button></div>}
        </section>
      </>}
    </Container>
  </div>;
}
