import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import NavlogComponent from "../components/NavlogComponent";
import SkeletonCard from "../components/SkeletonCard";
import cutinappService from "../services/CutinappService";
import { storageUrl } from "../config";

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
  const [publishEvents, setPublishEvents] = useState([]);
  const [publishEventsLoading, setPublishEventsLoading] = useState(false);
  const [publishEventsLoaded, setPublishEventsLoaded] = useState(false);
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
  const [postEventId, setPostEventId] = useState("");
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

  const loadPublishEvents = useCallback(async () => {
    if (publishEventsLoaded || publishEventsLoading) return;
    setPublishEventsLoading(true);
    try {
      const response = await cutinappService.publicEvents({ sort: "newest", per_page: 50 });
      setPublishEvents(Array.isArray(response.events?.data) ? response.events.data : []);
    } catch {
      // Linking an event is optional. A discovery failure must never block a
      // standalone publication in the social timeline.
      setPublishEvents([]);
    } finally {
      setPublishEventsLoading(false);
      setPublishEventsLoaded(true);
    }
  }, [publishEventsLoaded, publishEventsLoading]);

  useEffect(() => { load(1); }, [load]);

  const composerEvents = useMemo(() => {
    const seen = new Set();
    return [...publishEvents, ...events].filter((event) => {
      const id = String(event?.id || "");
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [publishEvents, events]);

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
      await cutinappService.createFeedPost({
        body,
        event_id: postEventId ? Number(postEventId) : null,
      });
      setPostBody("");
      setPostEventId("");
      setSuccess("Publicação enviada para a timeline.");
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

  return <div className="cut-app-page"><NavlogComponent />
    <Container className="cut-page-container py-4 py-lg-5">
      <div className="cut-page-heading"><div><span className="cut-eyebrow">Timeline</span><h1>Feed Cutinapp</h1><p>Publique, acompanhe a comunidade e descubra os eventos, produções e artistas que fazem sentido para você.</p>{context.preferred_city && <span className="cut-feed-context"><i className="fa-solid fa-location-dot" /> Sua preferência: {context.preferred_city}{context.preferred_uf ? ` - ${context.preferred_uf}` : ""}</span>}</div><div className="cut-card-actions"><Button onClick={() => navigate("/event")}>Explorar eventos</Button></div></div>
      {error && <Alert variant="danger" dismissible onClose={() => setError("")}>{error}</Alert>}
      {success && <Alert variant="success" dismissible onClose={() => setSuccess("")}>{success}</Alert>}

      {!loading && <Card className="cut-feed-card mb-4">
        <Card.Body className="p-4">
          <div className="cut-section-heading mb-3"><div><span className="cut-eyebrow">Comunidade</span><h2>Compartilhe com a timeline</h2></div></div>
          <Form onSubmit={publishPost}>
            <Form.Group className="mb-3" controlId="timeline-post">
              <Form.Label>O que você quer compartilhar?</Form.Label>
              <Form.Control as="textarea" rows={3} maxLength={3000} value={postBody} onChange={(event) => setPostBody(event.target.value)} placeholder="Compartilhe uma novidade, expectativa, opinião ou combine algo com a galera..." disabled={publishing} />
              <Form.Text>{postBody.length}/3000</Form.Text>
            </Form.Group>
            <Form.Group className="mb-3" controlId="timeline-event">
              <Form.Label>Vincular a um evento <span className="fw-normal opacity-75">(opcional)</span></Form.Label>
              <Form.Select value={postEventId} onChange={(event) => setPostEventId(event.target.value)} onFocus={loadPublishEvents} onPointerDown={loadPublishEvents} disabled={publishing}>
                <option value="">Publicação geral — sem evento</option>
                {publishEventsLoading && composerEvents.length === 0 && <option value="" disabled>Carregando eventos publicados...</option>}
                {!publishEventsLoading && publishEventsLoaded && composerEvents.length === 0 && <option value="" disabled>Nenhum evento público disponível para vincular</option>}
                {composerEvents.map((event) => <option value={event.id} key={event.id}>{event.title}</option>)}
              </Form.Select>
              <Form.Text>Você pode publicar normalmente sem escolher nenhum evento. Use este campo apenas quando o post for sobre um evento específico.</Form.Text>
            </Form.Group>
            <div className="cut-card-actions justify-content-end">
              <Button type="submit" disabled={publishing || postBody.trim().length < 2}>{publishing ? "Publicando..." : "Publicar na timeline"}</Button>
            </div>
          </Form>
        </Card.Body>
      </Card>}

      {loading ? <Row className="g-4" aria-busy="true">{Array.from({ length: 6 }).map((_, index) => <Col md={6} xl={4} key={index}><SkeletonCard /></Col>)}</Row> : <>
        {communityActivity.length > 0 && <section className="mb-5">
          <div className="cut-section-heading"><div><span className="cut-eyebrow">Comunidade</span><h2>Publicações recentes</h2></div></div>
          <Row className="g-4">{communityActivity.map((post) => <Col lg={6} key={`${post.source_type || "event_post"}-${post.id}`}>
            <Card className="cut-feed-card h-100">
              <Card.Body className="p-4">
                <div className="d-flex align-items-center gap-3 mb-3">
                  {post.avatar ? <img src={imageUrl(post.avatar)} alt="" width="44" height="44" className="rounded-circle object-fit-cover" /> : <div className="cut-empty-icon" style={{ width: 44, height: 44, margin: 0 }}><i className="fa-regular fa-user" /></div>}
                  <div><strong>{authorName(post)}</strong><div><small>{fmt(post.created_at)}</small></div></div>
                </div>
                <p className="mb-3" style={{ whiteSpace: "pre-wrap" }}>{post.body}</p>
                {post.event_slug ? <Button variant="outline-light" size="sm" onClick={() => navigate(`/event/${post.event_slug}#comunidade`)}>{post.event_title || "Ver evento"}</Button> : <Badge bg="secondary">Publicação geral</Badge>}
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
