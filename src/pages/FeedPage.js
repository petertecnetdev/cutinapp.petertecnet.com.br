import React, { useCallback, useContext, useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import NavlogComponent from "../components/NavlogComponent";
import SkeletonCard from "../components/SkeletonCard";
import cutinappService from "../services/CutinappService";
import { storageUrl } from "../config";
import "./FeedPage.css";

const fmt = (value) => value ? new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(value)) : "";
const imageUrl = (value) => !value ? "" : /^https?:/.test(value) ? value : `${storageUrl}${String(value).replace(/^\//, "")}`;
const authorName = (post) => [post?.first_name, post?.last_name].filter(Boolean).join(" ") || "Participante Cutinapp";
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
  const [communityActivity, setCommunityActivity] = useState([]);
  const [context, setContext] = useState({});
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [followedProductions, setFollowedProductions] = useState(() => new Set());
  const [followBusy, setFollowBusy] = useState(null);
  const [postBody, setPostBody] = useState("");
  const [publishing, setPublishing] = useState(false);

  const load = useCallback(async (nextPage = 1) => {
    nextPage === 1 ? setLoading(true) : setMoreLoading(true);
    setError("");
    try {
      const response = await cutinappService.feed({ page: nextPage, per_page: 12 });
      const batch = response.feed?.data || [];
      setEvents((current) => nextPage === 1 ? batch : [...current, ...batch.filter((item) => !current.some((old) => old.id === item.id))]);
      if (nextPage === 1) {
        setContext(response.context || {});
        setCommunityActivity(Array.isArray(response.community_activity) ? response.community_activity : []);
      }
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
      setError(err?.response?.data?.message || err?.message || "Não foi possível montar seu feed agora.");
    } finally {
      setLoading(false);
      setMoreLoading(false);
    }
  }, []);

  useEffect(() => { load(1); }, [load]);

  const publishPost = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!user) {
      navigate("/login", { state: { from: "/feed" } });
      return;
    }

    const body = postBody.trim();
    if (body.length < 2) {
      setError("Escreva pelo menos 2 caracteres para publicar.");
      return;
    }

    setPublishing(true);
    try {
      await cutinappService.createFeedPost({ body });
      setPostBody("");
      setSuccess("Publicado na timeline.");
      await load(1);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Não foi possível publicar agora.");
    } finally {
      setPublishing(false);
    }
  };

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
      setError(err?.response?.data?.message || err?.message || "Não foi possível seguir esta produção agora.");
    } finally {
      setFollowBusy(null);
    }
  };

  const composerAvatar = imageUrl(user?.avatar);
  const composerInitial = String(user?.first_name || user?.name || "U").trim().slice(0, 1).toUpperCase() || "U";
  const composerPlaceholder = user?.first_name
    ? `No que você está pensando, ${user.first_name}?`
    : "No que você está pensando?";

  return <div className="cut-app-page"><NavlogComponent />
    <Container className="cut-page-container py-4 py-lg-5">
      <div className="cut-page-heading"><div><span className="cut-eyebrow">Timeline</span><h1>Feed Cutinapp</h1><p>Publique, acompanhe a comunidade e descubra os eventos, produções e artistas que fazem sentido para você.</p>{context.preferred_city && <span className="cut-feed-context"><i className="fa-solid fa-location-dot" /> Sua preferência: {context.preferred_city}{context.preferred_uf ? ` - ${context.preferred_uf}` : ""}</span>}</div><div className="cut-card-actions"><Button onClick={() => navigate("/event")}>Explorar eventos</Button></div></div>
      {error && <Alert variant="danger" dismissible onClose={() => setError("")}>{error}</Alert>}
      {success && <Alert variant="success" dismissible onClose={() => setSuccess("")}>{success}</Alert>}

      {!loading && <Card className="cut-feed-composer mb-4">
        <Card.Body>
          <Form onSubmit={publishPost}>
            <div className="cut-feed-composer__main">
              <div className="cut-feed-composer__avatar" aria-hidden="true">
                {composerAvatar ? <img src={composerAvatar} alt="" /> : <span>{composerInitial}</span>}
              </div>
              <Form.Control
                as="textarea"
                rows={2}
                maxLength={3000}
                value={postBody}
                onChange={(event) => setPostBody(event.target.value)}
                placeholder={composerPlaceholder}
                aria-label="Criar publicação na timeline"
                disabled={publishing}
              />
            </div>
            <div className="cut-feed-composer__footer">
              <span className="cut-feed-composer__visibility"><i className="fa-solid fa-earth-americas" /> Público na Cutinapp</span>
              <div className="cut-feed-composer__actions">
                {postBody.length > 0 && <small>{postBody.length}/3000</small>}
                <Button type="submit" size="sm" disabled={publishing || postBody.trim().length < 2}>{publishing ? "Publicando..." : "Publicar"}</Button>
              </div>
            </div>
          </Form>
        </Card.Body>
      </Card>}

      {loading ? <Row className="g-4" aria-busy="true">{Array.from({ length: 6 }).map((_, index) => <Col md={6} xl={4} key={index}><SkeletonCard /></Col>)}</Row> : <>
        {communityActivity.length > 0 && <section className="mb-5">
          <div className="cut-section-heading"><div><span className="cut-eyebrow">Comunidade</span><h2>Publicações recentes</h2></div></div>
          <Row className="g-4">{communityActivity.map((post) => <Col lg={6} key={post.id}>
            <Card className="cut-feed-card h-100">
              <Card.Body className="p-4">
                <div className="d-flex align-items-center gap-3 mb-3">
                  {post.avatar ? <img src={imageUrl(post.avatar)} alt="" width="44" height="44" className="rounded-circle object-fit-cover" /> : <div className="cut-empty-icon" style={{ width: 44, height: 44, margin: 0 }}><i className="fa-regular fa-user" /></div>}
                  <div><strong>{authorName(post)}</strong><div><small>{fmt(post.created_at)}{!post.event_slug ? " · Público" : ""}</small></div></div>
                </div>
                <p className="mb-3" style={{ whiteSpace: "pre-wrap" }}>{post.body}</p>
                {post.event_slug && <Button variant="outline-light" size="sm" onClick={() => navigate(`/event/${post.event_slug}#comunidade`)}>{post.event_title || "Ver evento"}</Button>}
              </Card.Body>
            </Card>
          </Col>)}</Row>
        </section>}

        <section>
          <div className="cut-section-heading"><div><span className="cut-eyebrow">Novidades</span><h2>Eventos mais recentes</h2></div><Button variant="ghost" onClick={() => navigate("/event")}>Ver descoberta</Button></div>
          {events.length === 0 ? <Card className="cut-empty-state"><Card.Body><div className="cut-empty-icon"><i className="fa-solid fa-bolt" /></div><h2>A timeline está começando</h2><p>Assim que novos eventos públicos forem criados e publicados, eles aparecerão aqui. Você também pode seguir artistas, produções e demonstrar interesse para enriquecer sua experiência.</p><div className="cut-card-actions justify-content-center"><Button onClick={() => navigate("/event")}>Descobrir eventos</Button><Button variant="outline-light" onClick={() => navigate("/artists")}>Descobrir artistas</Button></div></Card.Body></Card> : <Row className="g-4">{events.map((event) => {
            const production = event.production;
            const isFollowing = production?.id && followedProductions.has(production.id);
            return <Col md={6} xl={4} key={event.id}><Card className="cut-feed-card h-100" onClick={() => navigate(`/event/${event.slug}`)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(`/event/${event.slug}`); } }} role="link" tabIndex={0}><div className="cut-event-card__media">{event.image ? <img src={imageUrl(event.image)} alt={event.title} loading="lazy" /> : <div className="cut-event-card__placeholder"><i className="fa-regular fa-calendar" /></div>}<Badge className="cut-event-card__category">{reasonLabel[event.feed_reason] || reasonLabel.discovery}</Badge></div><Card.Body className="p-4"><div className="cut-feed-source"><span>{production?.name || "Cutinapp"}</span><small>{event.city || ""}</small></div><h2>{event.title}</h2><p><i className="fa-regular fa-calendar me-2" />{fmt(event.start_date)}</p>{event.artists?.length > 0 && <div className="cut-lineup-preview">{event.artists.slice(0, 4).map((artist) => <span key={artist.id}>{artist.stage_name}</span>)}</div>}{production?.id && <div className="cut-card-actions mt-3"><Button size="sm" variant={isFollowing ? "outline-light" : "primary"} disabled={isFollowing || followBusy === production.id} onClick={(clickEvent) => followProduction(clickEvent, production)}>{followBusy === production.id ? "Seguindo..." : isFollowing ? "Produção seguida" : "Seguir produção"}</Button></div>}</Card.Body></Card></Col>;
          })}</Row>}
          {page < lastPage && <div className="cut-load-more"><Button variant="outline-light" disabled={moreLoading} onClick={() => load(page + 1)}>{moreLoading ? "Carregando..." : "Carregar mais eventos"}</Button></div>}
        </section>
      </>}
    </Container>
  </div>;
}
