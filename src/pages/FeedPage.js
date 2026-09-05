import React, { useCallback, useContext, useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Row } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import NavlogComponent from "../components/NavlogComponent";
import SkeletonCard from "../components/SkeletonCard";
import GlobalFeed from "../components/social/GlobalFeed";
import cutinappService from "../services/CutinappService";
import { storageUrl } from "../config";

const fmt = (value) => value ? new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(value)) : "";
const imageUrl = (value) => !value ? "" : /^https?:/.test(value) ? value : `${storageUrl}${String(value).replace(/^\//, "")}`;
const reasonLabel = {
  ticket: "Você tem ingresso",
  interest: "Você acompanha",
  organization_follow: "Produção seguida",
  production_follow: "Produção seguida",
  artist_follow: "Artista seguido",
  preferred_city: "Na sua cidade",
  discovery: "Para descobrir",
};

export default function FeedPage() {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const [events, setEvents] = useState([]);
  const [context, setContext] = useState({});
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [error, setError] = useState("");
  const [followedProductions, setFollowedProductions] = useState(() => new Set());
  const [followBusy, setFollowBusy] = useState(null);

  const load = useCallback(async (nextPage = 1) => {
    nextPage === 1 ? setLoading(true) : setMoreLoading(true);
    setError("");
    try {
      const response = await cutinappService.feed({ page: nextPage, per_page: 12 });
      const batch = response.feed?.data || [];
      setEvents((current) => nextPage === 1 ? batch : [...current, ...batch.filter((item) => !current.some((old) => old.id === item.id))]);
      if (nextPage === 1) setContext(response.context || {});
      setFollowedProductions((current) => {
        const next = new Set(current);
        batch.forEach((event) => {
          if (["production_follow", "organization_follow"].includes(event.feed_reason) && event.production?.id) next.add(event.production.id);
        });
        return next;
      });
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

  const followProduction = async (event, production) => {
    event.stopPropagation();
    if (!production?.id) return;
    if (!user) return navigate("/login", { state: { from: "/feed" } });
    if (followedProductions.has(production.id)) return;
    setFollowBusy(production.id);
    setError("");
    try {
      await cutinappService.follow("production", production.id);
      setFollowedProductions((current) => new Set([...current, production.id]));
    } catch (err) {
      setError(err?.message || "Não foi possível seguir esta produção agora.");
    } finally {
      setFollowBusy(null);
    }
  };

  return <div className="cut-app-page"><NavlogComponent />
    <Container className="cut-page-container py-4 py-lg-5">
      <div className="cut-page-heading"><div><span className="cut-eyebrow">Timeline social</span><h1>Feed Cutinapp</h1><p>Publique, converse e descubra o que está rolando. Abaixo, a Cutinapp também reúne os eventos mais recentes e experiências que fazem sentido para você.</p>{context.preferred_city && <span className="cut-feed-context"><i className="fa-solid fa-location-dot" /> Sua preferência: {context.preferred_city}{context.preferred_uf ? ` - ${context.preferred_uf}` : ""}</span>}</div><div className="cut-card-actions"><Button onClick={() => navigate("/event")}>Explorar eventos</Button></div></div>
      {error && <Alert variant="danger" dismissible onClose={() => setError("")}>{error}</Alert>}

      <GlobalFeed />

      {loading ? <Row className="g-4" aria-busy="true">{Array.from({ length: 6 }).map((_, index) => <Col md={6} xl={4} key={index}><SkeletonCard /></Col>)}</Row> : <section>
        <div className="cut-section-heading"><div><span className="cut-eyebrow">Descoberta</span><h2>Eventos mais recentes</h2></div><Button variant="ghost" onClick={() => navigate("/event")}>Ver descoberta</Button></div>
        {events.length === 0 ? <Card className="cut-empty-state"><Card.Body><div className="cut-empty-icon"><i className="fa-solid fa-bolt" /></div><h2>Os eventos estão começando</h2><p>Assim que novos eventos públicos forem criados e publicados, eles aparecerão aqui. Enquanto isso, o feed social acima já está disponível para a comunidade.</p><div className="cut-card-actions justify-content-center"><Button onClick={() => navigate("/event")}>Descobrir eventos</Button><Button variant="outline-light" onClick={() => navigate("/artists")}>Descobrir artistas</Button></div></Card.Body></Card> : <Row className="g-4">{events.map((event) => {
          const production = event.production;
          const isFollowing = production?.id && followedProductions.has(production.id);
          return <Col md={6} xl={4} key={event.id}><Card className="cut-feed-card h-100" onClick={() => navigate(`/event/${event.slug}`)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(`/event/${event.slug}`); } }} role="link" tabIndex={0}><div className="cut-event-card__media">{event.image ? <img src={imageUrl(event.image)} alt={event.title} loading="lazy" /> : <div className="cut-event-card__placeholder"><i className="fa-regular fa-calendar" /></div>}<Badge className="cut-event-card__category">{reasonLabel[event.feed_reason] || reasonLabel.discovery}</Badge></div><Card.Body className="p-4"><div className="cut-feed-source"><span>{production?.name || "Cutinapp"}</span><small>{event.city || ""}</small></div><h2>{event.title}</h2><p><i className="fa-regular fa-calendar me-2" />{fmt(event.start_date)}</p>{event.artists?.length > 0 && <div className="cut-lineup-preview">{event.artists.slice(0, 4).map((artist) => <span key={artist.id}>{artist.stage_name}</span>)}</div>}{production?.id && <div className="cut-card-actions mt-3"><Button size="sm" variant={isFollowing ? "outline-light" : "primary"} disabled={isFollowing || followBusy === production.id} onClick={(clickEvent) => followProduction(clickEvent, production)}>{followBusy === production.id ? "Seguindo..." : isFollowing ? "Produção seguida" : "Seguir produção"}</Button></div>}</Card.Body></Card></Col>;
        })}</Row>}
        {page < lastPage && <div className="cut-load-more"><Button variant="outline-light" disabled={moreLoading} onClick={() => load(page + 1)}>{moreLoading ? "Carregando..." : "Carregar mais eventos"}</Button></div>}
      </section>}
    </Container>
  </div>;
}
