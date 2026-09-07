import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Modal, Row } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import NavlogComponent from "../components/NavlogComponent";
import SkeletonCard from "../components/SkeletonCard";
import TimelineComposer from "../components/timeline/TimelineComposer";
import TimelineEventCard from "../components/timeline/TimelineEventCard";
import TimelineInsights from "../components/timeline/TimelineInsights";
import TimelinePostCard from "../components/timeline/TimelinePostCard";
import TimelineStories from "../components/timeline/TimelineStories";
import cutinappService from "../services/CutinappService";
import { storageUrl } from "../config";
import { subscribeTimelineRealtime } from "../utils/timelineRealtime";
import { createTimelineClientToken } from "../utils/timelineDraft";
import { writeTimelineAttribution } from "../utils/timelineAttribution";
import "./FeedPage.css";

const imageUrl = (value) => !value ? "" : /^https?:/i.test(value) ? value : `${storageUrl}${String(value).replace(/^\//, "")}`;
const sessionKey = (() => {
  try {
    const existing = sessionStorage.getItem("cutinapp_timeline_session");
    if (existing) return existing;
    const next = createTimelineClientToken();
    sessionStorage.setItem("cutinapp_timeline_session", next);
    return next;
  } catch (_) { return createTimelineClientToken(); }
})();

