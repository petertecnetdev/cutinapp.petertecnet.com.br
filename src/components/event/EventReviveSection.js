import React, { useCallback, useContext, useEffect, useState } from "react";
import PropTypes from "prop-types";
import { Alert, Badge, Button, Form, Modal } from "react-bootstrap";
import { useLocation, useNavigate } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import cutinappService from "../../services/CutinappService";
import "./EventReviveSection.css";

const stars = [1, 2, 3, 4, 5];
const nameOf = (item) => [item?.first_name, item?.last_name].filter(Boolean).join(" ") || item?.user_name || "Participante";
const initialsOf = (item) => ((item?.first_name?.[0] || "U") + (item?.last_name?.[0] || "")).toUpperCase();
const fmt = (value) => value ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "";
const track = (type, event, metadata) => {
  try { window.PeterTecnetTelemetry?.track?.(type, { label: "Reviva o evento", target: String(event?.id || ""), metadata: { event_id: Number(event?.id || 0), ...(metadata || {}) } }); } catch (_) {}
};

function Stars({ value, onChange, disabled, compact, label }) {
  return <div className={"cut-revive-stars" + (compact ? " cut-revive-stars--compact" : "")} aria-label={label || "Nota"}>
    {stars.map((star) => <button key={star} type="button" disabled={disabled} className={Number(value) >= star ? "active" : ""} onClick={() => onChange(star)} aria-label={String(star) + " estrelas"}>
      <i className="fa-solid fa-star" />
    </button>)}
  </div>;
}
Stars.propTypes = { value: PropTypes.number, onChange: PropTypes.func.isRequired, disabled: PropTypes.bool, compact: PropTypes.bool, label: PropTypes.string };

