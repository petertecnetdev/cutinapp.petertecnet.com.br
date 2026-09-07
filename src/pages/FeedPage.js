import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, ProgressBar, Row } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import NavlogComponent from "../components/NavlogComponent";
import SkeletonCard from "../components/SkeletonCard";
import cutinappService from "../services/CutinappService";
import socialFeedService from "../services/SocialFeedService";
import { storageUrl } from "../config";
import "./FeedPage.css";

const fmt = (value) => value ? new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(value)) : "";
const imageUrl = (value) => !value ? "" : /^https?:/.test(value) ? value : `${storageUrl}${String(value).replace(/^\//, "")}`;
const authorName = (post) => [post?.first_name, post?.last_name].filter(Boolean).join(" ") || "Participante Cutinapp";
const reasonLabel = { ticket: "Você tem ingresso", interest: "Você acompanha", organization_follow: "Produção seguida", production_follow: "Produção seguida", artist_follow: "Artista seguido", preferred_city: "Na sua cidade", discovery: "Para descobrir" };
const POST_TYPES = [
  { type: "text", icon: "fa-pen", label: "Texto" },
  { type: "image", icon: "fa-image", label: "Foto" },
  { type: "video", icon: "fa-video", label: "Vídeo" },
  { type: "poll", icon: "fa-square-poll-vertical", label: "Enquete" },
];