export default function FeedPage() {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const [items, setItems] = useState([]);
  const [stories, setStories] = useState([]);
  const [trending, setTrending] = useState([]);
  const [context, setContext] = useState({});
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [eventOptions, setEventOptions] = useState([]);
  const [eventsLoaded, setEventsLoaded] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [appConfig, setAppConfig] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [boostPost, setBoostPost] = useState(null);
  const [boostBudget, setBoostBudget] = useState("20");
  const [boostCity, setBoostCity] = useState("");
  const [boostDays, setBoostDays] = useState("3");
  const [boosting, setBoosting] = useState(false);
  const sentinelRef = useRef(null);
  const refreshTimer = useRef(null);

  const mergeItems = useCallback((current, incoming) => {
    const seen = new Set();
    return [...current, ...incoming].filter((item) => {
      const key = `${item.kind}:${item.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, []);

  const loadTimeline = useCallback(async ({ reset = false } = {}) => {
    if (!user) { setLoading(false); return; }
    reset ? setLoading(true) : setMoreLoading(true);
    setError("");
    try {
      const response = await cutinappService.timeline({ per_page: 16, ...(reset || !cursor ? {} : { cursor }) });
      const batch = Array.isArray(response.items) ? response.items : [];
      setItems((current) => reset ? batch : mergeItems(current, batch));
      setStories(Array.isArray(response.stories) ? response.stories : []);
      setTrending(Array.isArray(response.trending) ? response.trending : []);
      setContext(response.context || {});
      setCursor(response.next_cursor || null);
      if (reset) {
        const nativeEvents = batch.filter((item) => item.kind === "event").map((item) => item.event).filter(Boolean);
        setEventOptions((current) => mergeEventOptions(current, nativeEvents));
      }
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Não foi possível carregar a timeline.");
    } finally { setLoading(false); setMoreLoading(false); }
  }, [user, cursor, mergeItems]);

  const refreshTimeline = useCallback(async () => {
    if (!user) return;
    setError("");
    try {
      const response = await cutinappService.timeline({ per_page: 16 });
      setItems(Array.isArray(response.items) ? response.items : []);
      setStories(Array.isArray(response.stories) ? response.stories : []);
      setTrending(Array.isArray(response.trending) ? response.trending : []);
      setContext(response.context || {});
      setCursor(response.next_cursor || null);
    } catch (_) { /* keep current feed during silent refresh */ }
  }, [user]);

  useEffect(() => { loadTimeline({ reset: true }); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user) return undefined;
    let active = true;
    cutinappService.publicConfig().then((config) => { if (active) setAppConfig(config); }).catch(() => {});
    const canSeeAnalytics = Boolean(user?.is_producer || user?.is_promoter || user?.profile?.name === "Administrador");
    if (canSeeAnalytics) cutinappService.timelineAnalytics().then((value) => { if (active) setAnalytics(value); }).catch(() => {});
    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    if (!appConfig?.app_id) return undefined;
    return subscribeTimelineRealtime({
      realtime: appConfig.realtime,
      appId: appConfig.app_id,
      onChange: () => {
        if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
        refreshTimer.current = window.setTimeout(refreshTimeline, 450);
      },
    });
  }, [appConfig, refreshTimeline]);

  useEffect(() => {
    if (!sentinelRef.current || !cursor || loading || moreLoading || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadTimeline({ reset: false });
    }, { rootMargin: "700px 0px" });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [cursor, loading, moreLoading, loadTimeline]);

  const loadEventOptions = useCallback(async () => {
    if (eventsLoaded || eventsLoading) return;
    setEventsLoading(true);
    try {
      const response = await cutinappService.publicEvents({ sort: "newest", per_page: 50 });
      setEventOptions((current) => mergeEventOptions(current, Array.isArray(response.events?.data) ? response.events.data : []));
      setEventsLoaded(true);
    } catch (_) { /* feed event options remain usable */ } finally { setEventsLoading(false); }
  }, [eventsLoaded, eventsLoading]);

  const mutatePost = useCallback((postId, updater) => setItems((current) => current.map((item) => item.kind === "post" && Number(item.post?.id) === Number(postId) ? { ...item, post: updater(item.post) } : item)), []);

  const reactPost = async (post) => {
    try {
      if (post.my_reaction) {
        await cutinappService.unreactTimelinePost(post.id);
        mutatePost(post.id, (value) => ({ ...value, my_reaction: null, metrics: { ...value.metrics, likes: Math.max(0, Number(value.metrics?.likes || 0) - 1) } }));
      } else {
        await cutinappService.reactTimelinePost(post.id, "like");
        mutatePost(post.id, (value) => ({ ...value, my_reaction: "like", metrics: { ...value.metrics, likes: Number(value.metrics?.likes || 0) + 1 } }));
      }
    } catch (err) { setError(err?.response?.data?.message || "Não foi possível reagir agora."); }
  };

  const savePost = async (post) => {
    try {
      if (post.is_saved) await cutinappService.unsaveTimelinePost(post.id); else await cutinappService.saveTimelinePost(post.id);
      mutatePost(post.id, (value) => ({ ...value, is_saved: !value.is_saved, metrics: { ...value.metrics, saves: Math.max(0, Number(value.metrics?.saves || 0) + (value.is_saved ? -1 : 1)) } }));
    } catch (err) { setError(err?.response?.data?.message || "Não foi possível salvar agora."); }
  };

  const sharePost = async (post) => {
    try {
      const response = await cutinappService.shareTimelinePost(post.id, { channel: navigator.share ? "other" : "copy", campaign: post.campaign || undefined });
      const url = response.url || window.location.href;
      if (navigator.share) await navigator.share({ title: post.event?.title || "Cutinapp", text: post.body || "Confira na Cutinapp", url });
      else await navigator.clipboard.writeText(url);
      mutatePost(post.id, (value) => ({ ...value, metrics: { ...value.metrics, shares: Number(value.metrics?.shares || 0) + 1 } }));
      setNotice(navigator.share ? "Compartilhamento aberto." : "Link copiado.");
    } catch (err) { if (err?.name !== "AbortError") setError(err?.response?.data?.message || "Não foi possível compartilhar."); }
  };

  const commentPost = async (postId, body) => {
    try {
      await cutinappService.commentTimelinePost(postId, { body, client_token: createTimelineClientToken() });
      mutatePost(postId, (value) => ({ ...value, metrics: { ...value.metrics, comments: Number(value.metrics?.comments || 0) + 1 }, comments_preview: [...(value.comments_preview || []).slice(-1), { id: `local-${Date.now()}`, body, first_name: user?.first_name, last_name: user?.last_name }] }));
    } catch (err) { setError(err?.response?.data?.message || "Não foi possível comentar."); throw err; }
  };

  const votePost = async (postId, optionId) => {
    try {
      const response = await cutinappService.voteTimelinePoll(postId, optionId);
      mutatePost(postId, (value) => ({ ...value, poll: response.poll }));
    } catch (err) { setError(err?.response?.data?.message || "Não foi possível votar."); }
  };

  const reportPost = async (post, reason) => {
    try { await cutinappService.reportTimelinePost(post.id, { reason }); setNotice("Denúncia enviada para revisão."); }
    catch (err) { setError(err?.response?.data?.message || "Não foi possível denunciar."); }
  };

  const deletePost = async (post) => {
    if (!window.confirm("Remover esta publicação da timeline?")) return;
    try { await cutinappService.deleteTimelinePost(post.id); setItems((current) => current.filter((item) => !(item.kind === "post" && Number(item.id) === Number(post.id)))); }
    catch (err) { setError(err?.response?.data?.message || "Não foi possível remover a publicação."); }
  };

  const openEventFromPost = async (post) => {
    if (!post.event?.slug) return;
    cutinappService.trackTimelinePost(post.id, "event_click", sessionKey).catch(() => {});
    navigate(`/event/${post.event.slug}`);
  };

  const buyFromPost = async (post) => {
    if (!post.event?.slug) return;
    writeTimelineAttribution({ eventId: post.event.id, postId: post.id, source: "timeline", campaign: post.campaign, promoterId: post.promoter_id });
    cutinappService.trackTimelinePost(post.id, "ticket_click", sessionKey).catch(() => {});
    navigate(`/event/${post.event.slug}#ingressos`);
  };

  const markInterested = async (event) => {
    try { await cutinappService.engagement(event.id, { is_interested: true }); setItems((current) => current.map((item) => item.kind === "event" && Number(item.id) === Number(event.id) ? { ...item, event: { ...item.event, feed_reason: "interest", engagement_count: Number(item.event.engagement_count || 0) + 1 } } : item)); }
    catch (err) { setError(err?.response?.data?.message || "Não foi possível marcar interesse."); }
  };

  const trackImpression = useCallback((postId, key) => { cutinappService.trackTimelinePost(postId, "impression", key).catch(() => {}); }, []);

  const requestBoost = async (event) => {
    event.preventDefault();
    if (!boostPost) return;
    const budgetCents = Math.round(Number(String(boostBudget).replace(",", ".")) * 100);
    if (!Number.isFinite(budgetCents) || budgetCents < 500) { setError("O orçamento mínimo para impulsionamento é R$ 5,00."); return; }
    const days = Math.max(1, Math.min(30, Number(boostDays) || 3));
    setBoosting(true);
    try {
      await cutinappService.requestTimelineBoost(boostPost.id, { budget_cents: budgetCents, target_city: boostCity.trim() || undefined, starts_at: new Date().toISOString(), ends_at: new Date(Date.now() + days * 86400000).toISOString() });
      setNotice("Impulsionamento criado. Ele ficará pendente até a etapa de cobrança/ativação."); setBoostPost(null);
    } catch (err) { setError(err?.response?.data?.message || "Não foi possível criar o impulsionamento."); }
    finally { setBoosting(false); }
  };

  const composerEvents = useMemo(() => eventOptions.filter((event, index, array) => event?.id && array.findIndex((candidate) => Number(candidate.id) === Number(event.id)) === index), [eventOptions]);

  if (!user) return <div className="cut-app-page"><NavlogComponent /><Container className="cut-page-container py-5"><Card className="cut-empty-state"><Card.Body><div className="cut-empty-icon"><i className="fa-regular fa-user" /></div><h1>Entre para ver sua timeline</h1><p>A timeline é personalizada com eventos, artistas, produções e publicações da comunidade.</p><Button onClick={() => navigate("/login", { state: { from: "/feed" } })}>Entrar</Button></Card.Body></Card></Container></div>;

  return <div className="cut-app-page"><NavlogComponent />
    <Container className="cut-page-container cut-timeline-page py-4 py-lg-5">
      <div className="cut-page-heading cut-timeline-heading"><div><span className="cut-eyebrow">Cutinapp Social</span><h1>Sua timeline</h1><p>Descubra o que está acontecendo, converse com a comunidade e transforme interesse em presença nos eventos.</p>{context.preferred_city && <span className="cut-feed-context"><i className="fa-solid fa-location-dot" /> {context.preferred_city}{context.preferred_uf ? ` - ${context.preferred_uf}` : ""}</span>}</div><div className="cut-card-actions"><Button variant="outline-light" onClick={() => navigate("/event")}>Explorar</Button><Button onClick={() => document.getElementById("timeline-composer")?.scrollIntoView({ behavior: "smooth" })}><i className="fa-solid fa-plus me-2" />Publicar</Button></div></div>
      {error && <Alert variant="danger" dismissible onClose={() => setError("")}>{error}</Alert>}
      {notice && <Alert variant="success" dismissible onClose={() => setNotice("")}>{notice}</Alert>}

      <TimelineStories stories={stories} />
      <div id="timeline-composer"><TimelineComposer eventOptions={composerEvents} onNeedEvents={loadEventOptions} onPublished={async () => { await refreshTimeline(); if (user?.is_producer || user?.is_promoter) cutinappService.timelineAnalytics().then(setAnalytics).catch(() => {}); }} isPromoter={Boolean(user?.is_promoter)} /></div>
      <TimelineInsights analytics={analytics} />

      <Row className="g-4 align-items-start">
        <Col lg={8} xl={8}>
          {loading ? <div className="cut-timeline-stream">{Array.from({ length: 5 }).map((_, index) => <SkeletonCard key={index} />)}</div> : items.length === 0 ? <Card className="cut-empty-state"><Card.Body><div className="cut-empty-icon"><i className="fa-solid fa-bolt" /></div><h2>A timeline está pronta para começar</h2><p>Publique algo ou explore os eventos disponíveis.</p></Card.Body></Card> : <div className="cut-timeline-stream">{items.map((item) => item.kind === "post" ? <TimelinePostCard key={`post-${item.id}`} item={item} currentUserId={user?.id} sessionKey={sessionKey} onReact={reactPost} onSave={savePost} onShare={sharePost} onComment={commentPost} onVote={votePost} onReport={reportPost} onDelete={deletePost} onOpenEvent={openEventFromPost} onTicket={buyFromPost} onBoost={(post) => { setBoostPost(post); setBoostCity(post.event?.city || context.preferred_city || ""); }} onImpression={trackImpression} /> : <TimelineEventCard key={`event-${item.id}`} item={item} onOpen={(event) => navigate(`/event/${event.slug}`)} onTicket={(event) => navigate(`/event/${event.slug}#ingressos`)} onInterested={markInterested} />)}</div>}
          <div ref={sentinelRef} className="cut-timeline-sentinel" aria-hidden="true">{moreLoading && <span><i className="fa-solid fa-circle-notch fa-spin" /> Carregando mais...</span>}</div>
          {!cursor && !loading && items.length > 0 && <div className="cut-timeline-end"><span>Você chegou ao fim por enquanto.</span></div>}
        </Col>

        <Col lg={4} xl={4} className="cut-timeline-sidebar">
          <Card className="cut-feed-card cut-timeline-trending"><Card.Body><div className="cut-section-heading"><div><span className="cut-eyebrow">Agora</span><h2>Bombando</h2></div></div>{trending.length === 0 ? <p className="text-secondary mb-0">Os eventos em alta aparecerão aqui.</p> : <div className="cut-timeline-trending__list">{trending.map((event, index) => <button type="button" key={event.id} onClick={() => navigate(`/event/${event.slug}`)}><span className="cut-timeline-trending__rank">{index + 1}</span>{event.image ? <img src={imageUrl(event.image)} alt="" loading="lazy" /> : <span className="cut-timeline-trending__placeholder"><i className="fa-regular fa-calendar" /></span>}<span><strong>{event.title}</strong><small>{event.city || ""} · {event.passes_count || 0} ingresso(s)</small></span></button>)}</div>}</Card.Body></Card>
          <Card className="cut-feed-card cut-timeline-discovery-card"><Card.Body><i className="fa-solid fa-wand-magic-sparkles" /><h3>Seu feed aprende com você</h3><p>Seguir produções e artistas, salvar eventos e marcar interesse melhora a relevância sem esconder a descoberta.</p><Button variant="outline-light" onClick={() => navigate("/artists")}>Descobrir artistas</Button></Card.Body></Card>
        </Col>
      </Row>
    </Container>

    <Modal show={Boolean(boostPost)} onHide={() => !boosting && setBoostPost(null)} centered>
      <Form onSubmit={requestBoost}><Modal.Header closeButton><Modal.Title>Impulsionar publicação</Modal.Title></Modal.Header><Modal.Body><p>Defina o orçamento e a área desejada. A campanha só será ativada depois da cobrança ser confirmada.</p><Form.Group className="mb-3"><Form.Label>Orçamento (R$)</Form.Label><Form.Control type="number" min="5" step="1" value={boostBudget} onChange={(event) => setBoostBudget(event.target.value)} disabled={boosting} /></Form.Group><Form.Group className="mb-3"><Form.Label>Cidade alvo</Form.Label><Form.Control value={boostCity} maxLength={120} onChange={(event) => setBoostCity(event.target.value)} placeholder="Ex.: Goiânia" disabled={boosting} /></Form.Group><Form.Group><Form.Label>Duração (dias)</Form.Label><Form.Control type="number" min="1" max="30" value={boostDays} onChange={(event) => setBoostDays(event.target.value)} disabled={boosting} /></Form.Group></Modal.Body><Modal.Footer><Button variant="outline-secondary" onClick={() => setBoostPost(null)} disabled={boosting}>Cancelar</Button><Button type="submit" disabled={boosting}>{boosting ? "Criando..." : "Criar campanha"}</Button></Modal.Footer></Form>
    </Modal>
  </div>;
}

function mergeEventOptions(current, incoming) {
  const next = [...(Array.isArray(current) ? current : [])];
  for (const event of Array.isArray(incoming) ? incoming : []) if (event?.id && !next.some((candidate) => Number(candidate.id) === Number(event.id))) next.push(event);
  return next;
}
