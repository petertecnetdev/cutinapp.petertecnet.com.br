import React, { useCallback, useContext, useEffect, useState } from "react";
import PropTypes from "prop-types";
import { Alert, Button, Form } from "react-bootstrap";
import { useLocation, useNavigate } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import cutinappService from "../../services/CutinappService";

const fmt = (value) => value ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(value)) : "";
const initials = (item) => `${item?.first_name?.[0] || "U"}${item?.last_name?.[0] || ""}`.toUpperCase();

export default function ProductionCommunitySection({ production, isOwner = false }) {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  const [community, setCommunity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [replyBody, setReplyBody] = useState("");
  const [message, setMessage] = useState(null);

  const login = () => navigate("/login", { state: { from: `${location.pathname}${location.search}#comunidade` } });
  const load = useCallback(async (page = 1, append = false) => {
    append ? setMoreLoading(true) : setLoading(true);
    try {
      const response = await cutinappService.productionCommunity(production.slug, { page, per_page: 10 });
      setCommunity((current) => {
        if (!append || !current) return response;
        const oldPosts = current.posts?.data || [];
        const newPosts = response.posts?.data || [];
        return { ...response, posts: { ...response.posts, data: [...oldPosts, ...newPosts.filter((item) => !oldPosts.some((old) => old.id === item.id))] } };
      });
    } catch (err) {
      setMessage({ type: "danger", text: err?.message || "Não foi possível carregar a conversa desta produção." });
    } finally {
      setLoading(false);
      setMoreLoading(false);
    }
  }, [production.slug]);

  useEffect(() => { load(1, false); }, [load]);
  const posts = community?.posts?.data || [];

  const publish = async (parentId = null) => {
    if (!user) return login();
    const text = parentId ? replyBody.trim() : body.trim();
    if (text.length < 2) return;
    setBusy(true); setMessage(null);
    try {
      await cutinappService.createProductionPost(production.id, { body: text, parent_id: parentId || undefined });
      if (parentId) { setReplyBody(""); setReplyTo(null); } else setBody("");
      await load(1, false);
    } catch (err) {
      setMessage({ type: "danger", text: err?.message || "Não foi possível publicar agora." });
    } finally { setBusy(false); }
  };

  const toggleLike = async (post) => {
    if (!user) return login();
    try {
      if (post.is_liked) await cutinappService.unlikeProductionPost(post.id);
      else await cutinappService.likeProductionPost(post.id);
      await load(1, false);
    } catch (err) { setMessage({ type: "danger", text: err?.message || "Não foi possível atualizar a curtida." }); }
  };

  const remove = async (postId) => {
    if (!window.confirm("Remover esta publicação e suas respostas?")) return;
    setBusy(true);
    try { await cutinappService.deleteProductionPost(postId); await load(1, false); }
    catch (err) { setMessage({ type: "danger", text: err?.message || "Não foi possível remover a publicação." }); }
    finally { setBusy(false); }
  };

  return <section className="cut-community cut-production-community" id="comunidade">
    <div className="cut-community__head"><div><span className="cut-eyebrow">Comunidade</span><h2>Conversa sobre {production.name}</h2><p>Tire dúvidas, combine encontros e converse com pessoas que acompanham esta produção.</p></div></div>
    {message && <Alert variant={message.type} dismissible onClose={() => setMessage(null)}>{message.text}</Alert>}
    <div className="cut-community__composer"><div className="cut-community-avatar">{user ? initials(user) : <i className="fa-regular fa-user" />}</div><div className="cut-community__composer-body"><Form.Control as="textarea" rows={3} value={body} maxLength={3000} onChange={(e) => setBody(e.target.value)} placeholder={user ? `Publique algo sobre ${production.name}...` : "Entre para participar da conversa"} onFocus={() => { if (!user) login(); }} /><div><small>{body.length}/3000</small><Button disabled={busy || body.trim().length < 2} onClick={() => publish()}>{busy ? "Publicando..." : "Publicar"}</Button></div></div></div>
    {loading ? <div className="cut-community-loading"><span /><span /><span /></div> : posts.length === 0 ? <div className="cut-community-empty"><i className="fa-regular fa-comments" /><strong>A conversa ainda não começou</strong><span>Seja a primeira pessoa a publicar algo sobre esta produção.</span></div> : <div className="cut-community-list">{posts.map((post) => <article className="cut-community-post" key={post.id}>
      <div className="cut-community-avatar">{post.avatar ? <img src={post.avatar} alt="" /> : initials(post)}</div><div className="cut-community-post__content"><header><div><strong>{[post.first_name, post.last_name].filter(Boolean).join(" ") || "Participante"}</strong>{post.is_pinned ? <span className="cut-community-pin"><i className="fa-solid fa-thumbtack" /> Destaque</span> : null}</div><time>{fmt(post.created_at)}</time></header><p>{post.body}</p><div className="cut-community-post__actions"><button type="button" className={post.is_liked ? "active" : ""} onClick={() => toggleLike(post)}><i className={`${post.is_liked ? "fa-solid" : "fa-regular"} fa-heart`} /> {post.likes_count || 0}</button><button type="button" onClick={() => user ? setReplyTo(replyTo === post.id ? null : post.id) : login()}><i className="fa-regular fa-comment" /> {post.comments_count || 0} Responder</button>{user && (Number(post.user_id) === Number(user.id) || isOwner) && <button type="button" className="danger" onClick={() => remove(post.id)}><i className="fa-regular fa-trash-can" /> Remover</button>}</div>
      {replyTo === post.id && <div className="cut-community-replybox"><Form.Control as="textarea" rows={2} value={replyBody} maxLength={3000} onChange={(e) => setReplyBody(e.target.value)} placeholder="Escreva sua resposta..." /><div><Button variant="outline-light" size="sm" onClick={() => { setReplyTo(null); setReplyBody(""); }}>Cancelar</Button><Button size="sm" disabled={busy || replyBody.trim().length < 2} onClick={() => publish(post.id)}>Responder</Button></div></div>}
      {post.replies?.length > 0 && <div className="cut-community-replies">{post.replies.map((reply) => <div className="cut-community-reply" key={reply.id}><div className="cut-community-avatar cut-community-avatar--sm">{reply.avatar ? <img src={reply.avatar} alt="" /> : initials(reply)}</div><div><header><strong>{[reply.first_name, reply.last_name].filter(Boolean).join(" ") || "Participante"}</strong><time>{fmt(reply.created_at)}</time></header><p>{reply.body}</p><div className="cut-community-post__actions"><button type="button" className={reply.is_liked ? "active" : ""} onClick={() => toggleLike(reply)}><i className={`${reply.is_liked ? "fa-solid" : "fa-regular"} fa-heart`} /> {reply.likes_count || 0}</button>{user && (Number(reply.user_id) === Number(user.id) || isOwner) && <button type="button" className="danger" onClick={() => remove(reply.id)}>Remover</button>}</div></div></div>)}</div>}</div>
    </article>)}</div>}
    {community?.posts?.current_page < community?.posts?.last_page && <div className="cut-community-pagination"><Button variant="outline-light" disabled={moreLoading} onClick={() => load((community.posts.current_page || 1) + 1, true)}>{moreLoading ? "Carregando..." : "Carregar mais publicações"}</Button></div>}
  </section>;
}

ProductionCommunitySection.propTypes = { production: PropTypes.shape({ id: PropTypes.number.isRequired, slug: PropTypes.string.isRequired, name: PropTypes.string.isRequired }).isRequired, isOwner: PropTypes.bool };
