import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import { Alert, Button, Card, Container, Dropdown, Form } from "react-bootstrap";
import { useLocation, useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import NavlogComponent from "../components/NavlogComponent";
import SkeletonCard from "../components/SkeletonCard";
import cutinappService from "../services/CutinappService";
import ticketAvailabilityService from "../services/TicketAvailabilityService";
import { storageUrl } from "../config";
import { trackTelemetry } from "../utils/telemetry";
import { showConfirmation } from "../utils/sweetAlert";
import "./FeedPage.css";

const fmt = (value) => value ? new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(value)) : "";
const imageUrl = (value) => !value ? "" : /^https?:/.test(value) ? value : `${storageUrl}${String(value).replace(/^\//, "")}`;
const authorName = (post) => [post?.first_name, post?.last_name].filter(Boolean).join(" ") || post?.name || "Participante Cutinapp";
const initials = (post) => `${post?.first_name?.[0] || post?.name?.[0] || "U"}${post?.last_name?.[0] || ""}`.toUpperCase();
const sellableTicketStatuses = new Set(["available", "free_available"]);
const ticketAvailabilityLabel = (post) => ({
  free_available: "Gratuito disponível",
  available: "Ingressos disponíveis",
  temporarily_reserved: "Reservado no momento",
  sold_out: "Esgotado",
  sales_ended: "Vendas encerradas",
  tickets_pending: "Ingressos em breve",
}[post?.ticket_availability_status] || "");
const hasSellableTickets = (post) => sellableTicketStatuses.has(post?.ticket_availability_status)
  || Number(post?.sellable_ticket_lots_count || 0) > 0;
const feedEventTelemetryDetails = (post, action) => ({
  label: `Feed - ${action}`,
  target: String(post?.event_slug ?? post?.event_id ?? "event"),
  metadata: { source: "feed", post_id: Number(post?.id ?? 0) || null, event_id: Number(post?.event_id ?? 0) || null, event_slug: post?.event_slug ?? null, availability_status: post?.ticket_availability_status ?? null, sellable_ticket_lots_count: Number(post?.sellable_ticket_lots_count ?? 0), sellable_free_ticket_lots_count: Number(post?.sellable_free_ticket_lots_count ?? 0) },
});
const eventIdsFromActivity = (posts = []) => Array.from(new Set(posts.flatMap((post) => [
  Number(post?.event_id || 0),
  ...(Array.isArray(post?.replies) ? post.replies.map((reply) => Number(reply?.event_id || 0)) : []),
]).filter((id) => id > 0)));
const withTicketAvailability = (post, availability = {}) => {
  const summary = post?.event_id ? availability[String(post.event_id)] || {} : {};
  return {
    ...post,
    ...summary,
    replies: Array.isArray(post?.replies)
      ? post.replies.map((reply) => withTicketAvailability(reply, availability))
      : post?.replies,
  };
};
const removePostFromActivity = (posts = [], postId) => posts
  .filter((post) => Number(post?.id) !== Number(postId))
  .map((post) => {
    if (!Array.isArray(post?.replies) || post.replies.length === 0) return post;
    const replies = post.replies.filter((reply) => Number(reply?.id) !== Number(postId));
    if (replies.length === post.replies.length) return post;
    return {
      ...post,
      replies,
      comments_count: Math.max(0, Number(post.comments_count ?? post.replies.length) - 1),
    };
  });

const MAX_POST_MEDIA = 10;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_VIDEO_BYTES = 60 * 1024 * 1024;
const MAX_TOTAL_MEDIA_BYTES = 120 * 1024 * 1024;
const SUPPORTED_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);
const mediaSource = (item) => imageUrl(item?.url || item?.path || "");

