import React, { useEffect, useMemo, useState } from "react";
import { Alert, Button, Container, Spinner } from "react-bootstrap";
import { useNavigate, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import { storageUrl } from "../../config";
import participantSocialService from "../../services/ParticipantSocialService";
import "./ParticipantSocial.css";

const imageUrl = (value) => !value ? "" : /^https?:/i.test(value) ? value : `${storageUrl}${String(value).replace(/^\//, "")}`;
const fmt = (value) => value ? new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(value)) : "Data a confirmar";

export default function ParticipantProfilePage() {
  const { participantId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [followLoading, setFollowLoading] = useState(false);
  const [error, setError] = useState("");
  const [shareStatus, setShareStatus] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    participantSocialService.show(participantId)
      .then((response) => active && setData(response))
      .catch((err) => active && setError(err?.response?.data?.message || err?.message || "Não foi possível abrir este perfil."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [participantId]);

  const participant = data?.participant || {};
  const stats = data?.stats || {};
  const sharedIds = useMemo(() => new Set((data?.shared_event_ids || []).map(Number)), [data?.shared_event_ids]);
  const name = [participant.first_name, participant.last_name].filter(Boolean).join(" ") || participant.user_name || "Participante Cutinapp";
  const initials = `${participant.first_name?.[0] || participant.user_name?.[0] || "C"}${participant.last_name?.[0] || ""}`.toUpperCase();

  const toggleFollow = async () => {
    if (!data || followLoading || (!data.can_follow && !data.is_following)) return;
    setFollowLoading(true);
    setError("");
    const next = !data.is_following;
    setData((current) => ({
      ...current,
      is_following: next,
      is_connection: next && Boolean(current.is_following_viewer),
      stats: { ...current.stats, followers: Math.max(0, Number(current.stats?.followers || 0) + (next ? 1 : -1)) },
    }));

    try {
      const response = next
        ? await participantSocialService.follow(participantId)
        : await participantSocialService.unfollow(participantId);
      setData((current) => ({
        ...current,
        is_following: Boolean(response?.following),
        is_connection: Boolean(response?.is_connection),
      }));
    } catch (err) {
      setData((current) => ({
        ...current,
        is_following: !next,
        is_connection: !next && Boolean(current.is_following_viewer),
        stats: { ...current.stats, followers: Math.max(0, Number(current.stats?.followers || 0) + (next ? -1 : 1)) },
      }));
      setError(err?.response?.data?.message || "Não foi possível atualizar a conexão.");
    } finally {
      setFollowLoading(false);
    }
  };

  const shareProfile = async () => {
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}/participantes/${participantId}`;
    const text = `Veja o perfil de ${name} na Cutinapp.`;
    setShareStatus("");

    try {
      if (navigator.share) {
        await navigator.share({ title: `${name} · Cutinapp`, text, url });
        setShareStatus("Perfil compartilhado.");
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareStatus("Link do perfil copiado.");
    } catch (err) {
      if (err?.name !== "AbortError") setShareStatus("Não foi possível compartilhar agora.");
    }
  };

  const followLabel = () => {
    if (followLoading) return <Spinner animation="border" size="sm" />;
    if (data?.is_connection) return <><i className="fa-solid fa-user-group me-2" />Conectados</>;
    if (data?.is_following) return <><i className="fa-solid fa-user-check me-2" />Seguindo</>;
    if (!data?.can_follow) return <><i className="fa-solid fa-user-lock me-2" />Não aceita seguidores</>;
    if (data?.is_following_viewer) return <><i className="fa-solid fa-user-plus me-2" />Seguir de volta</>;
    return <><i className="fa-solid fa-user-plus me-2" />Seguir</>;
  };

  if (loading) return <div className="cut-app-page cut-participants-page"><NavlogComponent /><ProcessingIndicatorComponent label="Carregando participante" /></div>;

  return <div className="cut-app-page cut-participants-page">
    <NavlogComponent />
    <header className="cut-participant-profile-hero">
      <Container className="cut-page-container">
        {error && !data ? <Alert variant="danger">{error}<div className="mt-3"><Button variant="outline-light" onClick={() => navigate("/participantes")}>Voltar para participantes</Button></div></Alert> : <div className="cut-participant-profile">
          <div className="cut-participant-profile__avatar">{participant.avatar ? <img src={imageUrl(participant.avatar)} alt={name} /> : initials}</div>
          <div className="cut-participant-profile__identity">
            <div className="d-flex flex-wrap gap-2 align-items-center">
              <span className="cut-eyebrow">Perfil de participante</span>
              {data?.is_connection && <span className="cut-connection-badge"><i className="fa-solid fa-link" />Conexão</span>}
              {!data?.is_connection && data?.is_following_viewer && <span className="cut-followback-badge"><i className="fa-solid fa-user-check" />Segue você</span>}
            </div>
            <h1>{name}</h1>
            {participant.user_name && <p>@{participant.user_name}</p>}
            <div className="cut-participant-profile__meta">
              {participant.city && <span><i className="fa-solid fa-location-dot me-2" />{participant.city}{participant.uf ? ` - ${participant.uf}` : ""}</span>}
              <span><i className="fa-solid fa-wand-magic-sparkles me-2" />{data?.affinity_score || 0}% de afinidade com você</span>
            </div>
            {participant.about && <p className="cut-participant-profile__bio">{participant.about}</p>}
          </div>
          <div className="cut-participant-profile__actions">
            <Button variant={data?.is_following ? "outline-light" : "primary"} onClick={toggleFollow} disabled={followLoading || (!data?.can_follow && !data?.is_following)}>{followLabel()}</Button>
            <Button variant="outline-light" onClick={shareProfile}><i className="fa-solid fa-share-nodes me-2" />Compartilhar perfil</Button>
            <Button variant="outline-light" onClick={() => navigate("/participantes")}><i className="fa-solid fa-people-group me-2" />Comunidade</Button>
            {shareStatus && <small className="text-white-50">{shareStatus}</small>}
          </div>
        </div>}
      </Container>
    </header>

    {data && <Container className="cut-page-container pb-5">
      {error && <Alert variant="danger">{error}</Alert>}
      <div className="cut-participant-stat-grid">
        <div><strong>{stats.followers || 0}</strong><span>Seguidores</span></div>
        <div><strong>{stats.following_participants || 0}</strong><span>Participantes seguindo</span></div>
        <div><strong>{stats.mutual_following || 0}</strong><span>Conexões em comum</span></div>
        <div><strong>{stats.shared_interested_events || 0}</strong><span>Eventos em comum com você</span></div>
      </div>

      <section className="mb-5">
        <div className="cut-section-heading"><div><span className="cut-eyebrow">Afinidade explicada</span><h2>Por que vocês podem combinar</h2></div></div>
        {(data.affinity_reasons || []).length > 0 ? <div className="cut-affinity-reasons cut-affinity-reasons--profile">{data.affinity_reasons.map((reason) => <span key={reason}><i className="fa-solid fa-check" />{reason}</span>)}</div> : <p className="text-white-50">Ainda não há sinais suficientes para explicar uma afinidade. A Cutinapp não inventa compatibilidade quando faltam dados.</p>}
        {(data.shared_interests || []).length > 0 && <div className="mt-4"><small className="text-white-50 d-block mb-2">Interesses em comum</small><div className="cut-interest-chips">{data.shared_interests.map((interest) => <span className="cut-interest-chip is-shared" key={interest}><i className="fa-solid fa-link" />{interest}</span>)}</div></div>}
        {(data.interests || []).length > 0 && <div className="mt-3"><small className="text-white-50 d-block mb-2">Interesses deste participante</small><div className="cut-interest-chips">{data.interests.map((interest) => <span className="cut-interest-chip" key={interest}>{interest}</span>)}</div></div>}
        {data.visibility?.show_interests === false && <div className="cut-privacy-note mt-3"><i className="fa-solid fa-shield-halved" /><span>Este participante preferiu não exibir os próprios interesses.</span></div>}
      </section>

      <section>
        <div className="cut-section-heading"><div><span className="cut-eyebrow">Descoberta social</span><h2>Eventos em que {participant.first_name || "este participante"} demonstrou interesse</h2></div></div>
        {data.visibility?.show_event_interests === false ? <div className="cut-participants-empty"><i className="fa-solid fa-shield-halved" /><h3>Interesses em eventos são privados</h3><p>Este participante escolheu não usar seus interesses em eventos como sinal social.</p></div> : (data.interested_events || []).length === 0 ? <div className="cut-participants-empty"><i className="fa-regular fa-calendar" /><h3>Nenhum interesse público por enquanto</h3><p>Quando este participante demonstrar interesse em eventos públicos, eles podem aparecer aqui.</p></div> : <div className="cut-participant-event-grid">
          {data.interested_events.map((event) => <button type="button" className="cut-participant-event" key={event.id} onClick={() => navigate(`/event/${event.slug}`)}>
            <div className="cut-participant-event__media">{event.image ? <img src={imageUrl(event.image)} alt={event.title} /> : <span><i className="fa-regular fa-calendar" /></span>}</div>
            <div className="cut-participant-event__body">
              <small>{event.production?.name || "Cutinapp"}</small><strong>{event.title}</strong>
              <span><i className="fa-regular fa-calendar me-2" />{fmt(event.start_date)}</span>
              <span><i className="fa-solid fa-location-dot me-2" />{event.city ? `${event.city}${event.uf ? ` - ${event.uf}` : ""}` : "Local a confirmar"}</span>
              {sharedIds.has(Number(event.id)) && <span className="cut-affinity"><i className="fa-solid fa-link" />Vocês dois têm interesse</span>}
            </div>
          </button>)}
        </div>}
      </section>
    </Container>}
  </div>;
}
