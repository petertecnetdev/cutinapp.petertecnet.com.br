import React, { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { Alert, Button, Col, Container, Form, Row, Spinner } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import SkeletonCard from "../../components/SkeletonCard";
import { storageUrl } from "../../config";
import participantSocialService from "../../services/ParticipantSocialService";
import "./ParticipantSocial.css";

const defaultSocialSettings = {
  discoverable: true,
  show_city: true,
  show_interests: true,
  show_event_interests: true,
  allow_follows: true,
};

const imageUrl = (value) => !value ? "" : /^https?:/i.test(value) ? value : `${storageUrl}${String(value).replace(/^\//, "")}`;
const fullName = (participant) => [participant?.first_name, participant?.last_name].filter(Boolean).join(" ") || participant?.user_name || "Participante Cutinapp";
const initials = (participant) => `${participant?.first_name?.[0] || participant?.user_name?.[0] || "C"}${participant?.last_name?.[0] || ""}`.toUpperCase();
const locationLabel = (participant) => participant?.city ? `${participant.city}${participant.uf ? ` - ${participant.uf}` : ""}` : "Cidade não exibida";

function ParticipantAvatar({ participant, className }) {
  return <span className={className} aria-hidden="true">
    {participant?.avatar ? <img src={imageUrl(participant.avatar)} alt="" /> : initials(participant)}
  </span>;
}

function InterestChips({ participant }) {
  const shared = new Set((participant.shared_interests || []).map((item) => String(item).toLocaleLowerCase("pt-BR")));
  const interests = (participant.interests || []).slice(0, 4);

  if (interests.length === 0) return <span className="text-white-50 small">Interesses não exibidos ou ainda não cadastrados.</span>;

  return <div className="cut-interest-chips">
    {interests.map((interest) => <span key={interest} className={`cut-interest-chip ${shared.has(String(interest).toLocaleLowerCase("pt-BR")) ? "is-shared" : ""}`}>
      {shared.has(String(interest).toLocaleLowerCase("pt-BR")) && <i className="fa-solid fa-link" />}{interest}
    </span>)}
  </div>;
}

function AffinityReasons({ participant }) {
  const reasons = participant.affinity_reasons || [];
  if (reasons.length === 0) return <small className="cut-affinity-explanation">Uma nova pessoa para sua comunidade.</small>;

  return <div className="cut-affinity-reasons" aria-label="Motivos da afinidade">
    {reasons.slice(0, 4).map((reason) => <span key={reason}><i className="fa-solid fa-check" />{reason}</span>)}
  </div>;
}

function FollowLabel({ participant, loading }) {
  if (loading) return <Spinner size="sm" animation="border" />;
  if (participant.is_connection) return <><i className="fa-solid fa-user-group me-2" />Conectados</>;
  if (participant.is_following) return <><i className="fa-solid fa-user-check me-2" />Seguindo</>;
  if (!participant.can_follow) return <><i className="fa-solid fa-user-lock me-2" />Indisponível</>;
  if (participant.is_following_viewer) return <><i className="fa-solid fa-user-plus me-2" />Seguir de volta</>;
  return <><i className="fa-solid fa-user-plus me-2" />Seguir</>;
}

ParticipantAvatar.propTypes = {
  participant: PropTypes.shape({ avatar: PropTypes.string, first_name: PropTypes.string, last_name: PropTypes.string, user_name: PropTypes.string }),
  className: PropTypes.string.isRequired,
};
InterestChips.propTypes = { participant: PropTypes.shape({ interests: PropTypes.arrayOf(PropTypes.string), shared_interests: PropTypes.arrayOf(PropTypes.string) }).isRequired };
AffinityReasons.propTypes = { participant: PropTypes.shape({ affinity_reasons: PropTypes.arrayOf(PropTypes.string) }).isRequired };
FollowLabel.propTypes = {
  participant: PropTypes.shape({ is_connection: PropTypes.bool, is_following: PropTypes.bool, is_following_viewer: PropTypes.bool, can_follow: PropTypes.bool }).isRequired,
  loading: PropTypes.bool.isRequired,
};

export default function ParticipantDirectoryPage() {
  const navigate = useNavigate();
  const [participants, setParticipants] = useState([]);
  const [activity, setActivity] = useState([]);
  const [context, setContext] = useState({ interests: [] });
  const [filters, setFilters] = useState({ q: "", city: "", uf: "", interest: "" });
  const [socialSettings, setSocialSettings] = useState(defaultSocialSettings);
  const [loading, setLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(true);
  const [error, setError] = useState("");
  const [settingsStatus, setSettingsStatus] = useState("");
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [pendingFollowId, setPendingFollowId] = useState(null);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => String(value || "").trim() !== ""));
        const response = await participantSocialService.list({ ...params, per_page: 24 });
        if (!active) return;
        setParticipants(response?.participants?.data || []);
        setContext(response?.viewer_context || { interests: [] });
        setSocialSettings({ ...defaultSocialSettings, ...(response?.viewer_context?.social_settings || {}) });
      } catch (err) {
        if (active) setError(err?.response?.data?.message || err?.message || "Não foi possível carregar a comunidade agora.");
      } finally {
        if (active) setLoading(false);
      }
    }, 260);

    return () => { active = false; window.clearTimeout(timer); };
  }, [filters]);

  useEffect(() => {
    let active = true;
    participantSocialService.activity({ per_page: 12 })
      .then((response) => active && setActivity(response?.activity?.data || []))
      .catch(() => active && setActivity([]))
      .finally(() => active && setActivityLoading(false));
    return () => { active = false; };
  }, []);

  const sharedCommunityCount = useMemo(
    () => participants.filter((participant) => Number(participant.affinity_score || 0) > 0).length,
    [participants]
  );

  const updateFilter = (key) => (event) => setFilters((current) => ({ ...current, [key]: event.target.value }));
  const resetFilters = () => setFilters({ q: "", city: "", uf: "", interest: "" });
  const updateSocialSetting = (key) => (event) => {
    const checked = event.target.checked;
    setSocialSettings((current) => ({ ...current, [key]: checked }));
    setSettingsStatus("");
  };

  const saveSocialSettings = async () => {
    if (settingsSaving) return;
    setSettingsSaving(true);
    setSettingsStatus("");
    try {
      const response = await participantSocialService.updateSettings(socialSettings);
      setSocialSettings({ ...defaultSocialSettings, ...(response?.settings || socialSettings) });
      setSettingsStatus("Preferências sociais salvas.");
    } catch (err) {
      setError(err?.response?.data?.message || "Não foi possível salvar suas preferências sociais.");
    } finally {
      setSettingsSaving(false);
    }
  };

  const toggleFollow = async (participant) => {
    if (!participant?.id || pendingFollowId || (!participant.can_follow && !participant.is_following)) return;
    setPendingFollowId(participant.id);
    setError("");
    const nextFollowing = !participant.is_following;

    setParticipants((current) => current.map((item) => item.id === participant.id ? {
      ...item,
      is_following: nextFollowing,
      is_connection: nextFollowing && Boolean(item.is_following_viewer),
      followers_count: Math.max(0, Number(item.followers_count || 0) + (nextFollowing ? 1 : -1)),
    } : item));

    try {
      const response = nextFollowing
        ? await participantSocialService.follow(participant.id)
        : await participantSocialService.unfollow(participant.id);
      setParticipants((current) => current.map((item) => item.id === participant.id ? {
        ...item,
        is_following: Boolean(response?.following),
        is_connection: Boolean(response?.is_connection),
      } : item));
    } catch (err) {
      setParticipants((current) => current.map((item) => item.id === participant.id ? {
        ...item,
        is_following: !nextFollowing,
        is_connection: !nextFollowing && Boolean(item.is_following_viewer),
        followers_count: Math.max(0, Number(item.followers_count || 0) + (nextFollowing ? -1 : 1)),
      } : item));
      setError(err?.response?.data?.message || "Não foi possível atualizar essa conexão.");
    } finally {
      setPendingFollowId(null);
    }
  };

  return <div className="cut-app-page cut-participants-page">
    <NavlogComponent />

    <header className="cut-participants-hero">
      <Container className="cut-page-container">
        <div className="cut-participants-hero__grid">
          <div>
            <span className="cut-eyebrow">Comunidade Cutinapp</span>
            <h1>Descubra quem curte a mesma cena que você.</h1>
            <p>Encontre participantes por afinidade, crie conexões e descubra eventos pelos sinais sociais da sua própria rede.</p>
          </div>
          <aside className="cut-participants-hero__aside">
            <strong>{sharedCommunityCount} pessoa{sharedCommunityCount === 1 ? "" : "s"} com sinais de afinidade</strong>
            <span>{context?.interests?.length ? `Seu perfil usa ${context.interests.length} interesse${context.interests.length === 1 ? "" : "s"} para explicar recomendações.` : "Adicione interesses ao seu perfil para melhorar as recomendações."}</span>
            <Button variant="link" className="px-0 mt-2" onClick={() => navigate("/user/edit")}>Ajustar meus interesses <i className="fa-solid fa-arrow-right ms-1" /></Button>
          </aside>
        </div>
      </Container>
    </header>

    <Container className="cut-page-container pb-5">
      <details className="cut-social-privacy-panel">
        <summary><span><i className="fa-solid fa-shield-halved me-2" />Minha privacidade social</span><small>Você controla o que participa da descoberta</small></summary>
        <div className="cut-social-privacy-panel__body">
          <div className="cut-social-privacy-copy">
            <strong>Seu perfil, suas escolhas.</strong>
            <p>Contato, endereço, compras e ingressos continuam privados. Aqui você decide apenas quais sinais sociais podem aparecer para outros participantes.</p>
          </div>
          <div className="cut-social-privacy-options">
            <Form.Check type="switch" id="social-discoverable" label="Aparecer na descoberta de participantes" checked={socialSettings.discoverable} onChange={updateSocialSetting("discoverable")} />
            <Form.Check type="switch" id="social-city" label="Mostrar minha cidade/UF" checked={socialSettings.show_city} onChange={updateSocialSetting("show_city")} />
            <Form.Check type="switch" id="social-interests" label="Mostrar meus interesses" checked={socialSettings.show_interests} onChange={updateSocialSetting("show_interests")} />
            <Form.Check type="switch" id="social-events" label="Mostrar eventos em que demonstrei interesse" checked={socialSettings.show_event_interests} onChange={updateSocialSetting("show_event_interests")} />
            <Form.Check type="switch" id="social-follows" label="Permitir novos seguidores" checked={socialSettings.allow_follows} onChange={updateSocialSetting("allow_follows")} />
          </div>
          <div className="cut-social-privacy-actions">
            {settingsStatus && <span><i className="fa-solid fa-circle-check me-1" />{settingsStatus}</span>}
            <Button onClick={saveSocialSettings} disabled={settingsSaving}>{settingsSaving ? <Spinner animation="border" size="sm" /> : "Salvar privacidade"}</Button>
          </div>
        </div>
      </details>

      {(activityLoading || activity.length > 0) && <section className="cut-participant-network">
        <div className="cut-section-heading"><div><span className="cut-eyebrow">Sua rede</span><h2>Interesses recentes de quem você segue</h2></div></div>
        {activityLoading ? <Row className="g-3"><Col md={4}><SkeletonCard /></Col><Col md={4}><SkeletonCard /></Col><Col md={4}><SkeletonCard /></Col></Row> : <div className="cut-participant-network__rail">
          {activity.map((item) => <article key={`${item.participant_id}-${item.event_id}-${item.activity_at}`} className="cut-network-activity">
            <button type="button" className="border-0 bg-transparent p-0 text-white" onClick={() => navigate(`/participantes/${item.participant_id}`)} aria-label={`Abrir perfil de ${fullName(item)}`}><ParticipantAvatar participant={item} className="cut-network-activity__avatar" /></button>
            <button type="button" className="cut-network-activity__copy border-0 bg-transparent p-0 text-start text-white" onClick={() => navigate(`/event/${item.event_slug}`)}>
              <strong>{fullName(item)} demonstrou interesse</strong><span>{item.event_title}</span><small>{item.production_name || "Cutinapp"}{item.city ? ` · ${item.city}${item.uf ? ` - ${item.uf}` : ""}` : ""}</small>
            </button>
            <i className="fa-solid fa-arrow-up-right-from-square" />
          </article>)}
        </div>}
      </section>}

      <div className="cut-section-heading"><div><span className="cut-eyebrow">Participantes</span><h2>Pessoas para descobrir e seguir</h2></div></div>

      <details className="cut-participant-filters">
        <summary><span><i className="fa-solid fa-sliders me-2" />Filtros da comunidade</span><small className="text-white-50">Busca, cidade e interesses</small></summary>
        <div className="cut-participant-filters__body">
          <Row className="g-3">
            <Col lg={5}><Form.Label>Buscar participante</Form.Label><div className="cut-participant-search"><i className="fa-solid fa-magnifying-glass" /><Form.Control value={filters.q} onChange={updateFilter("q")} placeholder="Nome, @usuário ou bio" /></div></Col>
            <Col lg={3} sm={6}><Form.Label>Cidade</Form.Label><Form.Control value={filters.city} onChange={updateFilter("city")} placeholder="Ex.: São Paulo" /></Col>
            <Col lg={1} sm={6}><Form.Label>UF</Form.Label><Form.Control value={filters.uf} onChange={updateFilter("uf")} maxLength={2} placeholder="SP" /></Col>
            <Col lg={3}><Form.Label>Interesse</Form.Label><Form.Control value={filters.interest} onChange={updateFilter("interest")} placeholder="Ex.: samba, techno, rock" /></Col>
          </Row>
          <div className="d-flex justify-content-end mt-3"><Button variant="outline-light" size="sm" onClick={resetFilters}>Limpar filtros</Button></div>
        </div>
      </details>

      {error && <Alert variant="danger" className="mb-4">{error}</Alert>}

      {loading ? <div className="cut-participant-grid">{Array.from({ length: 6 }).map((_, index) => <SkeletonCard key={index} />)}</div> : participants.length === 0 ? <div className="cut-participants-empty"><i className="fa-solid fa-people-group" /><h3>Nenhum participante encontrado</h3><p>Ajuste os filtros ou complete seus interesses para ampliar as conexões sugeridas.</p><Button variant="outline-light" onClick={resetFilters}>Limpar filtros</Button></div> : <div className="cut-participant-grid">
        {participants.map((participant) => <article className="cut-participant-card" key={participant.id}>
          <div className="cut-participant-card__head">
            <ParticipantAvatar participant={participant} className="cut-participant-card__avatar" />
            <div className="cut-participant-card__identity"><strong>{fullName(participant)}</strong>{participant.user_name && <span>@{participant.user_name}</span>}<span className="cut-participant-card__location"><i className="fa-solid fa-location-dot me-1" />{locationLabel(participant)}</span></div>
            {participant.is_connection && <span className="cut-connection-badge"><i className="fa-solid fa-link" />Conexão</span>}
          </div>
          <span className="cut-affinity"><i className="fa-solid fa-wand-magic-sparkles" />{participant.affinity_score || 0}% de afinidade · {participant.followers_count || 0} seguidor{Number(participant.followers_count || 0) === 1 ? "" : "es"}</span>
          <AffinityReasons participant={participant} />
          <InterestChips participant={participant} />
          <div className="cut-participant-card__footer">
            <Button variant={participant.is_following ? "outline-light" : "primary"} onClick={() => toggleFollow(participant)} disabled={pendingFollowId === participant.id || (!participant.can_follow && !participant.is_following)}><FollowLabel participant={participant} loading={pendingFollowId === participant.id} /></Button>
            <Button variant="outline-light" aria-label={`Ver perfil de ${fullName(participant)}`} onClick={() => navigate(`/participantes/${participant.id}`)}><i className="fa-solid fa-arrow-right" /></Button>
          </div>
        </article>)}
      </div>}
    </Container>
  </div>;
}