function PostMediaCarousel({ media = [], author = "usuário" }) {
  const items = Array.isArray(media) ? media.filter((item) => item?.url || item?.path) : [];
  const viewportRef = useRef(null);
  const [active, setActive] = useState(0);

  if (items.length === 0) return null;

  const goTo = (index) => {
    const next = Math.max(0, Math.min(items.length - 1, index));
    const viewport = viewportRef.current;
    if (viewport) viewport.scrollTo({ left: next * viewport.clientWidth, behavior: "smooth" });
    setActive(next);
  };

  const syncActive = () => {
    const viewport = viewportRef.current;
    if (!viewport?.clientWidth) return;
    setActive(Math.max(0, Math.min(items.length - 1, Math.round(viewport.scrollLeft / viewport.clientWidth))));
  };

  return <div className="cut-feed-media" aria-label={`Mídia da publicação de ${author}`}>
    <div className="cut-feed-media__viewport" ref={viewportRef} onScroll={syncActive}>
      {items.map((item, index) => <figure className="cut-feed-media__slide" key={item.id || `${mediaSource(item)}-${index}`}>
        {item.type === "video" || String(item.mime_type || "").startsWith("video/")
          ? <video src={mediaSource(item)} controls playsInline preload="metadata" aria-label={item.alt_text || `Vídeo ${index + 1} da publicação`} />
          : <img src={mediaSource(item)} alt={item.alt_text || `Foto ${index + 1} da publicação de ${author}`} loading="lazy" />}
      </figure>)}
    </div>
    {items.length > 1 && <>
      <button type="button" className="cut-feed-media__nav cut-feed-media__nav--prev" onClick={() => goTo(active - 1)} disabled={active === 0} aria-label="Mídia anterior"><i className="fa-solid fa-chevron-left" /></button>
      <button type="button" className="cut-feed-media__nav cut-feed-media__nav--next" onClick={() => goTo(active + 1)} disabled={active === items.length - 1} aria-label="Próxima mídia"><i className="fa-solid fa-chevron-right" /></button>
      <div className="cut-feed-media__dots" aria-label={`${active + 1} de ${items.length}`}>{items.map((item, index) => <button type="button" key={item.id || index} className={active === index ? "active" : ""} onClick={() => goTo(index)} aria-label={`Abrir mídia ${index + 1}`} />)}</div>
    </>}
  </div>;
}

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
  const [postMedia, setPostMedia] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const mediaInputRef = useRef(null);
  const postMediaRef = useRef([]);
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

      let activity = Array.isArray(response.community_activity) ? response.community_activity : [];
      const eventIds = eventIdsFromActivity(activity);
      if (eventIds.length > 0) {
        try {
          const availability = await ticketAvailabilityService.forEvents(eventIds);
          if (requestId !== feedRequestRef.current) return;
          activity = activity.map((post) => withTicketAvailability(post, availability));
        } catch {
          // Availability is supplemental. Keep the social feed usable and hide purchase CTAs on uncertainty.
        }
      }

      setCommunityActivity(activity);
      const sellableEventPosts = activity.filter((post) => post?.event_slug && hasSellableTickets(post));
      if (sellableEventPosts.length > 0) trackTelemetry("feed_sellable_event_offers_loaded", { label: "Ofertas vendáveis carregadas no Feed", target: "feed", metadata: { source: "feed", posts_count: activity.length, sellable_event_posts_count: sellableEventPosts.length, unique_sellable_events_count: new Set(sellableEventPosts.map((post) => post.event_id ?? post.event_slug)).size } });
    } catch (err) {
      if (requestId !== feedRequestRef.current) return;
      setError(err?.response?.data?.message || err?.message || "Não foi possível montar seu feed agora.");
    } finally {
      if (showSkeleton && requestId === feedRequestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => { load({ showSkeleton: true }); }, [load]);

  useEffect(() => {
    postMediaRef.current = postMedia;
  }, [postMedia]);

  useEffect(() => () => {
    postMediaRef.current.forEach((item) => {
      if (item.preview) URL.revokeObjectURL(item.preview);
    });
  }, []);

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

  const clearPostMedia = () => {
    setPostMedia((current) => {
      current.forEach((item) => {
        if (item.preview) URL.revokeObjectURL(item.preview);
      });
      return [];
    });
    if (mediaInputRef.current) mediaInputRef.current.value = "";
  };

  const removePostMedia = (mediaId) => {
    setPostMedia((current) => current.filter((item) => {
      if (item.id !== mediaId) return true;
      if (item.preview) URL.revokeObjectURL(item.preview);
      return false;
    }));
  };

  const selectPostMedia = (event) => {
    const selected = Array.from(event.target.files || []);
    event.target.value = "";
    if (selected.length === 0) return;

    const remaining = Math.max(0, MAX_POST_MEDIA - postMedia.length);
    if (selected.length > remaining) {
      setError(`Você pode adicionar até ${MAX_POST_MEDIA} fotos ou vídeos por publicação.`);
      return;
    }

    const invalidType = selected.find((file) => !SUPPORTED_MEDIA_TYPES.has(String(file.type || "").toLowerCase()));
    if (invalidType) {
      setError("Formato não suportado. Use JPG, PNG, WEBP, MP4, MOV ou WEBM.");
      return;
    }

    const oversized = selected.find((file) => {
      const isVideo = String(file.type || "").startsWith("video/");
      return file.size > (isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES);
    });
    if (oversized) {
      setError(String(oversized.type || "").startsWith("video/") ? "Cada vídeo pode ter no máximo 60 MB." : "Cada imagem pode ter no máximo 12 MB.");
      return;
    }

    const totalBytes = [...postMedia.map((item) => item.file), ...selected].reduce((sum, file) => sum + Number(file?.size || 0), 0);
    if (totalBytes > MAX_TOTAL_MEDIA_BYTES) {
      setError("A publicação pode ter no máximo 120 MB de mídia no total.");
      return;
    }

    const next = selected.map((file, index) => ({
      id: `${Date.now()}-${index}-${file.name}`,
      file,
      type: String(file.type || "").startsWith("video/") ? "video" : "image",
      preview: URL.createObjectURL(file),
    }));
    setError("");
    setPostMedia((current) => [...current, ...next]);
  };

  const publishPost = async (event) => {
    event.preventDefault();
    if (!requireLogin()) return;
    const body = postBody.trim();
    if (body.length === 1) return setError("Escreva pelo menos 2 caracteres ou publique somente a mídia.");
    if (body.length < 2 && postMedia.length === 0) return setError("Escreva algo ou adicione uma foto ou vídeo para publicar.");

    setPublishing(true);
    setUploadProgress(0);
    setError("");
    setSuccess("");
    try {
      if (postMedia.length > 0) {
        const payload = new FormData();
        if (body) payload.append("body", body);
        postMedia.forEach((item) => payload.append("media[]", item.file, item.file.name));
        await cutinappService.createFeedPost(payload, {
          onUploadProgress: (progressEvent) => {
            const total = Number(progressEvent.total || 0);
            if (total > 0) setUploadProgress(Math.min(100, Math.round((Number(progressEvent.loaded || 0) / total) * 100)));
          },
        });
      } else {
        await cutinappService.createFeedPost({ body });
      }

      setPostBody("");
      clearPostMedia();
      setUploadProgress(100);
      setSuccess("Sua publicação está no ar. A comunidade já pode curtir, comentar e compartilhar.");
      trackTelemetry("feed_post_published", {
        label: "Publicação criada no Feed",
        target: "feed",
        metadata: {
          source: "feed",
          media_count: postMedia.length,
          has_video: postMedia.some((item) => item.type === "video"),
          has_text: Boolean(body),
        },
      });
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Não foi possível publicar agora.");
    } finally {
      setPublishing(false);
      window.setTimeout(() => setUploadProgress(0), 500);
    }
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

  const isAdministrator = user?.profile?.name === "Administrador";
  const isOwnPost = (post) => Boolean(user?.id && post?.user_id) && Number(post.user_id) === Number(user.id);
  const canManagePost = (post) => isOwnPost(post) || isAdministrator;

  const deletePost = async (post, depth = 0) => {
    if (!requireLogin() || busyPosts.has(post.id) || !canManagePost(post)) return;
    const isReply = depth > 0 || Number(post.parent_id || 0) > 0;
    const moderatingOtherUser = isAdministrator && !isOwnPost(post);
    const confirmed = await showConfirmation({
      title: moderatingOtherUser
        ? `Excluir ${isReply ? "comentário" : "publicação"} de ${authorName(post)}?`
        : isReply ? "Excluir comentário?" : "Excluir publicação?",
      text: moderatingOtherUser
        ? `Como administrador, você está removendo conteúdo de outro usuário. ${isReply ? "O comentário" : "A publicação e suas respostas"} deixará de aparecer no Feed. Essa ação não pode ser desfeita.`
        : isReply
          ? "Seu comentário deixará de aparecer no Feed. Essa ação não pode ser desfeita."
          : "Sua publicação e as respostas dela deixarão de aparecer no Feed. Essa ação não pode ser desfeita.",
      icon: "warning",
      confirmButtonText: "Excluir",
      cancelButtonText: "Cancelar",
    });
    if (!confirmed) return;

    setPostBusy(post.id, true);
    setError("");
    setSuccess("");
    try {
      await cutinappService.deleteEventPost(post.id);
      setCommunityActivity((current) => removePostFromActivity(current, post.id));
      if (replyTo === post.id) {
        setReplyTo(null);
        setReplyBody("");
      }
      setSuccess(moderatingOtherUser
        ? (isReply ? "Comentário removido pela moderação." : "Publicação removida pela moderação.")
        : (isReply ? "Comentário excluído." : "Publicação excluída."));
      trackTelemetry("feed_post_deleted", {
        label: moderatingOtherUser
          ? (isReply ? "Comentário moderado no Feed" : "Publicação moderada no Feed")
          : (isReply ? "Comentário excluído no Feed" : "Publicação excluída no Feed"),
        target: String(post.id),
        metadata: {
          source: "feed",
          post_id: Number(post.id),
          event_id: Number(post.event_id || 0) || null,
          is_reply: isReply,
          moderated_by_admin: moderatingOtherUser,
          post_author_user_id: Number(post.user_id || 0) || null,
        },
      });
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Não foi possível excluir esta publicação.");
    } finally {
      setPostBusy(post.id, false);
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
  const openEventFromFeed = (post, ticketIntent = false) => {
    if (!post?.event_slug) return;
    trackTelemetry(ticketIntent ? "feed_ticket_intent_clicked" : "feed_event_opened", feedEventTelemetryDetails(post, ticketIntent ? "ingresso" : "evento"));
    navigate(`/event/${post.event_slug}${ticketIntent ? "#ingressos" : ""}`);
  };

  const composerAvatar = imageUrl(user?.avatar);
  const composerInitial = String(user?.first_name || user?.name || "U").trim().slice(0, 1).toUpperCase() || "U";
  const composerPlaceholder = user?.first_name ? `No que você está pensando, ${user.first_name}?` : "No que você está pensando?";

  const renderPost = (post, depth = 0) => {
    const availabilityLabel = ticketAvailabilityLabel(post);
    const canBuyTickets = hasSellableTickets(post);
    const ownsPost = isOwnPost(post);
    const canManage = canManagePost(post);
    const moderatingOtherUser = isAdministrator && !ownsPost;
    const isReply = depth > 0 || Number(post.parent_id || 0) > 0;

    return <article className={`cut-feed-post${depth ? " cut-feed-post--reply" : ""}`} key={`${depth}-${post.id}`}>
    <div className="cut-feed-post__header">
      <button type="button" className="cut-feed-post__avatar cut-feed-post__profile-link" onClick={() => openProfile(post)} aria-label={`Abrir perfil de ${authorName(post)}`}>
        {post.avatar ? <img src={imageUrl(post.avatar)} alt="" /> : <span>{initials(post)}</span>}
      </button>
      <div className="cut-feed-post__identity">
        <button type="button" className="cut-feed-post__author" onClick={() => openProfile(post)}>{authorName(post)}</button>
        <small>{fmt(post.created_at)} · Público</small>
      </div>
      {canManage && <Dropdown align="end" className="cut-feed-post__manage">
        <Dropdown.Toggle
          variant="link"
          size="sm"
          disabled={busyPosts.has(post.id)}
          aria-label={moderatingOtherUser
            ? (isReply ? "Moderar comentário" : "Moderar publicação")
            : (isReply ? "Gerenciar seu comentário" : "Gerenciar sua publicação")}
          title={moderatingOtherUser
            ? (isReply ? "Moderar comentário" : "Moderar publicação")
            : (isReply ? "Gerenciar comentário" : "Gerenciar publicação")}
        >
          <i className={busyPosts.has(post.id) ? "fa-solid fa-spinner fa-spin" : "fa-solid fa-ellipsis"} />
        </Dropdown.Toggle>
        <Dropdown.Menu>
          <Dropdown.Header>{moderatingOtherUser
            ? (isReply ? "Moderação do comentário" : "Moderação da publicação")
            : (isReply ? "Gerenciar comentário" : "Gerenciar publicação")}</Dropdown.Header>
          <Dropdown.Item className="cut-feed-post__manage-danger" onClick={() => deletePost(post, depth)}>
            <i className="fa-regular fa-trash-can" />
            <span>{isReply ? "Excluir comentário" : "Excluir publicação"}</span>
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown>}
    </div>

    {(post.event_slug || post.production_slug) && <div className="cut-feed-post__context">
      {post.event_slug && <button type="button" onClick={() => openEventFromFeed(post)}><i className="fa-regular fa-calendar" /> {post.event_title || "Ver evento"}{availabilityLabel ? ` · ${availabilityLabel}` : ""}</button>}
      {post.event_slug && canBuyTickets && <button type="button" onClick={() => openEventFromFeed(post, true)}><i className="fa-solid fa-ticket" /> {Number(post.sellable_free_ticket_lots_count || 0) > 0 ? "Pegar ingresso" : "Comprar ingresso"}</button>}
      {post.production_slug && <button type="button" onClick={() => navigate(`/production/${post.production_slug}/public`)}><i className="fa-regular fa-building" /> {post.production_name || "Ver produção"}</button>}
    </div>}

    <PostMediaCarousel media={post.media} author={authorName(post)} />
    {String(post.body || "").trim() && <p className="cut-feed-post__body">{post.body}</p>}
    <div className="cut-feed-post__actions">
      <button type="button" className={post.is_liked ? "active" : ""} disabled={busyPosts.has(post.id)} onClick={() => toggleLike(post)}><i className={`${post.is_liked ? "fa-solid" : "fa-regular"} fa-heart`} /><span>{post.likes_count || 0}</span><b>Curtir</b></button>
      <button type="button" onClick={() => openReply(post)}><i className="fa-regular fa-comment-dots" /><span>{post.comments_count || post.replies?.length || 0}</span><b>Comentar</b></button>
      <button type="button" onClick={() => sharePost(post)}><i className="fa-solid fa-share-nodes" /><b>Compartilhar</b></button>
      {post.event_slug && <button type="button" onClick={() => navigate(`/event/${post.event_slug}#comunidade`)}><i className="fa-regular fa-comments" /><b>Ver conversa</b></button>}
    </div>
    {replyTo === post.id && <div className="cut-feed-replybox"><Form.Control as="textarea" rows={2} maxLength={3000} value={replyBody} onChange={(e) => setReplyBody(e.target.value)} placeholder={`Comentar na publicação de ${authorName(post)}...`} /><div><Button variant="outline-light" size="sm" onClick={() => { setReplyTo(null); setReplyBody(""); }}>Cancelar</Button><Button size="sm" disabled={busyPosts.has(post.id) || replyBody.trim().length < 2} onClick={() => publishReply(post)}>{busyPosts.has(post.id) ? "Publicando..." : "Comentar"}</Button></div></div>}
    {Array.isArray(post.replies) && post.replies.length > 0 && <div className="cut-feed-thread">{post.replies.map((reply) => renderPost(reply, depth + 1))}</div>}
  </article>;
  };

  return <div className="cut-app-page"><NavlogComponent />
    <Container className="cut-page-container py-4 py-lg-5 cut-feed-page">
      <div className="cut-feed-heading"><div><span className="cut-eyebrow">Comunidade</span><h1>Feed</h1><p>Publicações, novidades e atualizações dos eventos em um só lugar.</p></div></div>
      {error && <Alert variant="danger" dismissible onClose={() => setError("")}>{error}</Alert>}
      {success && <Alert variant="success" dismissible onClose={() => setSuccess("")}>{success}</Alert>}
      {shareNotice && <Alert variant="info">{shareNotice}</Alert>}

      {!loading && <Card className="cut-feed-composer mb-4"><Card.Body><Form onSubmit={publishPost}>
        <div className="cut-feed-composer__main"><div className="cut-feed-composer__avatar">{composerAvatar ? <img src={composerAvatar} alt="" /> : <span>{composerInitial}</span>}</div><Form.Control as="textarea" rows={2} maxLength={3000} value={postBody} onChange={(event) => setPostBody(event.target.value)} placeholder={composerPlaceholder} disabled={publishing} /></div>
        <input ref={mediaInputRef} className="cut-feed-composer__file-input" type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm" onChange={selectPostMedia} disabled={publishing} aria-label="Selecionar fotos ou vídeos para a publicação" />
        {postMedia.length > 0 && <div className="cut-feed-composer__selected-media" aria-label="Mídia selecionada para publicação">{postMedia.map((item, index) => <div className="cut-feed-composer__preview" key={item.id}>
          {item.type === "video" ? <video src={item.preview} muted playsInline preload="metadata" /> : <img src={item.preview} alt={`Prévia da foto ${index + 1}`} />}
          <button type="button" onClick={() => removePostMedia(item.id)} disabled={publishing} aria-label={`Remover mídia ${index + 1}`}><i className="fa-solid fa-xmark" /></button>
          <span>{item.type === "video" ? "Vídeo" : "Foto"}</span>
        </div>)}</div>}
        {publishing && postMedia.length > 0 && <div className="cut-feed-composer__progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={uploadProgress}><span style={{ width: `${uploadProgress}%` }} /></div>}
        <div className="cut-feed-composer__footer">
          <div className="cut-feed-composer__tools">
            <span className="cut-feed-composer__visibility"><i className="fa-solid fa-earth-americas" /> Público na Cutinapp</span>
            <button type="button" className="cut-feed-composer__media-button" onClick={() => mediaInputRef.current?.click()} disabled={publishing || postMedia.length >= MAX_POST_MEDIA}><i className="fa-regular fa-images" /> Foto ou vídeo <small>{postMedia.length ? `${postMedia.length}/${MAX_POST_MEDIA}` : ""}</small></button>
          </div>
          <div className="cut-feed-composer__actions">{postBody.length > 0 && <small>{postBody.length}/3000</small>}<Button type="submit" size="sm" disabled={publishing || (postBody.trim().length < 2 && postMedia.length === 0)}>{publishing ? (postMedia.length > 0 && uploadProgress > 0 ? `Enviando ${uploadProgress}%` : "Publicando...") : "Publicar"}</Button></div>
        </div>
      </Form></Card.Body></Card>}

      <div className="cut-feed-capabilities" aria-label="Recursos das publicações"><span><i className="fa-regular fa-images" /> Fotos e vídeos</span><span><i className="fa-regular fa-comment-dots" /> Comentar</span><span><i className="fa-regular fa-heart" /> Curtir</span><span><i className="fa-solid fa-share-nodes" /> Compartilhar</span></div>

      {loading ? <div className="cut-feed-stream">{Array.from({ length: 4 }).map((_, index) => <SkeletonCard key={index} />)}</div> : communityActivity.length === 0 ? <Card className="cut-empty-state"><Card.Body><div className="cut-empty-icon"><i className="fa-regular fa-comments" /></div><h2>O feed está começando</h2><p>Publique algo ou acompanhe as próximas novidades dos eventos.</p></Card.Body></Card> : <div className="cut-feed-stream">{communityActivity.map((item) => <Card className="cut-feed-social-card" key={`post-${item.id}`}><Card.Body>{renderPost(item)}</Card.Body></Card>)}</div>}
    </Container>
  </div>;
}
