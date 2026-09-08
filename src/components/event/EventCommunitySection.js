import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { Alert, Button, Form, Modal } from "react-bootstrap";
import { useLocation, useNavigate } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import cutinappService from "../../services/CutinappService";
import EventRideSection from "./EventRideSection";

const REPORT_REASONS = [
  ["fraud", "Fraude ou golpe"],
  ["misleading", "Informações enganosas ou evento inexistente"],
  ["safety", "Risco à segurança"],
  ["illegal", "Atividade ou conteúdo ilegal"],
  ["hate", "Ódio ou discriminação"],
  ["harassment", "Assédio"],
  ["spam", "Spam"],
  ["copyright", "Violação de direitos autorais"],
  ["other", "Outro motivo"],
];

const fmt = (value) => value ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(value)) : "";
const initials = (item) => `${item?.first_name?.[0] || "U"}${item?.last_name?.[0] || ""}`.toUpperCase();
const displayName = (item) => [item?.first_name, item?.last_name].filter(Boolean).join(" ") || "Participante";

export default function EventCommunitySection({ event, isOwner = false }) {
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
  const [reportOpen, setReportOpen] = useState(false);
  const [report, setReport] = useState({ reason: "", details: "" });

  const login = () => navigate("/login", { state: { from: `${location.pathname}${location.search}#comunidade` } });
  const openProfile = (item) => {
    const targetUserId = Number(item?.user_id ?? item?.id);
    if (!targetUserId) return;
    navigate(user && Number(user.id) === targetUserId ? "/profile" : `/profile/${targetUserId}`);
  };

  const load = useCallback(async (page = 1, append = false) => {
    append ? setMoreLoading(true) : setLoading(true);
    try {
      const response = await cutinappService.eventCommunity(event.slug, { page, per_page: 10 });
      setCommunity((current) => {
        if (!append || !current) return response;
        const oldPosts = current.posts?.data || [];
        const newPosts = response.posts?.data || [];
        return {
          ...response,
          posts: {
            ...response.posts,
            data: [...oldPosts, ...newPosts.filter((item) => !oldPosts.some((old) => old.id === item.id))],
          },
        };
      });
    } catch (err) {
      setMessage({ type: "danger", text: err?.message || "Não foi possível carregar a conversa deste evento." });
    } finally {
      setLoading(false);
      setMoreLoading(false);
    }
  }, [event.slug]);

  useEffect(() => { load(1, false); }, [load]);

  const posts = community?.posts?.data || [];
  const rating = community?.rating || { average: 0, total: 0, mine: null };
  const stars = useMemo(() => [1, 2, 3, 4, 5], []);
  const refresh = () => load(1, false);

  const publish = async (parentId = null) => {
    if (!user) return login();
    const text = parentId ? replyBody.trim() : body.trim();
    if (text.length < 2) return;
    setBusy(true); setMessage(null);
    try {
      await cutinappService.createEventPost(event.id, { body: text, parent_id: parentId || undefined });
      if (parentId) { setReplyBody(""); setReplyTo(null); } else setBody("");
      setMessage({ type: "success", text: parentId ? "Comentário publicado." : "Sua publicação entrou na conversa." });
      await refresh();
    } catch (err) { setMessage({ type: "danger", text: err?.message || "Não foi possível publicar agora." }); }
    finally { setBusy(false); }
  };

  const rate = async (value) => {
    if (!user) return login();
    setBusy(true); setMessage(null);
    try {
      await cutinappService.rateEvent(event.id, value);
      setCommunity((current) => ({ ...current, rating: { ...(current?.rating || {}), mine: value } }));
      setMessage({ type: "success", text: "Sua avaliação foi registrada." });
      await refresh();
    } catch (err) { setMessage({ type: "danger", text: err?.message || "Não foi possível avaliar este evento." }); }
    finally { setBusy(false); }
  };

  const toggleLike = async (post) => {
    if (!user) return login();
    try {
      if (post.is_liked) await cutinappService.unlikeEventPost(post.id); else await cutinappService.likeEventPost(post.id);
      await refresh();
    } catch (err) { setMessage({ type: "danger", text: err?.message || "Não foi possível atualizar a curtida." }); }
  };

  const remove = async (postId) => {
    if (!window.confirm("Remover esta publicação e suas respostas?")) return;
    setBusy(true);
    try { await cutinappService.deleteEventPost(postId); await refresh(); }
    catch (err) { setMessage({ type: "danger", text: err?.message || "Não foi possível remover a publicação." }); }
    finally { setBusy(false); }
  };

  const sendReport = async () => {
    if (!user) { setReportOpen(false); return login(); }
    if (!report.reason) return;
    setBusy(true); setMessage(null);
    try {
      const response = await cutinappService.reportEvent(event.id, report);
      setReportOpen(false); setReport({ reason: "", details: "" });
      setMessage({ type: "success", text: response?.message || "Denúncia enviada para análise." });
      await refresh();
    } catch (err) { setMessage({ type: "danger", text: err?.message || "Não foi possível enviar a denúncia." }); }
    finally { setBusy(false); }
  };

  const avatarButton = (item, small = false) => <button
    type="button"
    className={`cut-community-avatar${small ? " cut-community-avatar--sm" : ""}`}
    onClick={() => openProfile(item)}
    aria-label={`Abrir perfil de ${displayName(item)}`}
    title={`Ver perfil de ${displayName(item)}`}
    style={{ border: 0, padding: 0, cursor: "pointer" }}
  >{item?.avatar ? <img src={item.avatar} alt={displayName(item)} /> : initials(item)}</button>;

  const nameButton = (item) => <button
    type="button"
    onClick={() => openProfile(item)}
    title={`Ver perfil de ${displayName(item)}`}
    style={{ appearance: "none", border: 0, padding: 0, background: "transparent", color: "inherit", font: "inherit", fontWeight: 700, cursor: "pointer", textAlign: "left" }}
  >{displayName(item)}</button>;

  return <>
    <EventRideSection event={event} />
    <section className="cut-community" id="comunidade">
      <div className="cut-community__head">
        <div><span className="cut-eyebrow">Comunidade</span><h2>Conversa sobre o evento</h2><p>Combine encontros, tire dúvidas e compartilhe expectativas com quem também está acompanhando.</p></div>
        <Button variant="outline-danger" className="cut-report-button" onClick={() => user ? setReportOpen(true) : login()}><i className="fa-regular fa-flag me-2" />Denunciar evento</Button>
      </div>

      {message && <Alert variant={message.type} dismissible onClose={() => setMessage(null)}>{message.text}</Alert>}

      <div className="cut-rating-panel">
        <div><strong>{rating.total ? Number(rating.average).toFixed(1) : "Novo"}</strong><span>{rating.total ? `${rating.total} avaliação${rating.total === 1 ? "" : "ões"}` : "Seja a primeira pessoa a avaliar"}</span></div>
        <div className="cut-rating-stars" aria-label="Avaliar evento de 1 a 5 estrelas">{stars.map((value) => <button key={value} type="button" disabled={busy} className={Number(rating.mine) >= value ? "active" : ""} onClick={() => rate(value)} aria-label={`${value} estrela${value > 1 ? "s" : ""}`}><i className="fa-solid fa-star" /></button>)}</div>
        {rating.mine && <small>Sua nota: {rating.mine}/5</small>}
      </div>

      <div className="cut-community__composer">
        {user ? <button type="button" className="cut-community-avatar" onClick={() => navigate("/profile")} aria-label="Abrir meu perfil" title="Abrir meu perfil" style={{ border: 0, padding: 0, cursor: "pointer" }}>{user.avatar ? <img src={user.avatar} alt={displayName(user)} /> : initials(user)}</button> : <div className="cut-community-avatar"><i className="fa-regular fa-user" /></div>}
        <div className="cut-community__composer-body">
          <Form.Control as="textarea" rows={3} value={body} maxLength={3000} onChange={(e) => setBody(e.target.value)} placeholder={user ? "Publique algo sobre este evento..." : "Entre para participar da conversa"} onFocus={() => { if (!user) login(); }} />
          <div><small>{body.length}/3000</small><Button disabled={busy || body.trim().length < 2} onClick={() => publish()}>{busy ? "Publicando..." : "Publicar"}</Button></div>
        </div>
      </div>

      {loading ? <div className="cut-community-loading"><span /><span /><span /></div> : posts.length === 0 ? <div className="cut-community-empty"><i className="fa-regular fa-comments" /><strong>A conversa ainda não começou</strong><span>Seja a primeira pessoa a publicar algo sobre este evento.</span></div> : <div className="cut-community-list">{posts.map((post) => <article className="cut-community-post" key={post.id}>
        {avatarButton(post)}
        <div className="cut-community-post__content">
          <header><div>{nameButton(post)}{post.is_pinned ? <span className="cut-community-pin"><i className="fa-solid fa-thumbtack" /> Destaque</span> : null}</div><time>{fmt(post.created_at)}{post.edited_at ? " · editado" : ""}</time></header>
          <p>{post.body}</p>
          <div className="cut-community-post__actions"><button type="button" className={post.is_liked ? "active" : ""} onClick={() => toggleLike(post)}><i className={`${post.is_liked ? "fa-solid" : "fa-regular"} fa-heart`} /> {post.likes_count || 0}</button><button type="button" onClick={() => user ? setReplyTo(replyTo === post.id ? null : post.id) : login()}><i className="fa-regular fa-comment" /> {post.comments_count || 0} Responder</button>{user && (Number(post.user_id) === Number(user.id) || isOwner) && <button type="button" className="danger" onClick={() => remove(post.id)}><i className="fa-regular fa-trash-can" /> Remover</button>}</div>
          {replyTo === post.id && <div className="cut-community-replybox"><Form.Control as="textarea" rows={2} value={replyBody} maxLength={3000} onChange={(e) => setReplyBody(e.target.value)} placeholder="Escreva sua resposta..." /><div><Button variant="outline-light" size="sm" onClick={() => { setReplyTo(null); setReplyBody(""); }}>Cancelar</Button><Button size="sm" disabled={busy || replyBody.trim().length < 2} onClick={() => publish(post.id)}>Responder</Button></div></div>}
          {post.replies?.length > 0 && <div className="cut-community-replies">{post.replies.map((reply) => <div className="cut-community-reply" key={reply.id}>{avatarButton(reply, true)}<div><header>{nameButton(reply)}<time>{fmt(reply.created_at)}</time></header><p>{reply.body}</p><div className="cut-community-post__actions"><button type="button" className={reply.is_liked ? "active" : ""} onClick={() => toggleLike(reply)}><i className={`${reply.is_liked ? "fa-solid" : "fa-regular"} fa-heart`} /> {reply.likes_count || 0}</button>{user && (Number(reply.user_id) === Number(user.id) || isOwner) && <button type="button" className="danger" onClick={() => remove(reply.id)}>Remover</button>}</div></div></div>)}</div>}
        </div>
      </article>)}</div>}

      {community?.posts?.current_page < community?.posts?.last_page && <div className="cut-community-pagination"><Button variant="outline-light" disabled={moreLoading} onClick={() => load((community.posts.current_page || 1) + 1, true)}>{moreLoading ? "Carregando..." : "Carregar mais publicações"}</Button></div>}

      <Modal show={reportOpen} onHide={() => setReportOpen(false)} centered className="cut-modal">
        <Modal.Header closeButton><Modal.Title>Denunciar evento</Modal.Title></Modal.Header>
        <Modal.Body><p className="text-secondary">Use este canal para conteúdos, informações ou situações que possam prejudicar participantes ou a plataforma.</p><Form.Group className="mb-3"><Form.Label>Motivo *</Form.Label><Form.Select value={report.reason} onChange={(e) => setReport((current) => ({ ...current, reason: e.target.value }))}><option value="">Selecione</option>{REPORT_REASONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Form.Select></Form.Group><Form.Group><Form.Label>Detalhes</Form.Label><Form.Control as="textarea" rows={5} maxLength={3000} value={report.details} onChange={(e) => setReport((current) => ({ ...current, details: e.target.value }))} placeholder="Explique o problema. Não inclua dados pessoais desnecessários." /><Form.Text>{report.details.length}/3000</Form.Text></Form.Group></Modal.Body>
        <Modal.Footer><Button variant="outline-light" onClick={() => setReportOpen(false)}>Cancelar</Button><Button variant="danger" disabled={busy || !report.reason} onClick={sendReport}>{busy ? "Enviando..." : "Enviar denúncia"}</Button></Modal.Footer>
      </Modal>
    </section>
  </>;
}

EventCommunitySection.propTypes = {
  event: PropTypes.shape({ id: PropTypes.number.isRequired, slug: PropTypes.string.isRequired }).isRequired,
  isOwner: PropTypes.bool,
};