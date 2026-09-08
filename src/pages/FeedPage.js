import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import { Alert, Button, Card, Container, Form } from "react-bootstrap";
import { useLocation, useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import NavlogComponent from "../components/NavlogComponent";
import SkeletonCard from "../components/SkeletonCard";
import cutinappService from "../services/CutinappService";
import { storageUrl } from "../config";
import "./FeedPage.css";

const fmt = (value) => value ? new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(value)) : "";
const imageUrl = (value) => !value ? "" : /^https?:/.test(value) ? value : `${storageUrl}${String(value).replace(/^\//, "")}`;
const authorName = (post) => [post?.first_name, post?.last_name].filter(Boolean).join(" ") || post?.name || "Participante Cutinapp";
const initials = (post) => `${post?.first_name?.[0] || post?.name?.[0] || "U"}${post?.last_name?.[0] || ""}`.toUpperCase();

export default function FeedPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const feedRequestRef = useRef(0);
  const [communityActivity, setCommunityActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [postBody, setPostBody] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [replyBody, setReplyBody] = useState("");
  const [busyPosts, setBusyPosts] = useState(() => new Set());
  const [shareNotice, setShareNotice] = useState("");

  const load = useCallback(async ({ showSkeleton = false } = {}) => {
    const requestId = ++feedRequestRef.current;
    if (showSkeleton) setLoading(true);
    setError("");
    try {
      const response = await cutinappService.feed({ page: 1, per_page: 12 });
      if (requestId !== feedRequestRef.current) return;
      setCommunityActivity(Array.isArray(response.community_activity) ? response.community_activity : []);
    } catch (err) {
      if (requestId !== feedRequestRef.current) return;
      setError(err?.response?.data?.message || err?.message || "Não foi possível montar seu feed agora.");
    } finally {
      if (showSkeleton && requestId === feedRequestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => { load({ showSkeleton: true }); }, [load]);

  const setPostBusy = (postId, busy) => {
    setBusyPosts((current) => {
      const next = new Set(current);
      if (busy) next.add(postId);
      else next.delete(postId);
      return next;
    });
  };

  const requireLogin = () => {
    if (user) return true;
    navigate("/login", { state: { from: `${location.pathname}${location.search}` } });
    return false;
  };

  const publishPost = async (event) => {
    event.preventDefault();
    if (!requireLogin()) return;
    const body = postBody.trim();
    if (body.length < 2) return setError("Escreva pelo menos 2 caracteres para publicar.");
    setPublishing(true); setError(""); setSuccess("");
    try {
      await cutinappService.createFeedPost({ body });
      setPostBody("");
      setSuccess("Sua publicação está no ar. A comunidade já pode curtir, comentar e compartilhar.");
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Não foi possível publicar agora.");
    } finally { setPublishing(false); }
  };

  const publishReply = async (post) => {
    if (!requireLogin() || busyPosts.has(post.id)) return;
    const body = replyBody.trim();
    if (body.length < 2) return;
    setPostBusy(post.id, true); setError("");
    try {
      const payload = { body, parent_id: post.id };
      if (Number(post.event_id) > 0) await cutinappService.createEventPost(Number(post.event_id), payload);
      else await cutinappService.createFeedPost(payload);
      setReplyBody(""); setReplyTo(null);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Não foi possível comentar agora.");
    } finally { setPostBusy(post.id, false); }
  };

  const toggleLike = async (post) => {
    if (!requireLogin() || busyPosts.has(post.id)) return;
    setPostBusy(post.id, true);
    try {
      if (post.is_liked) await cutinappService.unlikeEventPost(post.id);
      else await cutinappService.likeEventPost(post.id);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Não foi possível atualizar a curtida.");
    } finally { setPostBusy(post.id, false); }
  };

  const sharePost = async (post) => {
    const url = post.event_slug ? `${window.location.origin}/event/${post.event_slug}` : `${window.location.origin}/feed`;
    const text = `${authorName(post)} na Cutinapp: ${String(post.body || "").slice(0, 180)}`;
    try {
      if (navigator.share) await navigator.share({ title: post.event_title || "Publicação na Cutinapp", text, url });
      else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        setShareNotice("Link da publicação copiado.");
        window.setTimeout(() => setShareNotice(""), 2500);
      }
    } catch (err) {
      if (err?.name !== "AbortError") setError("Não foi possível compartilhar esta publicação agora.");
    }
  };

  const openReply = (post) => {
    if (!requireLogin()) return;
    setReplyTo(replyTo === post.id ? null : post.id);
    setReplyBody("");
  };

  const openProfile = (post) => {
    if (post?.user_id) navigate(`/profile/${post.user_id}`);
  };

  const composerAvatar = imageUrl(user?.avatar);
  const composerInitial = String(user?.first_name || user?.name || "U").trim().slice(0, 1).toUpperCase() || "U";
  const composerPlaceholder = user?.first_name ? `No que você está pensando, ${user.first_name}?` : "No que você está pensando?";

  const renderPost = (post, depth = 0) => <article className={`cut-feed-post${depth ? " cut-feed-post--reply" : ""}`} key={`${depth}-${post.id}`}>
    <div className="cut-feed-post__header">
      <button type="button" className="cut-feed-post__avatar cut-feed-post__profile-link" onClick={() => openProfile(post)} aria-label={`Abrir perfil de ${authorName(post)}`}>
        {post.avatar ? <img src={imageUrl(post.avatar)} alt="" /> : <span>{initials(post)}</span>}
      </button>
      <div>
        <button type="button" className="cut-feed-post__author" onClick={() => openProfile(post)}>{authorName(post)}</button>
        <small>{fmt(post.created_at)} · Público</small>
      </div>
    </div>

    {(post.event_slug || post.production_slug) && <div className="cut-feed-post__context">
      {post.event_slug && <button type="button" onClick={() => navigate(`/event/${post.event_slug}`)}><i className="fa-regular fa-calendar" /> {post.event_title || "Ver evento"}</button>}
      {post.production_slug && <button type="button" onClick={() => navigate(`/production/${post.production_slug}/public`)}><i className="fa-regular fa-building" /> {post.production_name || "Ver produção"}</button>}
    </div>}

    <p className="cut-feed-post__body">{post.body}</p>
    <div className="cut-feed-post__actions">
      <button type="button" className={post.is_liked ? "active" : ""} disabled={busyPosts.has(post.id)} onClick={() => toggleLike(post)}><i className={`${post.is_liked ? "fa-solid" : "fa-regular"} fa-heart`} /><span>{post.likes_count || 0}</span><b>Curtir</b></button>
      <button type="button" onClick={() => openReply(post)}><i className="fa-regular fa-comment-dots" /><span>{post.comments_count || post.replies?.length || 0}</span><b>Comentar</b></button>
      <button type="button" onClick={() => sharePost(post)}><i className="fa-solid fa-share-nodes" /><b>Compartilhar</b></button>
      {post.event_slug && <button type="button" onClick={() => navigate(`/event/${post.event_slug}#comunidade`)}><i className="fa-regular fa-comments" /><b>Ver conversa</b></button>}
    </div>
    {replyTo === post.id && <div className="cut-feed-replybox"><Form.Control as="textarea" rows={2} maxLength={3000} value={replyBody} onChange={(e) => setReplyBody(e.target.value)} placeholder={`Comentar na publicação de ${authorName(post)}...`} /><div><Button variant="outline-light" size="sm" onClick={() => { setReplyTo(null); setReplyBody(""); }}>Cancelar</Button><Button size="sm" disabled={busyPosts.has(post.id) || replyBody.trim().length < 2} onClick={() => publishReply(post)}>{busyPosts.has(post.id) ? "Publicando..." : "Comentar"}</Button></div></div>}
    {Array.isArray(post.replies) && post.replies.length > 0 && <div className="cut-feed-thread">{post.replies.map((reply) => renderPost(reply, depth + 1))}</div>}
  </article>;

  return <div className="cut-app-page"><NavlogComponent />
    <Container className="cut-page-container py-4 py-lg-5 cut-feed-page">
      <div className="cut-feed-heading"><div><span className="cut-eyebrow">Comunidade</span><h1>Feed</h1><p>Publicações, novidades e atualizações dos eventos em um só lugar.</p></div></div>
      {error && <Alert variant="danger" dismissible onClose={() => setError("")}>{error}</Alert>}
      {success && <Alert variant="success" dismissible onClose={() => setSuccess("")}>{success}</Alert>}
      {shareNotice && <Alert variant="info">{shareNotice}</Alert>}

      {!loading && <Card className="cut-feed-composer mb-4"><Card.Body><Form onSubmit={publishPost}>
        <div className="cut-feed-composer__main"><div className="cut-feed-composer__avatar">{composerAvatar ? <img src={composerAvatar} alt="" /> : <span>{composerInitial}</span>}</div><Form.Control as="textarea" rows={2} maxLength={3000} value={postBody} onChange={(event) => setPostBody(event.target.value)} placeholder={composerPlaceholder} disabled={publishing} /></div>
        <div className="cut-feed-composer__footer"><span className="cut-feed-composer__visibility"><i className="fa-solid fa-earth-americas" /> Público na Cutinapp</span><div className="cut-feed-composer__actions">{postBody.length > 0 && <small>{postBody.length}/3000</small>}<Button type="submit" size="sm" disabled={publishing || postBody.trim().length < 2}>{publishing ? "Publicando..." : "Publicar"}</Button></div></div>
      </Form></Card.Body></Card>}

      <div className="cut-feed-capabilities" aria-label="Recursos das publicações"><span><i className="fa-regular fa-comment-dots" /> Comentar</span><span><i className="fa-solid fa-comments" /> Responder</span><span><i className="fa-regular fa-heart" /> Curtir</span><span><i className="fa-solid fa-share-nodes" /> Compartilhar</span></div>

      {loading ? <div className="cut-feed-stream">{Array.from({ length: 4 }).map((_, index) => <SkeletonCard key={index} />)}</div> : communityActivity.length === 0 ? <Card className="cut-empty-state"><Card.Body><div className="cut-empty-icon"><i className="fa-regular fa-comments" /></div><h2>O feed está começando</h2><p>Publique algo ou acompanhe as próximas novidades dos eventos.</p></Card.Body></Card> : <div className="cut-feed-stream">{communityActivity.map((item) => <Card className="cut-feed-social-card" key={`post-${item.id}`}><Card.Body>{renderPost(item)}</Card.Body></Card>)}</div>}
    </Container>
  </div>;
}
