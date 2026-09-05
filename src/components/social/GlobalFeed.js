import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Form, Spinner } from "react-bootstrap";
import { AuthContext } from "../../context/AuthContext";
import { storageUrl } from "../../config";
import socialFeedService from "../../services/SocialFeedService";
import "../../styles/global-feed.css";

const assetUrl = (value) => {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `${storageUrl}${String(value).replace(/^\//, "")}`;
};

const displayName = (item) => [item?.first_name, item?.last_name].filter(Boolean).join(" ") || item?.user_name || "Participante";
const initials = (item) => `${item?.first_name?.[0] || "U"}${item?.last_name?.[0] || ""}`.toUpperCase();
const formatDate = (value) => value ? new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
}).format(new Date(value)) : "";

function Avatar({ item, small = false }) {
  return <span className={`cut-global-avatar${small ? " cut-global-avatar--small" : ""}`}>
    {item?.avatar ? <img src={assetUrl(item.avatar)} alt="" /> : initials(item)}
  </span>;
}

export default function GlobalFeed() {
  const { user } = useContext(AuthContext);
  const fileInputRef = useRef(null);
  const [postsState, setPostsState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [body, setBody] = useState("");
  const [media, setMedia] = useState(null);
  const [activeComment, setActiveComment] = useState(null);
  const [commentBody, setCommentBody] = useState("");
  const [busyPost, setBusyPost] = useState(null);
  const [message, setMessage] = useState(null);

  const mediaPreview = useMemo(() => media ? URL.createObjectURL(media) : "", [media]);
  useEffect(() => () => { if (mediaPreview) URL.revokeObjectURL(mediaPreview); }, [mediaPreview]);

  const load = useCallback(async (page = 1, append = false) => {
    append ? setMoreLoading(true) : setLoading(true);
    try {
      const response = await socialFeedService.list({ page, per_page: 15 });
      setPostsState((current) => {
        if (!append || !current) return response.posts;
        const oldItems = current.data || [];
        const newItems = response.posts?.data || [];
        return {
          ...response.posts,
          data: [...oldItems, ...newItems.filter((item) => !oldItems.some((old) => Number(old.id) === Number(item.id)))],
        };
      });
    } catch (error) {
      setMessage({ type: "danger", text: error?.message || "Não foi possível carregar as publicações." });
    } finally {
      setLoading(false);
      setMoreLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const resetComposer = () => {
    setBody("");
    setMedia(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const publish = async () => {
    if (!body.trim() && !media) return;
    setPublishing(true);
    setMessage(null);
    try {
      await socialFeedService.publish({ body: body.trim(), media });
      resetComposer();
      setMessage({ type: "success", text: "Publicado. Todo mundo na Cutinapp já pode ver." });
      await load();
    } catch (error) {
      setMessage({ type: "danger", text: error?.message || "Não foi possível publicar agora." });
    } finally {
      setPublishing(false);
    }
  };

  const publishComment = async (postId) => {
    if (!commentBody.trim()) return;
    setBusyPost(postId);
    try {
      await socialFeedService.publish({ body: commentBody.trim(), parentId: postId });
      setCommentBody("");
      setActiveComment(null);
      await load();
    } catch (error) {
      setMessage({ type: "danger", text: error?.message || "Não foi possível comentar agora." });
    } finally {
      setBusyPost(null);
    }
  };

  const toggleLike = async (post) => {
    setBusyPost(post.id);
    try {
      if (post.is_liked) await socialFeedService.unlike(post.id);
      else await socialFeedService.like(post.id);
      await load();
    } catch (error) {
      setMessage({ type: "danger", text: error?.message || "Não foi possível atualizar a curtida." });
    } finally {
      setBusyPost(null);
    }
  };

  const removePost = async (postId) => {
    if (!window.confirm("Remover esta publicação?")) return;
    setBusyPost(postId);
    try {
      await socialFeedService.remove(postId);
      await load();
    } catch (error) {
      setMessage({ type: "danger", text: error?.message || "Não foi possível remover a publicação." });
    } finally {
      setBusyPost(null);
    }
  };

  const sharePost = async (post) => {
    const url = `${window.location.origin}/feed#post-${post.id}`;
    const shareData = { title: "Publicação na Cutinapp", text: post.body || "Veja esta publicação na Cutinapp", url };
    try {
      if (navigator.share) await navigator.share(shareData);
      else {
        await navigator.clipboard.writeText(url);
        setMessage({ type: "success", text: "Link da publicação copiado." });
      }
    } catch (error) {
      if (error?.name !== "AbortError") setMessage({ type: "danger", text: "Não foi possível compartilhar agora." });
    }
  };

  const selectMedia = (event) => {
    const selected = event.target.files?.[0] || null;
    if (!selected) return;
    if (selected.size > 50 * 1024 * 1024) {
      setMessage({ type: "danger", text: "A foto ou vídeo deve ter no máximo 50 MB." });
      event.target.value = "";
      return;
    }
    setMedia(selected);
  };

  const posts = postsState?.data || [];

  return <section className="cut-global-feed" aria-label="Publicações da comunidade Cutinapp">
    <div className="cut-global-feed__heading">
      <div>
        <span className="cut-eyebrow">Comunidade</span>
        <h2>O que está rolando?</h2>
        <p>Publique para toda a Cutinapp, converse, marque presença e compartilhe descobertas.</p>
      </div>
      <span className="cut-global-feed__public"><i className="fa-solid fa-earth-americas" /> Público</span>
    </div>

    {message && <Alert variant={message.type} dismissible onClose={() => setMessage(null)}>{message.text}</Alert>}

    <article className="cut-global-composer">
      <Avatar item={user} />
      <div className="cut-global-composer__main">
        <Form.Control
          as="textarea"
          rows={3}
          maxLength={3000}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder={`No que você está pensando${user?.first_name ? `, ${user.first_name}` : ""}?`}
          aria-label="Texto da publicação"
        />

        {mediaPreview && <div className="cut-global-composer__preview">
          {media?.type?.startsWith("video/")
            ? <video src={mediaPreview} controls preload="metadata" />
            : <img src={mediaPreview} alt="Prévia da publicação" />}
          <button type="button" onClick={() => setMedia(null)} aria-label="Remover mídia"><i className="fa-solid fa-xmark" /></button>
        </div>}

        <div className="cut-global-composer__footer">
          <div className="cut-global-composer__tools">
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" onChange={selectMedia} hidden />
            <button type="button" onClick={() => fileInputRef.current?.click()}><i className="fa-regular fa-image" /> Foto/vídeo</button>
            <span><i className="fa-solid fa-earth-americas" /> Todos na Cutinapp</span>
          </div>
          <Button disabled={publishing || (!body.trim() && !media)} onClick={publish}>{publishing ? "Publicando..." : "Publicar"}</Button>
        </div>
      </div>
    </article>

    {loading ? <div className="cut-global-feed__loading"><Spinner animation="border" size="sm" /><span>Carregando publicações...</span></div> : posts.length === 0 ? <div className="cut-global-feed__empty"><i className="fa-regular fa-comments" /><strong>Seja a primeira pessoa a publicar</strong><span>Conte o que está rolando, pergunte sobre um evento ou compartilhe uma experiência.</span></div> : <div className="cut-global-feed__list">
      {posts.map((post) => <article className="cut-global-post" id={`post-${post.id}`} key={post.id}>
        <header className="cut-global-post__header">
          <Avatar item={post} />
          <div><strong>{displayName(post)}</strong>{post.user_name && <span>@{post.user_name}</span>}<time>{formatDate(post.created_at)}</time></div>
          {Number(post.user_id) === Number(user?.id) && <button className="cut-global-post__remove" type="button" disabled={busyPost === post.id} onClick={() => removePost(post.id)} aria-label="Remover publicação"><i className="fa-regular fa-trash-can" /></button>}
        </header>

        {post.body && <p className="cut-global-post__body">{post.body}</p>}
        {post.media_path && <div className="cut-global-post__media">
          {post.media_type === "video"
            ? <video src={assetUrl(post.media_path)} controls preload="metadata" />
            : <img src={assetUrl(post.media_path)} alt="Mídia da publicação" loading="lazy" />}
        </div>}

        <div className="cut-global-post__stats">
          <span>{Number(post.likes_count || 0)} curtida{Number(post.likes_count || 0) === 1 ? "" : "s"}</span>
          <span>{Number(post.comments_count || 0)} comentário{Number(post.comments_count || 0) === 1 ? "" : "s"}</span>
        </div>

        <div className="cut-global-post__actions">
          <button type="button" className={post.is_liked ? "active" : ""} disabled={busyPost === post.id} onClick={() => toggleLike(post)}><i className={`${post.is_liked ? "fa-solid" : "fa-regular"} fa-heart`} /> Curtir</button>
          <button type="button" onClick={() => { setActiveComment(activeComment === post.id ? null : post.id); setCommentBody(""); }}><i className="fa-regular fa-comment" /> Comentar</button>
          <button type="button" onClick={() => sharePost(post)}><i className="fa-solid fa-share-nodes" /> Compartilhar</button>
        </div>

        {activeComment === post.id && <div className="cut-global-commentbox">
          <Avatar item={user} small />
          <Form.Control value={commentBody} maxLength={3000} onChange={(event) => setCommentBody(event.target.value)} placeholder="Escreva um comentário..." onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); publishComment(post.id); } }} />
          <Button size="sm" disabled={busyPost === post.id || !commentBody.trim()} onClick={() => publishComment(post.id)}>Enviar</Button>
        </div>}

        {post.comments?.length > 0 && <div className="cut-global-comments">
          {post.comments.map((comment) => <div className="cut-global-comment" key={comment.id}>
            <Avatar item={comment} small />
            <div className="cut-global-comment__bubble"><strong>{displayName(comment)}</strong><p>{comment.body}</p><small>{formatDate(comment.created_at)}</small></div>
            <button type="button" className={comment.is_liked ? "active" : ""} onClick={() => toggleLike(comment)} aria-label="Curtir comentário"><i className={`${comment.is_liked ? "fa-solid" : "fa-regular"} fa-heart`} /> {comment.likes_count || 0}</button>
          </div>)}
        </div>}
      </article>)}
    </div>}

    {postsState?.current_page < postsState?.last_page && <div className="cut-global-feed__more"><Button variant="outline-light" disabled={moreLoading} onClick={() => load((postsState.current_page || 1) + 1, true)}>{moreLoading ? "Carregando..." : "Carregar mais publicações"}</Button></div>}
  </section>;
}