export default function EventReviveSection({ event, isOwner }) {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [postText, setPostText] = useState("");
  const [replyId, setReplyId] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [files, setFiles] = useState([]);
  const [caption, setCaption] = useState("");
  const [lightbox, setLightbox] = useState(null);
  const [responses, setResponses] = useState({});
  const [moderation, setModeration] = useState(null);
  const [moderationOpen, setModerationOpen] = useState(false);
  const [review, setReview] = useState({ rating: 0, organization_rating: 0, service_rating: 0, music_rating: 0, value_rating: 0, comment: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await cutinappService.eventCommunity(event.slug, { per_page: 30 })); }
    catch (err) { setNotice({ type: "danger", text: err?.message || "Não foi possível carregar o Reviva." }); }
    finally { setLoading(false); }
  }, [event.slug]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!data || typeof document === "undefined") return undefined;
    const id = "cut-revive-schema-" + event.id;
    document.getElementById(id)?.remove();
    const schema = {
      "@context": "https://schema.org",
      "@type": "Event",
      name: event.title,
      startDate: event.start_date || undefined,
      endDate: event.end_date || undefined,
      eventStatus: "https://schema.org/EventCompleted",
      image: (data.revive?.gallery || []).slice(0, 6).map((item) => item.url).filter(Boolean),
      aggregateRating: Number(data.rating?.total || 0) > 0 ? {
        "@type": "AggregateRating",
        ratingValue: Number(data.rating.average || 0),
        ratingCount: Number(data.rating.total || 0),
        bestRating: 5,
        worstRating: 1,
      } : undefined,
      review: (data.reviews || []).filter((item) => item.comment).slice(0, 10).map((item) => ({
        "@type": "Review",
        reviewRating: { "@type": "Rating", ratingValue: Number(item.rating), bestRating: 5, worstRating: 1 },
        author: { "@type": "Person", name: nameOf(item) },
        reviewBody: item.comment,
      })),
    };
    const script = document.createElement("script");
    script.id = id;
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(schema);
    document.head.appendChild(script);
    return () => document.getElementById(id)?.remove();
  }, [data, event.end_date, event.id, event.start_date, event.title]);

  useEffect(() => {
    const mine = data?.rating?.mine;
    if (!mine) return;
    setReview({
      rating: Number(mine.rating || 0),
      organization_rating: Number(mine.organization_rating || 0),
      service_rating: Number(mine.service_rating || 0),
      music_rating: Number(mine.music_rating || 0),
      value_rating: Number(mine.value_rating || 0),
      comment: mine.comment || "",
    });
  }, [data?.rating?.mine]);

  const revive = data?.revive || {};
  const access = data?.access || {};
  const rating = data?.rating || {};
  const attendance = revive.attendance || {};
  const gallery = revive.gallery || [];
  const reviews = data?.reviews || [];
  const posts = data?.posts?.data || [];
  const isManager = Boolean(access.is_manager || isOwner);
  const verified = Boolean(access.is_verified_attendee);
  const canInteract = Boolean(access.can_interact);
  const canRate = Boolean(access.can_rate);
  const canUpload = Boolean(access.can_upload);
  const login = () => navigate("/login", { state: { from: location.pathname + location.search + "#reviva" } });

  const avatar = (item, small) => <button type="button" className={"cut-revive-avatar" + (small ? " cut-revive-avatar--sm" : "")} onClick={() => {
    const id = Number(item?.user_id ?? item?.id);
    if (id) navigate(user && Number(user.id) === id ? "/profile" : "/profile/" + id);
  }}>
    {item?.avatar ? <img src={item.avatar} alt={nameOf(item)} loading="lazy" /> : initialsOf(item)}
  </button>;

  const publish = async (parentId) => {
    if (!user) return login();
    if (!canInteract) return setNotice({ type: "warning", text: "Só quem participou deste evento pode interagir no Reviva." });
    const body = String(parentId ? replyText : postText).trim();
    if (body.length < 2) return;
    setBusy(true);
    try {
      await cutinappService.createEventPost(event.id, { body, parent_id: parentId || undefined });
      if (parentId) { setReplyId(null); setReplyText(""); } else setPostText("");
      track(parentId ? "event_revive_reply_created" : "event_revive_post_created", event);
      await load();
    } catch (err) { setNotice({ type: "danger", text: err?.message || "Não foi possível publicar." }); }
    finally { setBusy(false); }
  };

  const toggleLike = async (post) => {
    if (!user) return login();
    if (!canInteract) return;
    try {
      if (post.is_liked) await cutinappService.unlikeEventPost(post.id);
      else await cutinappService.likeEventPost(post.id);
      await load();
    } catch (err) { setNotice({ type: "danger", text: err?.message || "Não foi possível atualizar a reação." }); }
  };

  const removePost = async (post) => {
    if (!window.confirm("Remover esta publicação?")) return;
    try { await cutinappService.deleteEventPost(post.id); await load(); }
    catch (err) { setNotice({ type: "danger", text: err?.message || "Não foi possível remover." }); }
  };

  const upload = async () => {
    if (!user) return login();
    if (!canUpload || !files.length) return;
    const form = new FormData();
    files.slice(0, 12).forEach((file) => form.append("files[]", file));
    if (caption.trim()) form.append("caption", caption.trim());
    setBusy(true);
    try {
      await cutinappService.uploadEventReviveMedia(event.id, form);
      setFiles([]); setCaption("");
      setNotice({ type: "success", text: "Momentos publicados." });
      track("event_revive_media_uploaded", event, { files: files.length });
      await load();
    } catch (err) { setNotice({ type: "danger", text: err?.message || "Não foi possível publicar as imagens." }); }
    finally { setBusy(false); }
  };

  const removeMedia = async (media) => {
    if (!window.confirm("Remover esta imagem do Reviva?")) return;
    setBusy(true);
    try { await cutinappService.deleteEventReviveMedia(event.id, media.id); setLightbox(null); await load(); }
    catch (err) { setNotice({ type: "danger", text: err?.message || "Não foi possível remover a imagem." }); }
    finally { setBusy(false); }
  };

  const featureMedia = async (media) => {
    setBusy(true);
    try { await cutinappService.updateEventReviveMedia(event.id, media.id, { is_primary: true }); await load(); }
    catch (err) { setNotice({ type: "danger", text: err?.message || "Não foi possível destacar a imagem." }); }
    finally { setBusy(false); }
  };

  const saveReview = async () => {
    if (!user) return login();
    if (!canRate) return setNotice({ type: "warning", text: "Somente participantes verificados podem avaliar." });
    if (!review.rating) return setNotice({ type: "warning", text: "Escolha sua nota geral." });
    const payload = { rating: review.rating, comment: review.comment.trim() || undefined };
    ["organization_rating", "service_rating", "music_rating", "value_rating"].forEach((key) => { if (Number(review[key]) > 0) payload[key] = Number(review[key]); });
    setBusy(true);
    try { await cutinappService.rateEvent(event.id, payload); track("event_revive_review_created", event, { rating: review.rating }); await load(); }
    catch (err) { setNotice({ type: "danger", text: err?.message || "Não foi possível avaliar." }); }
    finally { setBusy(false); }
  };

  const helpful = async (item) => {
    if (!canInteract) return;
    try {
      if (item.is_helpful) await cutinappService.unmarkEventRatingHelpful(event.id, item.user_id);
      else await cutinappService.markEventRatingHelpful(event.id, item.user_id);
      await load();
    } catch (err) { setNotice({ type: "danger", text: err?.message || "Não foi possível atualizar esta avaliação." }); }
  };

  const respond = async (item) => {
    const response = String(responses[item.user_id] || "").trim();
    if (response.length < 2) return;
    setBusy(true);
    try { await cutinappService.respondEventRating(event.id, item.user_id, response); setResponses((current) => ({ ...current, [item.user_id]: "" })); await load(); }
    catch (err) { setNotice({ type: "danger", text: err?.message || "Não foi possível responder." }); }
    finally { setBusy(false); }
  };

  const preference = async (patch) => {
    setBusy(true);
    try {
      await cutinappService.saveEventRevivePreferences(event.id, {
        show_attendance: revive.preferences?.show_attendance ?? false,
        notify_next: revive.preferences?.notify_next ?? true,
        ...patch,
      });
      await load();
    } catch (err) { setNotice({ type: "danger", text: err?.message || "Não foi possível salvar sua preferência." }); }
    finally { setBusy(false); }
  };

  const reportContent = async (targetType, targetId) => {
    if (!user) return login();
    const details = window.prompt("Descreva rapidamente o problema com este conteúdo:");
    if (details === null) return;
    try {
      await cutinappService.reportEvent(event.id, {
        reason: "inappropriate",
        details: String(details || "").trim() || undefined,
        target_type: targetType,
        target_id: Number(targetId),
      });
      setNotice({ type: "success", text: "Conteúdo enviado para moderação." });
      track("event_revive_content_reported", event, { target_type: targetType, target_id: Number(targetId) });
    } catch (err) {
      setNotice({ type: "danger", text: err?.message || "Não foi possível enviar a denúncia." });
    }
  };

  const loadModeration = async () => {
    if (!isManager) return;
    setBusy(true);
    try {
      const response = await cutinappService.eventReviveModeration(event.id, { per_page: 50 });
      setModeration(response.reports || null);
      setModerationOpen(true);
    } catch (err) {
      setNotice({ type: "danger", text: err?.message || "Não foi possível abrir a moderação." });
    } finally { setBusy(false); }
  };

  const moderate = async (item, status, hideContent) => {
    setBusy(true);
    try {
      await cutinappService.moderateEventReviveContent(event.id, item.id, {
        status,
        hide_content: Boolean(hideContent),
      });
      await loadModeration();
      await load();
    } catch (err) {
      setNotice({ type: "danger", text: err?.message || "Não foi possível concluir a moderação." });
    } finally { setBusy(false); }
  };

  const nextEvent = () => {
    if (!revive.next_event?.slug) return;
    const query = new URLSearchParams({ source_event_id: String(event.id), conversion_source: "post_event" });
    track("event_revive_next_event_clicked", event, { target_event_id: Number(revive.next_event.id || 0) });
    navigate("/event/" + revive.next_event.slug + "?" + query.toString());
  };

  const follow = async () => {
    if (!user) return login();
    const id = Number(event.production_id || event.production?.id || 0);
    if (!id) return;
    try { await cutinappService.follow("production", id); setNotice({ type: "success", text: "Produção seguida." }); track("event_revive_production_followed", event, { production_id: id }); }
    catch (err) { setNotice({ type: "info", text: Number(err?.status || 0) === 409 ? "Você já segue esta produção." : (err?.message || "Não foi possível seguir.") }); }
  };

  const shareMoment = async (media) => {
    const params = new URLSearchParams();
    params.set('moment', String(media.id));
    const url = window.location.origin + location.pathname + '?' + params.toString() + '#reviva';
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Momento de ' + event.title,
          text: media.caption || 'Veja este momento no Reviva da Cutinapp.',
          url,
        });
      } else {
        await navigator.clipboard?.writeText?.(url);
        setNotice({ type: 'success', text: 'Link do momento copiado.' });
      }
      track('event_revive_moment_shared', event, { file_id: Number(media.id) });
    } catch (_) {}
  };

  const openRelated = (related) => {
    const query = new URLSearchParams({
      source_event_id: String(event.id),
      conversion_source: 'recommendation',
    });
    track('event_revive_related_event_clicked', event, { target_event_id: Number(related.id || 0) });
    navigate('/event/' + related.slug + '?' + query.toString());
  };

  const share = async () => {
    const url = window.location.origin + location.pathname + "#reviva";
    try {
      if (navigator.share) await navigator.share({ title: "Reviva " + event.title, text: "Veja como foi este evento na Cutinapp.", url });
      else { await navigator.clipboard?.writeText?.(url); setNotice({ type: "success", text: "Link copiado." }); }
      track("event_revive_shared", event);
    } catch (_) {}
  };

  if (loading) return <section id="reviva" className="cut-revive"><div className="cut-revive-loading">Carregando memórias...</div></section>;

  return <section id="reviva" className="cut-revive">
    <div className="cut-revive-hero">
      <div>
        <span className="cut-eyebrow">Reviva este evento</span>
        <h2>{revive.headline || "Só quem foi sabe."}</h2>
        <p>{verified || isManager ? "As luzes apagaram, mas a conversa continua. Compartilhe momentos e conte como foi." : "Veja os momentos de quem viveu essa edição. A conversa é exclusiva de participantes verificados."}</p>
        <div className="cut-revive-badges">
          {verified && <Badge bg="success">Participante verificado</Badge>}
          {access.presence_confirmed && <Badge bg="info" text="dark">Presença confirmada</Badge>}
          {isManager && <Badge bg="warning" text="dark">Produção</Badge>}
          {(revive.event_badges || []).map((item) => <Badge bg="dark" key={item.key}>{item.label}</Badge>)}
        </div>
      </div>
      <div className="cut-revive-hero__actions"><Button variant="outline-light" onClick={share}>Compartilhar</Button><Button variant="outline-light" onClick={follow}>Seguir produção</Button></div>
    </div>

    {notice && <Alert variant={notice.type} dismissible onClose={() => setNotice(null)}>{notice.text}</Alert>}

    <div className="cut-revive-metrics">
      <div><strong>{rating.total ? Number(rating.average).toFixed(1) : "—"} <i className="fa-solid fa-star" /></strong><span>{rating.total || 0} avaliações</span></div>
      <div><strong>{attendance.verified || 0}</strong><span>participantes verificados</span></div>
      <div><strong>{attendance.checked_in || 0}</strong><span>presenças confirmadas</span></div>
      <div><strong>{gallery.length}</strong><span>momentos</span></div>
    </div>

    {!canInteract && <div className="cut-revive-locked"><i className="fa-solid fa-lock" /><div><strong>Essa conversa é exclusiva de quem participou.</strong><p>Ingresso pago ou cortesia pela Cutinapp libera comentários, avaliações, reações e momentos.</p></div>{revive.next_event ? <Button onClick={nextEvent}>Não fique de fora da próxima</Button> : <Button variant="outline-light" onClick={follow}>Me avise da próxima</Button>}</div>}

    <header className="cut-revive-section-head"><div><span className="cut-eyebrow">Momentos</span><h3>Veja como foi</h3><p>Fotos oficiais e registros de quem participou.</p></div></header>
    {canUpload && <div className="cut-revive-uploader">
      <strong>{isManager ? "Publique os melhores momentos" : "Você estava aqui? Compartilhe seu momento."}</strong>
      <Form.Control type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0, 12))} />
      {files.length > 0 && <><Form.Control as="textarea" rows={2} maxLength={180} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Legenda..." /><Button disabled={busy} onClick={upload}>Publicar {files.length} imagem(ns)</Button></>}
    </div>}
    {gallery.length > 0 ? <div className="cut-revive-gallery">{gallery.map((media) => <article key={media.id} className={"cut-revive-gallery__item" + (media.is_primary ? " is-primary" : "")}>
      <button type="button" onClick={() => setLightbox(media)}><img src={media.url} alt={media.caption || "Momento do evento"} loading="lazy" /></button>
      {media.is_primary && <Badge bg="warning" text="dark">Destaque</Badge>}
      {media.caption && <p>{media.caption}</p>}
      <div className="cut-revive-inline-actions"><button type="button" onClick={() => shareMoment(media)}>Compartilhar</button>{(isManager || Number(media.created_by) === Number(user?.id)) && <>{isManager && !media.is_primary && <button type="button" onClick={() => featureMedia(media)}>Destacar</button>}<button type="button" className="danger" onClick={() => removeMedia(media)}>Remover</button></>}{user && Number(media.created_by) !== Number(user.id) && <button type="button" onClick={() => reportContent("media", media.id)}>Denunciar</button>}</div>
    </article>)}</div> : <div className="cut-revive-empty">Os primeiros momentos ainda vão aparecer aqui.</div>}

    <div className="cut-revive-grid">
      <div className="cut-revive-card"><span className="cut-eyebrow">Sua experiência</span><h3>O que você achou?</h3>
        {canRate ? <div className="cut-revive-review-form">
          <label>Nota geral</label><Stars value={review.rating} onChange={(v) => setReview((r) => ({ ...r, rating: v }))} disabled={busy} />
          <div className="cut-revive-dimensions">{[["organization_rating", "Organização"], ["service_rating", "Atendimento"], ["music_rating", "Música e atrações"], ["value_rating", "Custo-benefício"]].map(([key, label]) => <div key={key}><span>{label}</span><Stars compact label={label} value={review[key]} onChange={(v) => setReview((r) => ({ ...r, [key]: v }))} disabled={busy} /></div>)}</div>
          <Form.Control as="textarea" rows={4} maxLength={2000} value={review.comment} onChange={(e) => setReview((r) => ({ ...r, comment: e.target.value }))} placeholder="Conte como foi sua experiência..." />
          <Button disabled={busy || !review.rating} onClick={saveReview}>{rating.mine ? "Atualizar avaliação" : "Publicar avaliação"}</Button>
        </div> : <div className="cut-revive-mini-lock"><strong>Avaliações verificadas</strong><span>Somente quem adquiriu ingresso ou cortesia pode avaliar.</span></div>}
      </div>

      <div className="cut-revive-card"><span className="cut-eyebrow">Privacidade</span><h3>Quem esteve aqui</h3><p>Seu perfil só aparece se você autorizar.</p>
        <div className="cut-revive-people">{(attendance.visible_people || []).map((person) => <React.Fragment key={person.id}>{avatar(person)}</React.Fragment>)}</div>
        {verified && revive.preferences && <div className="cut-revive-preferences">
          <Form.Check type="switch" id={"revive-show-" + event.id} checked={Boolean(revive.preferences.show_attendance)} disabled={busy} onChange={(e) => preference({ show_attendance: e.target.checked })} label="Mostrar meu perfil em Quem esteve aqui" />
          <Form.Check type="switch" id={"revive-notify-" + event.id} checked={Boolean(revive.preferences.notify_next)} disabled={busy} onChange={(e) => preference({ notify_next: e.target.checked })} label="Quero acompanhar a próxima edição" />
        </div>}
        {revive.achievements?.length > 0 && <div className="cut-revive-achievements">{revive.achievements.map((item) => <Badge bg="dark" key={item.key}>{item.label}</Badge>)}</div>}
      </div>
    </div>

    <header className="cut-revive-section-head"><div><span className="cut-eyebrow">O que a galera achou</span><h3>Avaliações verificadas</h3></div></header>
    <div className="cut-revive-reviews">{reviews.length ? reviews.map((item) => <article key={item.user_id} className="cut-revive-review">
      <div className="cut-revive-review__author">{avatar(item)}<div><strong>{nameOf(item)}</strong><small>{item.presence_confirmed ? "Presença confirmada" : "Participante verificado"}</small></div><b>{item.rating} <i className="fa-solid fa-star" /></b></div>
      {item.comment && <p>{item.comment}</p>}<div className="cut-revive-review__meta"><span>{fmt(item.updated_at || item.created_at)}</span><div>{Number(item.user_id) !== Number(user?.id) && <button type="button" disabled={!canInteract} className={item.is_helpful ? "active" : ""} onClick={() => helpful(item)}>Útil {item.helpful_count || 0}</button>}{user && Number(item.user_id) !== Number(user.id) && <button type="button" onClick={() => reportContent("rating", item.user_id)}>Denunciar</button>}</div></div>
      {item.producer_response && <div className="cut-revive-producer-response"><strong>Resposta da produção</strong><p>{item.producer_response}</p></div>}
      {isManager && <div className="cut-revive-response-form"><Form.Control as="textarea" rows={2} value={responses[item.user_id] || ""} onChange={(e) => setResponses((r) => ({ ...r, [item.user_id]: e.target.value }))} placeholder="Responder como produção..." /><Button size="sm" disabled={busy} onClick={() => respond(item)}>Responder</Button></div>}
    </article>) : <div className="cut-revive-empty">Ainda não há avaliações.</div>}</div>

    <header className="cut-revive-section-head"><div><span className="cut-eyebrow">Só quem foi sabe</span><h3>Conversa pós-evento</h3></div></header>
    {canInteract && <div className="cut-revive-composer">{avatar(user)}<div><Form.Control as="textarea" rows={3} maxLength={3000} value={postText} onChange={(e) => setPostText(e.target.value)} placeholder="Conte uma história ou diga o que mais curtiu..." /><Button disabled={busy || postText.trim().length < 2} onClick={() => publish(null)}>Publicar</Button></div></div>}
    <div className="cut-revive-posts">{posts.length ? posts.map((post) => <article key={post.id} className="cut-revive-post">
      {avatar(post)}<div><header><strong>{nameOf(post)}</strong><time>{fmt(post.created_at)}</time></header>{post.media?.url && <button type="button" className="cut-revive-post__media" onClick={() => setLightbox(post.media)}><img src={post.media.url} alt="Momento" loading="lazy" /></button>}<p>{post.body}</p>
      <div className="cut-revive-inline-actions"><button type="button" disabled={!canInteract} className={post.is_liked ? "active" : ""} onClick={() => toggleLike(post)}>♥ {post.likes_count || 0}</button><button type="button" disabled={!canInteract} onClick={() => setReplyId(replyId === post.id ? null : post.id)}>Responder {post.comments_count || 0}</button>{user && (Number(post.user_id) === Number(user.id) || isManager) && <button type="button" className="danger" onClick={() => removePost(post)}>Remover</button>}{user && Number(post.user_id) !== Number(user.id) && <button type="button" onClick={() => reportContent("post", post.id)}>Denunciar</button>}</div>
      {replyId === post.id && canInteract && <div className="cut-revive-replybox"><Form.Control as="textarea" rows={2} value={replyText} onChange={(e) => setReplyText(e.target.value)} /><Button size="sm" disabled={busy || replyText.trim().length < 2} onClick={() => publish(post.id)}>Responder</Button></div>}
      {post.replies?.length > 0 && <div className="cut-revive-replies">{post.replies.map((reply) => <div key={reply.id} className="cut-revive-reply">{avatar(reply, true)}<div><strong>{nameOf(reply)}</strong><p>{reply.body}</p></div></div>)}</div>}
      </div></article>) : <div className="cut-revive-empty">A conversa está começando.</div>}</div>

    {(revive.related_events || []).length > 0 && <><header className="cut-revive-section-head"><div><span className="cut-eyebrow">Continue vivendo</span><h3>Eventos que combinam com você</h3><p>Próximas edições e experiências relacionadas ao que você acabou de reviver.</p></div></header>
      <div className="cut-revive-related">{(revive.related_events || []).map((related) => <button key={related.id} type="button" onClick={() => openRelated(related)}>
        <div className="cut-revive-related__image">{related.image ? <img src={related.image} alt={related.title} loading="lazy" /> : <span>{String(related.title || 'E').slice(0, 1)}</span>}</div>
        <div><strong>{related.title}</strong><small>{fmt(related.start_date)}{related.venue ? ' · ' + related.venue : ''}</small></div>
        <i className="fa-solid fa-chevron-right" />
      </button>)}</div>
    </>}

    {revive.next_event && <div className="cut-revive-next">
      <div className="cut-revive-next__visual">{revive.next_event.image ? <img src={revive.next_event.image} alt={revive.next_event.title} /> : <i className="fa-regular fa-calendar-plus" />}</div>
      <div><span className="cut-eyebrow">{verified ? "Vamos de novo?" : "Não fique de fora da próxima"}</span><h3>{revive.next_event.title}</h3><p>{fmt(revive.next_event.start_date)}{revive.next_event.venue ? " · " + revive.next_event.venue : ""}</p><div className="cut-revive-hero__actions"><Button size="lg" onClick={nextEvent}>Ver próxima edição</Button><Button variant="outline-light" onClick={follow}>Seguir produção</Button></div></div>
    </div>}

    {isManager && revive.metrics && <><div className="cut-revive-owner-metrics">
      <div><span>Publicações</span><strong>{revive.metrics.posts || 0}</strong></div><div><span>Avaliações</span><strong>{revive.metrics.reviews || 0}</strong></div><div><span>Compras atribuídas</span><strong>{revive.metrics.attributed_orders || 0}</strong></div><div><span>GMV pós-evento</span><strong>{Number(revive.metrics.attributed_gmv || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong></div>
    </div><div className="cut-revive-moderation-launch"><Button variant="outline-light" onClick={loadModeration}>Abrir moderação do Reviva</Button></div></>}

    <Modal show={moderationOpen} onHide={() => setModerationOpen(false)} centered size="lg" className="cut-revive-lightbox">
      <Modal.Header closeButton closeVariant="white"><Modal.Title>Moderação do Reviva</Modal.Title></Modal.Header>
      <Modal.Body><div className="cut-revive-moderation-list">{(moderation?.data || []).length ? (moderation.data || []).map((item) => <article key={item.id}><div><strong>{item.target_type} #{item.target_id}</strong><span>{item.reason} · {fmt(item.created_at)}</span>{item.details && <p>{item.details}</p>}</div><div>{item.status === "open" ? <><Button size="sm" variant="outline-light" onClick={() => moderate(item, "dismissed", false)}>Descartar denúncia</Button>{item.target_type !== "rating" && <Button size="sm" variant="danger" onClick={() => moderate(item, "actioned", true)}>Ocultar conteúdo</Button>}</> : <Badge bg="secondary">{item.status}</Badge>}</div></article>) : <div className="cut-revive-empty">Nenhuma denúncia pendente.</div>}</div></Modal.Body>
    </Modal>

    <Modal show={Boolean(lightbox)} onHide={() => setLightbox(null)} centered size="xl" className="cut-revive-lightbox"><Modal.Body>{lightbox?.url && <img src={lightbox.url} alt={lightbox.caption || "Momento"} />}{lightbox?.caption && <p>{lightbox.caption}</p>}</Modal.Body><Modal.Footer><Button variant="outline-light" onClick={() => setLightbox(null)}>Fechar</Button></Modal.Footer></Modal>
  </section>;
}

EventReviveSection.propTypes = {
  event: PropTypes.shape({ id: PropTypes.number.isRequired, slug: PropTypes.string.isRequired, title: PropTypes.string, production_id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]), production: PropTypes.object }).isRequired,
  isOwner: PropTypes.bool,
};
EventReviveSection.defaultProps = { isOwner: false };
