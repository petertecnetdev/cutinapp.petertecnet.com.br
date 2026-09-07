import React, { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { Badge, Button, Card, Form, ProgressBar } from "react-bootstrap";
import { storageUrl } from "../../config";

const mediaUrl = (value) => !value ? "" : /^https?:/i.test(value) ? value : `${storageUrl}${String(value).replace(/^\//, "")}`;
const fmt = (value) => value ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(value)) : "";

export default function TimelinePostCard({ item, currentUserId, sessionKey, onReact, onSave, onShare, onComment, onVote, onReport, onDelete, onOpenEvent, onTicket, onBoost, onImpression }) {
  const { post } = item;
  const [comment, setComment] = useState("");
  const [commenting, setCommenting] = useState(false);
  const [reporting, setReporting] = useState(false);
  const cardRef = useRef(null);
  const impressionSent = useRef(false);
  const owner = Number(post?.author?.id) === Number(currentUserId);

  useEffect(() => {
    if (!cardRef.current || impressionSent.current || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.35) && !impressionSent.current) {
        impressionSent.current = true;
        onImpression?.(post.id, sessionKey);
        observer.disconnect();
      }
    }, { threshold: [0.35] });
    observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, [post.id, sessionKey, onImpression]);

  const sendComment = async (event) => {
    event.preventDefault();
    const body = comment.trim();
    if (!body) return;
    setCommenting(true);
    try { await onComment?.(post.id, body); setComment(""); } finally { setCommenting(false); }
  };

  const pollTotal = Number(post?.poll?.total_votes || 0);

  return <Card ref={cardRef} className={`cut-feed-card cut-timeline-post ${post.is_promoted ? "cut-timeline-post--promoted" : ""}`}>
    <Card.Body>
      <header className="cut-timeline-post__header">
        <div className="cut-timeline-author">
          {post.author?.avatar ? <img src={mediaUrl(post.author.avatar)} alt="" /> : <div className="cut-timeline-avatar-fallback"><i className="fa-regular fa-user" /></div>}
          <div><strong>{post.author?.name || "Participante Cutinapp"}</strong><div className="cut-timeline-author__meta"><span>{fmt(post.published_at)}</span>{post.location_name && <span><i className="fa-solid fa-location-dot" /> {post.location_name}</span>}</div></div>
        </div>
        <div className="cut-timeline-badges">{post.is_promoted && <Badge bg="warning" text="dark">Impulsionado</Badge>}{(post.author?.badges || []).slice(0, 2).map((badge) => <Badge bg="secondary" key={badge}>{badge}</Badge>)}</div>
      </header>

      {post.body && <p className="cut-timeline-post__body">{post.body}</p>}
      {post.media_path && <div className="cut-timeline-post__media">{post.media_type === "video" ? <video src={mediaUrl(post.media_path)} controls preload="metadata" playsInline /> : <img src={mediaUrl(post.media_path)} alt="Mídia da publicação" loading="lazy" />}</div>}

      {post.poll && <div className="cut-timeline-poll">
        <strong>{post.poll.question}</strong>
        <div className="cut-timeline-poll__options">{post.poll.options.map((option) => {
          const percent = pollTotal > 0 ? Math.round((Number(option.votes_count || 0) / pollTotal) * 100) : 0;
          return <button type="button" key={option.id} disabled={post.poll.ended} className={`cut-timeline-poll__option ${option.selected ? "is-selected" : ""}`} onClick={() => onVote?.(post.id, option.id)}>
            <span><b>{option.label}</b><small>{option.votes_count} voto(s) · {percent}%</small></span><ProgressBar now={percent} />
          </button>;
        })}</div>
        <small>{post.poll.ended ? "Enquete encerrada" : `${pollTotal} voto(s)`}</small>
      </div>}

      {post.event && <div className="cut-timeline-linked-event">
        {post.event.image && <img src={mediaUrl(post.event.image)} alt="" loading="lazy" />}
        <div><span className="cut-eyebrow">Evento relacionado</span><strong>{post.event.title}</strong><small>{post.event.city || ""}{post.event.start_date ? ` · ${fmt(post.event.start_date)}` : ""}</small></div>
        <div className="cut-timeline-linked-event__actions"><Button size="sm" variant="outline-light" onClick={() => onOpenEvent?.(post)}>Ver evento</Button><Button size="sm" onClick={() => onTicket?.(post)}>Ingressos</Button></div>
      </div>}

      <div className="cut-timeline-social-counts">
        <span>{post.metrics?.likes || 0} reações</span><span>{post.metrics?.comments || 0} comentários</span><span>{post.metrics?.shares || 0} compartilhamentos</span>
      </div>
      <div className="cut-timeline-actions">
        <Button size="sm" variant={post.my_reaction ? "primary" : "outline-light"} onClick={() => onReact?.(post)}><i className="fa-regular fa-heart" /> {post.my_reaction ? "Curtido" : "Curtir"}</Button>
        <Button size="sm" variant={post.is_saved ? "primary" : "outline-light"} onClick={() => onSave?.(post)}><i className="fa-regular fa-bookmark" /> {post.is_saved ? "Salvo" : "Salvar"}</Button>
        <Button size="sm" variant="outline-light" onClick={() => onShare?.(post)}><i className="fa-solid fa-share-nodes" /> Compartilhar</Button>
        {owner && <Button size="sm" variant="outline-warning" onClick={() => onBoost?.(post)}><i className="fa-solid fa-bullhorn" /> Impulsionar</Button>}
        <Button size="sm" variant="outline-light" onClick={() => setReporting((value) => !value)} aria-label="Denunciar publicação"><i className="fa-regular fa-flag" /></Button>
        {owner && <Button size="sm" variant="outline-danger" onClick={() => onDelete?.(post)} aria-label="Excluir publicação"><i className="fa-regular fa-trash-can" /></Button>}
      </div>

      {reporting && <div className="cut-timeline-reportbar"><span>O que houve?</span>{["spam", "harassment", "fraud", "misleading", "other"].map((reason) => <Button size="sm" variant="outline-danger" key={reason} onClick={() => { onReport?.(post, reason); setReporting(false); }}>{({ spam: "Spam", harassment: "Assédio", fraud: "Fraude", misleading: "Enganoso", other: "Outro" })[reason]}</Button>)}</div>}

      {(post.comments_preview || []).length > 0 && <div className="cut-timeline-comments-preview">{post.comments_preview.map((entry) => <div key={entry.id}><strong>{[entry.first_name, entry.last_name].filter(Boolean).join(" ") || "Participante"}</strong><span>{entry.body}</span></div>)}</div>}
      <Form onSubmit={sendComment} className="cut-timeline-comment-form"><Form.Control value={comment} maxLength={1500} onChange={(event) => setComment(event.target.value)} placeholder="Comente..." disabled={commenting} /><Button type="submit" disabled={commenting || !comment.trim()}>{commenting ? "..." : <i className="fa-solid fa-paper-plane" />}</Button></Form>
    </Card.Body>
  </Card>;
}

TimelinePostCard.propTypes = {
  item: PropTypes.shape({ post: PropTypes.object.isRequired }).isRequired,
  currentUserId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]), sessionKey: PropTypes.string,
  onReact: PropTypes.func, onSave: PropTypes.func, onShare: PropTypes.func, onComment: PropTypes.func, onVote: PropTypes.func,
  onReport: PropTypes.func, onDelete: PropTypes.func, onOpenEvent: PropTypes.func, onTicket: PropTypes.func, onBoost: PropTypes.func, onImpression: PropTypes.func,
};

TimelinePostCard.defaultProps = { currentUserId: null, sessionKey: "", onReact: undefined, onSave: undefined, onShare: undefined, onComment: undefined, onVote: undefined, onReport: undefined, onDelete: undefined, onOpenEvent: undefined, onTicket: undefined, onBoost: undefined, onImpression: undefined };
