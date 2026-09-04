import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { Alert, Button, Form, Modal, Spinner } from "react-bootstrap";
import { useLocation, useNavigate } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import { storageUrl } from "../../config";
import cutinappService from "../../services/CutinappService";

const fmt = (value) => value ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(value)) : "";
const mediaUrl = (value) => !value ? "" : /^https?:\/\//i.test(value) ? value : `${storageUrl}${String(value).replace(/^\//, "")}`;
const initials = (item) => `${item?.first_name?.[0] || "U"}${item?.last_name?.[0] || ""}`.toUpperCase();
const displayName = (item) => [item?.first_name, item?.last_name].filter(Boolean).join(" ") || item?.user_name || "Participante";

const GLOBAL_PROMPTS = [
  "O que tem de rolê hoje na minha cidade?",
  "Quem vai sair neste fim de semana?",
  "Alguma indicação de evento para hoje?",
];

function Avatar({ item, small = false }) {
  return <span className={`cut-social-avatar${small ? " cut-social-avatar--sm" : ""}`}>
    {item?.avatar ? <img src={mediaUrl(item.avatar)} alt="" /> : initials(item)}
  </span>;
}

Avatar.propTypes = {
  item: PropTypes.object,
  small: PropTypes.bool,
};

export default function SocialThread({ scopeType = "global", scopeId = null, eyebrow = "Comunidade", title = "Conversa Cutinapp", description = "Publique, responda e interaja com a comunidade." }) {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  const viewed = useRef(new Set());
  const [postsState, setPostsState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [replyBody, setReplyBody] = useState("");
  const [message, setMessage] = useState(null);
  const [viewCounts, setViewCounts] = useState({});
  const [viewerModal, setViewerModal] = useState({ show: false, loading: false, data: null });

  const params = useMemo(() => ({ scope_type: scopeType, ...(scopeId ? { scope_id: Number(scopeId) } : {}) }), [scopeType, scopeId]);
  const login = () => navigate("/login", { state: { from: `${location.pathname}${location.search}${location.hash || ""}` } });

  const load = useCallback(async (page = 1, append = false) => {
    append ? setMoreLoading(true) : setLoading(true);
    try {
      const response = await cutinappService.socialPosts({ ...params, page, per_page: 15 });
      setPostsState((current) => {
        if (!append || !current) return response.posts;
        const oldPosts = current?.data || [];
        const nextPosts = response.posts?.data || [];
        return {
          ...response.posts,
          data: [...oldPosts, ...nextPosts.filter((post) => !oldPosts.some((old) => Number(old.id) === Number(post.id)))],
        };
      });
    } catch (error) {
      setMessage({ type: "danger", text: error?.message || "Não foi possível carregar a conversa agora." });
    } finally {
      setLoading(false);
      setMoreLoading(false);
    }
  }, [params]);

  useEffect(() => { load(1, false); }, [load]);

  const posts = postsState?.data || [];

  useEffect(() => {
    const all = posts.flatMap((post) => [post, ...(post.replies || [])]);
    all.forEach((post) => {
      const id = Number(post.id);
      if (!id || viewed.current.has(id)) return;
      viewed.current.add(id);
      cutinappService.recordSocialPostView(id)
        .then((result) => setViewCounts((current) => ({ ...current, [id]: Number(result?.views_count || 0) })))
        .catch(() => {});
    });
  }, [posts]);

  const refresh = () => load(1, false);

  const publish = async (parentId = null) => {
    if (!user) return login();
    const text = (parentId ? replyBody : body).trim();
    if (text.length < 2) return;
    setBusy(true); setMessage(null);
    try {
      await cutinappService.createSocialPost({ ...params, body: text, parent_id: parentId || undefined });
      if (parentId) { setReplyTo(null); setReplyBody(""); } else setBody("");
      setMessage({ type: "success", text: parentId ? "Resposta publicada." : "Sua publicação já está visível para a comunidade." });
      await refresh();
    } catch (error) {
      setMessage({ type: "danger", text: error?.message || "Não foi possível publicar agora." });
    } finally { setBusy(false); }
  };

  const toggleLike = async (post) => {
    if (!user) return login();
    try {
      if (post.is_liked) await cutinappService.unlikeSocialPost(post.id);
      else await cutinappService.likeSocialPost(post.id);
      await refresh();
    } catch (error) {
      setMessage({ type: "danger", text: error?.message || "Não foi possível atualizar a curtida." });
    }
  };

  const remove = async (postId) => {
    if (!window.confirm("Remover esta publicação e suas respostas?")) return;
    setBusy(true);
    try { await cutinappService.deleteSocialPost(postId); await refresh(); }
    catch (error) { setMessage({ type: "danger", text: error?.message || "Não foi possível remover a publicação." }); }
    finally { setBusy(false); }
  };

  const openViewers = async (postId) => {
    setViewerModal({ show: true, loading: true, data: null });
    try {
      const data = await cutinappService.socialPostViewers(postId);
      setViewCounts((current) => ({ ...current, [postId]: Number(data?.views_count || 0) }));
      setViewerModal({ show: true, loading: false, data });
    } catch (error) {
      setViewerModal({ show: true, loading: false, data: { error: error?.message || "Não foi possível carregar os visualizadores." } });
    }
  };

  const goProfile = (userId) => userId && navigate(`/users/${userId}`);
  const countViews = (post) => viewCounts[post.id] ?? Number(post.views_count || 0);

  const renderActions = (post, canReply = true) => <div className="cut-social-post__actions">
    <button type="button" className={post.is_liked ? "active" : ""} onClick={() => toggleLike(post)}><i className={`${post.is_liked ? "fa-solid" : "fa-regular"} fa-heart`} /><span>{post.likes_count || 0}</span><span className="cut-social-action-label">Curtir</span></button>
    {canReply && <button type="button" onClick={() => user ? setReplyTo(replyTo === post.id ? null : post.id) : login()}><i className="fa-regular fa-comment" /><span>{post.comments_count || 0}</span><span className="cut-social-action-label">Responder</span></button>}
    <button type="button" onClick={() => openViewers(post.id)}><i className="fa-regular fa-eye" /><span>{countViews(post)}</span><span className="cut-social-action-label">Visualizações</span></button>
    {user && Number(post.user_id) === Number(user.id) && <button type="button" className="danger" onClick={() => remove(post.id)}><i className="fa-regular fa-trash-can" /><span className="cut-social-action-label">Remover</span></button>}
  </div>;

  return <section className="cut-social-thread">
    <div className="cut-social-thread__head">
      <div><span className="cut-eyebrow">{eyebrow}</span><h2>{title}</h2><p>{description}</p></div>
      {scopeType === "global" && <span className="cut-social-live-pill"><i className="fa-solid fa-earth-americas" /> Público</span>}
    </div>

    {message && <Alert variant={message.type} dismissible onClose={() => setMessage(null)}>{message.text}</Alert>}

    <div className="cut-social-composer">
      <Avatar item={user} />
      <div className="cut-social-composer__body">
        <Form.Control as="textarea" rows={3} maxLength={3000} value={body} onChange={(event) => setBody(event.target.value)} onFocus={() => { if (!user) login(); }} placeholder={user ? (scopeType === "global" ? "O que está rolando? Pergunte, indique um evento ou puxe uma conversa..." : "Fale sobre esta produção, seus eventos ou tire uma dúvida...") : "Entre para publicar na comunidade"} />
        {scopeType === "global" && user && <div className="cut-social-prompts">{GLOBAL_PROMPTS.map((prompt) => <button type="button" key={prompt} onClick={() => setBody(prompt)}>{prompt}</button>)}</div>}
        <div className="cut-social-composer__footer"><small>{body.length}/3000</small><Button disabled={busy || body.trim().length < 2} onClick={() => publish()}>{busy ? "Publicando..." : "Publicar"}</Button></div>
      </div>
    </div>

    {loading ? <div className="cut-social-loading"><Spinner animation="border" size="sm" /><span>Carregando conversa...</span></div> : posts.length === 0 ? <div className="cut-social-empty"><i className="fa-regular fa-comments" /><strong>Abra a conversa</strong><span>Seja a primeira pessoa a publicar aqui.</span></div> : <div className="cut-social-list">{posts.map((post) => <article className="cut-social-post" key={post.id}>
      <button type="button" className="cut-social-avatar-button" onClick={() => goProfile(post.user_id)} aria-label={`Abrir perfil de ${displayName(post)}`}><Avatar item={post} /></button>
      <div className="cut-social-post__content">
        <header><button type="button" onClick={() => goProfile(post.user_id)}>{displayName(post)}</button>{post.user_name && <span>@{post.user_name}</span>}<time>{fmt(post.created_at)}{post.edited_at ? " · editado" : ""}</time></header>
        <p>{post.body}</p>
        {renderActions(post)}
        {replyTo === post.id && <div className="cut-social-replybox"><Form.Control as="textarea" rows={2} maxLength={3000} value={replyBody} onChange={(event) => setReplyBody(event.target.value)} placeholder="Escreva sua resposta..." /><div><Button variant="outline-light" size="sm" onClick={() => { setReplyTo(null); setReplyBody(""); }}>Cancelar</Button><Button size="sm" disabled={busy || replyBody.trim().length < 2} onClick={() => publish(post.id)}>Responder</Button></div></div>}
        {post.replies?.length > 0 && <div className="cut-social-replies">{post.replies.map((reply) => <div className="cut-social-reply" key={reply.id}>
          <button type="button" className="cut-social-avatar-button" onClick={() => goProfile(reply.user_id)}><Avatar item={reply} small /></button>
          <div><header><button type="button" onClick={() => goProfile(reply.user_id)}>{displayName(reply)}</button>{reply.user_name && <span>@{reply.user_name}</span>}<time>{fmt(reply.created_at)}</time></header><p>{reply.body}</p>{renderActions(reply, false)}</div>
        </div>)}</div>}
      </div>
    </article>)}</div>}

    {postsState?.current_page < postsState?.last_page && <div className="cut-social-pagination"><Button variant="outline-light" disabled={moreLoading} onClick={() => load((postsState.current_page || 1) + 1, true)}>{moreLoading ? "Carregando..." : "Carregar mais publicações"}</Button></div>}

    <Modal show={viewerModal.show} onHide={() => setViewerModal({ show: false, loading: false, data: null })} centered className="cut-modal cut-social-viewers-modal">
      <Modal.Header closeButton><Modal.Title>Quem visualizou</Modal.Title></Modal.Header>
      <Modal.Body>
        {viewerModal.loading ? <div className="cut-social-loading"><Spinner animation="border" size="sm" /><span>Carregando visualizações...</span></div> : viewerModal.data?.error ? <Alert variant="danger">{viewerModal.data.error}</Alert> : <>
          <div className="cut-social-view-summary"><strong>{viewerModal.data?.views_count || 0}</strong><span>visualizações · {viewerModal.data?.unique_viewers_count || 0} visitantes únicos</span></div>
          {(viewerModal.data?.viewers || []).length === 0 ? <p className="text-secondary mb-0">Ainda não há visualizadores identificados.</p> : <div className="cut-social-viewer-list">{viewerModal.data.viewers.map((viewer) => <button type="button" key={viewer.id} onClick={() => { setViewerModal({ show: false, loading: false, data: null }); goProfile(viewer.id); }}><Avatar item={viewer} small /><span><strong>{displayName(viewer)}</strong><small>{viewer.views_count} visualização{Number(viewer.views_count) === 1 ? "" : "ões"}</small></span><i className="fa-solid fa-chevron-right" /></button>)}</div>}
          {Number(viewerModal.data?.anonymous_views_count || 0) > 0 && <small className="cut-social-anonymous-note"><i className="fa-solid fa-user-secret" /> {viewerModal.data.anonymous_views_count} visualização{Number(viewerModal.data.anonymous_views_count) === 1 ? "" : "ões"} de visitantes sem login.</small>}
        </>}
      </Modal.Body>
    </Modal>
  </section>;
}

SocialThread.propTypes = {
  scopeType: PropTypes.oneOf(["global", "production"]),
  scopeId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  eyebrow: PropTypes.string,
  title: PropTypes.string,
  description: PropTypes.string,
};