export default function FeedPage() {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const mediaInputRef = useRef(null);
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
  const [postType, setPostType] = useState("text");
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaPreview, setMediaPreview] = useState("");
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [publishing, setPublishing] = useState(false);
  const [interactionBusy, setInteractionBusy] = useState(null);

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
        batch.forEach((event) => { if (["production_follow", "organization_follow"].includes(event.feed_reason) && event.production?.id) next.add(event.production.id); });
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
      setPublishEvents([]);
    } finally {
      setPublishEventsLoading(false);
      setPublishEventsLoaded(true);
    }
  }, [publishEventsLoaded, publishEventsLoading]);

  useEffect(() => { load(1); }, [load]);
  useEffect(() => () => { if (mediaPreview) URL.revokeObjectURL(mediaPreview); }, [mediaPreview]);

  const composerEvents = useMemo(() => {
    const seen = new Set();
    return [...publishEvents, ...events].filter((event) => {
      const id = String(event?.id || "");
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [publishEvents, events]);

  useEffect(() => {
    setPostEventId((current) => current && composerEvents.some((event) => String(event.id) === String(current)) ? current : (composerEvents[0]?.id ? String(composerEvents[0].id) : ""));
  }, [composerEvents]);

  const resetComposer = () => {
    setPostBody(""); setPostType("text"); setMediaFile(null); setPollQuestion(""); setPollOptions(["", ""]);
    setMediaPreview((current) => { if (current) URL.revokeObjectURL(current); return ""; });
    if (mediaInputRef.current) mediaInputRef.current.value = "";
  };

  const chooseType = (type) => {
    setPostType(type); setError("");
    if (!["image", "video"].includes(type)) {
      setMediaFile(null);
      setMediaPreview((current) => { if (current) URL.revokeObjectURL(current); return ""; });
    }
    if (type !== "poll") { setPollQuestion(""); setPollOptions(["", ""]); }
  };

  const chooseMedia = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const expected = postType === "video" ? "video/" : "image/";
    if (!file.type.startsWith(expected)) { setError(`Escolha ${postType === "video" ? "um vídeo" : "uma imagem"} válido.`); event.target.value = ""; return; }
    if (file.size > 50 * 1024 * 1024) { setError("A mídia pode ter no máximo 50 MB."); event.target.value = ""; return; }
    setMediaFile(file);
    setMediaPreview((current) => { if (current) URL.revokeObjectURL(current); return URL.createObjectURL(file); });
  };

  const publishPost = async (event) => {
    event.preventDefault(); setError(""); setSuccess("");
    if (!user) { navigate("/login", { state: { from: "/feed" } }); return; }
    if (!postEventId) { setError("Escolha o evento relacionado à publicação."); return; }
    const body = postBody.trim();
    const cleanOptions = pollOptions.map((item) => item.trim()).filter(Boolean);
    if (postType === "text" && body.length < 2) { setError("Escreva pelo menos 2 caracteres para publicar."); return; }
    if (["image", "video"].includes(postType) && !mediaFile) { setError(`Adicione ${postType === "video" ? "um vídeo" : "uma foto"} para publicar.`); return; }
    if (postType === "poll" && (pollQuestion.trim().length < 2 || cleanOptions.length < 2)) { setError("Informe a pergunta e pelo menos duas opções da enquete."); return; }

    setPublishing(true);
    try {
      let payload;
      if (["image", "video"].includes(postType)) {
        payload = new FormData(); payload.append("post_type", postType); payload.append("media", mediaFile); if (body) payload.append("body", body);
      } else {
        payload = { post_type: postType, body };
        if (postType === "poll") payload.poll = { question: pollQuestion.trim(), options: cleanOptions };
      }
      await socialFeedService.createEventPost(postEventId, payload);
      resetComposer(); setSuccess("Publicado na timeline."); await load(1);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Não foi possível publicar agora.");
    } finally { setPublishing(false); }
  };

  const toggleLike = async (post) => {
    if (!user) return navigate("/login", { state: { from: "/feed" } });
    if (interactionBusy === `like-${post.id}`) return;
    setInteractionBusy(`like-${post.id}`);
    const wasLiked = Boolean(post.is_liked);
    setCommunityActivity((items) => items.map((item) => item.id === post.id ? { ...item, is_liked: !wasLiked, likes_count: Math.max(0, Number(item.likes_count || 0) + (wasLiked ? -1 : 1)) } : item));
    try { wasLiked ? await socialFeedService.unlikePost(post.id) : await socialFeedService.likePost(post.id); }
    catch (err) { setCommunityActivity((items) => items.map((item) => item.id === post.id ? post : item)); setError(err?.response?.data?.message || "Não foi possível atualizar a curtida."); }
    finally { setInteractionBusy(null); }
  };

  const votePoll = async (post, optionId) => {
    if (!user) return navigate("/login", { state: { from: "/feed" } });
    if (interactionBusy === `poll-${post.id}`) return;
    setInteractionBusy(`poll-${post.id}`);
    try {
      const response = await socialFeedService.votePoll(post.id, optionId);
      setCommunityActivity((items) => items.map((item) => {
        if (item.id !== post.id || !item.poll) return item;
        const summary = response.poll || {};
        const votesByOption = new Map((summary.votes || []).map((vote) => [Number(vote.option_id), Number(vote.votes_count || 0)]));
        const total = Number(summary.total_votes || 0);
        return { ...item, poll: { ...item.poll, total_votes: total, my_option_id: Number(summary.my_option_id || optionId), options: item.poll.options.map((option) => { const count = votesByOption.get(Number(option.id)) || 0; return { ...option, votes_count: count, percentage: total ? Math.round((count / total) * 1000) / 10 : 0 }; }) } };
      }));
    } catch (err) { setError(err?.response?.data?.message || "Não foi possível registrar seu voto."); }
    finally { setInteractionBusy(null); }
  };

  const sharePost = async (post) => {
    const url = `${window.location.origin}/event/${post.event_slug}#comunidade`;
    const data = { title: post.event_title || "Cutinapp", text: post.body || post.poll?.question || "Veja esta publicação na Cutinapp", url };
    try {
      if (navigator.share) await navigator.share(data);
      else { await navigator.clipboard.writeText(url); setSuccess("Link da publicação copiado."); }
    } catch (err) { if (err?.name !== "AbortError") setError("Não foi possível compartilhar agora."); }
  };

  const followProduction = async (event, production) => {
    event.stopPropagation(); if (!production?.id) return;
    if (!user) return navigate("/login", { state: { from: "/feed" } });
    if (followedProductions.has(production.id)) return;
    setFollowBusy(production.id); setError("");
    try { await cutinappService.follow("production", production.id); setFollowedProductions((current) => new Set([...current, production.id])); }
    catch (err) { setError(err?.response?.data?.message || err?.message || "Não foi possível seguir esta produção agora."); }
    finally { setFollowBusy(null); }
  };

  const renderRichContent = (post) => <>
    {post.body && <p className="cut-social-post__body">{post.body}</p>}
    {post.media?.url && post.post_type === "image" && <img className="cut-social-post__media" src={imageUrl(post.media.url)} alt="Publicação" loading="lazy" />}
    {post.media?.url && post.post_type === "video" && <video className="cut-social-post__media" src={imageUrl(post.media.url)} controls playsInline preload="metadata" />}
    {post.poll && <div className="cut-poll">
      <strong className="cut-poll__question">{post.poll.question}</strong>
      <div className="cut-poll__options">{(post.poll.options || []).map((option) => {
        const selected = Number(post.poll.my_option_id) === Number(option.id);
        return <button type="button" key={option.id} className={`cut-poll__option${selected ? " is-selected" : ""}`} disabled={interactionBusy === `poll-${post.id}`} onClick={() => votePoll(post, option.id)}>
          <span className="cut-poll__option-head"><span>{option.label}</span><strong>{Number(option.percentage || 0)}%</strong></span>
          <ProgressBar now={Number(option.percentage || 0)} aria-label={`${option.label}: ${Number(option.percentage || 0)}%`} />
          <small>{Number(option.votes_count || 0)} voto(s){selected ? " · seu voto" : ""}</small>
        </button>;
      })}</div>
      <small className="cut-poll__total"><i className="fa-solid fa-chart-simple" /> {Number(post.poll.total_votes || 0)} voto(s)</small>
    </div>}
  </>;

  return <div className="cut-app-page"><NavlogComponent />
    <Container className="cut-page-container py-4 py-lg-5">
      <div className="cut-page-heading"><div><span className="cut-eyebrow">Timeline</span><h1>Feed Cutinapp</h1><p>Publique momentos, vídeos, opiniões e enquetes. Encontre sua galera antes, durante e depois dos eventos.</p>{context.preferred_city && <span className="cut-feed-context"><i className="fa-solid fa-location-dot" /> Sua preferência: {context.preferred_city}{context.preferred_uf ? ` - ${context.preferred_uf}` : ""}</span>}</div><div className="cut-card-actions"><Button onClick={() => navigate("/event")}>Explorar eventos</Button></div></div>
      {error && <Alert variant="danger" dismissible onClose={() => setError("")}>{error}</Alert>}
      {success && <Alert variant="success" dismissible onClose={() => setSuccess("")}>{success}</Alert>}

      {!loading && <Card className="cut-feed-card cut-social-composer mb-4"><Card.Body className="p-3 p-md-4">
        <div className="cut-social-composer__head"><div className="cut-social-composer__avatar">{user?.avatar ? <img src={imageUrl(user.avatar)} alt="" /> : <i className="fa-regular fa-user" />}</div><div><span className="cut-eyebrow">Criar publicação</span><h2>O que está rolando?</h2></div></div>
        <div className="cut-social-composer__types">{POST_TYPES.map((item) => <Button key={item.type} type="button" variant={postType === item.type ? "primary" : "outline-light"} onClick={() => chooseType(item.type)} disabled={publishing}><i className={`fa-solid ${item.icon}`} /> {item.label}</Button>)}</div>
        <Form onSubmit={publishPost}>
          <Form.Group className="mb-3" controlId="timeline-event"><Form.Label>Relacionar ao evento</Form.Label><Form.Select value={postEventId} onChange={(e) => setPostEventId(e.target.value)} onFocus={loadPublishEvents} onPointerDown={loadPublishEvents} disabled={publishing || composerEvents.length === 0}>{publishEventsLoading && composerEvents.length === 0 && <option value="">Carregando eventos...</option>}{!publishEventsLoading && composerEvents.length === 0 && <option value="">Nenhum evento público disponível</option>}{composerEvents.map((event) => <option value={event.id} key={event.id}>{event.title}</option>)}</Form.Select></Form.Group>
          {postType === "poll" ? <div className="cut-poll-builder"><Form.Group className="mb-3"><Form.Label>Pergunta</Form.Label><Form.Control value={pollQuestion} maxLength={280} onChange={(e) => setPollQuestion(e.target.value)} placeholder="Ex.: Quem vai nesse evento?" disabled={publishing} /></Form.Group>{pollOptions.map((option, index) => <div className="cut-poll-builder__option" key={index}><Form.Control value={option} maxLength={120} onChange={(e) => setPollOptions((current) => current.map((value, itemIndex) => itemIndex === index ? e.target.value : value))} placeholder={`Opção ${index + 1}`} disabled={publishing} />{pollOptions.length > 2 && <Button type="button" variant="outline-light" aria-label="Remover opção" onClick={() => setPollOptions((current) => current.filter((_, itemIndex) => itemIndex !== index))}><i className="fa-solid fa-xmark" /></Button>}</div>)}{pollOptions.length < 8 && <Button type="button" variant="outline-light" size="sm" onClick={() => setPollOptions((current) => [...current, ""])}><i className="fa-solid fa-plus" /> Adicionar opção</Button>}</div> : <Form.Group className="mb-3" controlId="timeline-post"><Form.Control as="textarea" rows={3} maxLength={3000} value={postBody} onChange={(e) => setPostBody(e.target.value)} placeholder={postType === "text" ? "Compartilhe algo com a galera..." : "Adicione uma legenda (opcional)..."} disabled={publishing} /><Form.Text>{postBody.length}/3000</Form.Text></Form.Group>}
          {["image", "video"].includes(postType) && <div className="cut-media-picker"><Form.Control ref={mediaInputRef} type="file" accept={postType === "video" ? "video/mp4,video/webm,video/quicktime" : "image/jpeg,image/png,image/webp,image/gif"} onChange={chooseMedia} disabled={publishing} />{mediaPreview && (postType === "image" ? <img src={mediaPreview} alt="Prévia" /> : <video src={mediaPreview} controls playsInline />)}<small>Até 50 MB. Formatos seguros e compatíveis com navegadores modernos.</small></div>}
          <div className="cut-card-actions justify-content-end mt-3"><Button type="submit" disabled={publishing || !postEventId}>{publishing ? <><i className="fa-solid fa-circle-notch fa-spin" /> Publicando...</> : <><i className="fa-solid fa-paper-plane" /> Publicar</>}</Button></div>
        </Form>
      </Card.Body></Card>}

      {loading ? <Row className="g-4" aria-busy="true">{Array.from({ length: 6 }).map((_, index) => <Col md={6} xl={4} key={index}><SkeletonCard /></Col>)}</Row> : <>
        {communityActivity.length > 0 && <section className="mb-5"><div className="cut-section-heading"><div><span className="cut-eyebrow">Comunidade</span><h2>O que a galera está publicando</h2></div></div><div className="cut-social-stream">{communityActivity.map((post) => <Card className="cut-feed-card cut-social-post" key={post.id}><Card.Body className="p-3 p-md-4"><div className="cut-social-post__header"><div className="cut-social-post__author">{post.avatar ? <img src={imageUrl(post.avatar)} alt="" /> : <div className="cut-social-post__avatar"><i className="fa-regular fa-user" /></div>}<div><strong>{authorName(post)}</strong><small>{fmt(post.created_at)} · {post.event_title || "Cutinapp"}</small></div></div><Badge bg="dark">{post.post_type === "poll" ? "Enquete" : post.post_type === "video" ? "Vídeo" : post.post_type === "image" ? "Foto" : "Post"}</Badge></div>{renderRichContent(post)}<div className="cut-social-post__stats"><span>{Number(post.likes_count || 0)} curtida(s)</span><span>{Number(post.comments_count || 0)} comentário(s)</span></div><div className="cut-social-post__actions"><Button variant="outline-light" className={post.is_liked ? "is-active" : ""} disabled={interactionBusy === `like-${post.id}`} onClick={() => toggleLike(post)}><i className={`${post.is_liked ? "fa-solid" : "fa-regular"} fa-heart`} /> Curtir</Button><Button variant="outline-light" onClick={() => navigate(`/event/${post.event_slug}#comunidade`)}><i className="fa-regular fa-comment" /> Comentar</Button><Button variant="outline-light" onClick={() => sharePost(post)}><i className="fa-solid fa-share-nodes" /> Compartilhar</Button></div></Card.Body></Card>)}</div></section>}

        <section><div className="cut-section-heading"><div><span className="cut-eyebrow">Novidades</span><h2>Eventos mais recentes</h2></div><Button variant="ghost" onClick={() => navigate("/event")}>Ver descoberta</Button></div>{events.length === 0 ? <Card className="cut-empty-state"><Card.Body><div className="cut-empty-icon"><i className="fa-solid fa-bolt" /></div><h2>A timeline está começando</h2><p>Assim que novos eventos públicos forem criados e publicados, eles aparecerão aqui.</p><div className="cut-card-actions justify-content-center"><Button onClick={() => navigate("/event")}>Descobrir eventos</Button><Button variant="outline-light" onClick={() => navigate("/artists")}>Descobrir artistas</Button></div></Card.Body></Card> : <Row className="g-4">{events.map((event) => { const production = event.production; const isFollowing = production?.id && followedProductions.has(production.id); return <Col md={6} xl={4} key={event.id}><Card className="cut-feed-card h-100" onClick={() => navigate(`/event/${event.slug}`)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(`/event/${event.slug}`); } }} role="link" tabIndex={0}><div className="cut-event-card__media">{event.image ? <img src={imageUrl(event.image)} alt={event.title} loading="lazy" /> : <div className="cut-event-card__placeholder"><i className="fa-regular fa-calendar" /></div>}<Badge className="cut-event-card__category">{reasonLabel[event.feed_reason] || reasonLabel.discovery}</Badge></div><Card.Body className="p-4"><div className="cut-feed-source"><span>{production?.name || "Cutinapp"}</span><small>{event.city || ""}</small></div><h2>{event.title}</h2><p><i className="fa-regular fa-calendar me-2" />{fmt(event.start_date)}</p>{event.artists?.length > 0 && <div className="cut-lineup-preview">{event.artists.slice(0, 4).map((artist) => <span key={artist.id}>{artist.stage_name}</span>)}</div>}{production?.id && <div className="cut-card-actions mt-3"><Button size="sm" variant={isFollowing ? "outline-light" : "primary"} disabled={isFollowing || followBusy === production.id} onClick={(clickEvent) => followProduction(clickEvent, production)}>{followBusy === production.id ? "Seguindo..." : isFollowing ? "Produção seguida" : "Seguir produção"}</Button></div>}</Card.Body></Card></Col>; })}</Row>}{page < lastPage && <div className="cut-load-more"><Button variant="outline-light" disabled={moreLoading} onClick={() => load(page + 1)}>{moreLoading ? "Carregando..." : "Carregar mais eventos"}</Button></div>}</section>
      </>}
    </Container>
  </div>;
}
