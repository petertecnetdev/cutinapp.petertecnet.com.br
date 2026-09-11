import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { Alert, Button, Container, Dropdown, Form, Modal, Spinner } from "react-bootstrap";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import QrCodeComponent from "../../components/QrCodeComponent";
import { ProfileActorBadges, ProfileActorLinks, actorThemeClass } from "../../components/user/ProfileActorIdentity";
import { AuthContext } from "../../context/AuthContext";
import cutinappService from "../../services/CutinappService";
import { storageUrl } from "../../config";
import { trackTelemetry } from "../../utils/telemetry";
import "./UserProfilePage.css";

const fmt = (value) => value ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(value)) : "";
const imageUrl = (value) => !value ? "" : /^https?:/.test(value) ? value : `${storageUrl}${String(value).replace(/^\//, "")}`;
const number = (value) => new Intl.NumberFormat("pt-BR", { notation: Number(value) >= 10000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(Number(value || 0));
const fullNameOf = (profile) => [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.name || profile?.user_name || "Participante Cutinapp";
const initialsOf = (profile) => `${profile?.first_name?.[0] || profile?.name?.[0] || "C"}${profile?.last_name?.[0] || ""}`.toUpperCase();
const asArray = (value) => Array.isArray(value) ? value : [];

function EventCard({ event, onOpen }) {
  return <button type="button" className="cut-profile-v2__event" onClick={() => onOpen(event)}>
    <div className="cut-profile-v2__eventMedia">{event.image ? <img src={imageUrl(event.image)} alt="" loading="lazy" /> : <i className="fa-regular fa-calendar" />}</div>
    <div className="cut-profile-v2__eventBody"><strong>{event.title || "Evento"}</strong><span>{fmt(event.start_date)}</span><span>{event.city ? `${event.city}${event.uf ? ` - ${event.uf}` : ""}` : "Local a confirmar"}</span></div>
  </button>;
}
EventCard.propTypes = { event: PropTypes.shape({ id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]), slug: PropTypes.string, image: PropTypes.string, title: PropTypes.string, start_date: PropTypes.string, city: PropTypes.string, uf: PropTypes.string }).isRequired, onOpen: PropTypes.func.isRequired };

function EmptyState({ icon, title, text, action, actionLabel }) {
  return <div className="cut-profile-v2__empty"><i className={icon} /><h3>{title}</h3><p>{text}</p>{action && <Button size="sm" onClick={action}>{actionLabel}</Button>}</div>;
}
EmptyState.propTypes = { icon: PropTypes.string.isRequired, title: PropTypes.string.isRequired, text: PropTypes.string.isRequired, action: PropTypes.func, actionLabel: PropTypes.string };

function PeopleModal({ show, onHide, title, people, currentUserId, onOpenProfile, onMessage }) {
  const [query, setQuery] = useState("");
  useEffect(() => { if (!show) setQuery(""); }, [show]);
  const normalized = query.trim().toLowerCase();
  const visible = asArray(people).filter((person) => !normalized || `${person.first_name || ""} ${person.last_name || ""} ${person.user_name || ""}`.toLowerCase().includes(normalized));
  return <Modal show={show} onHide={onHide} centered scrollable contentClassName="bg-dark text-light"><Modal.Header closeButton closeVariant="white"><Modal.Title>{title}</Modal.Title></Modal.Header><Modal.Body>
    <Form.Control value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome ou @username" className="mb-3" />
    {visible.length === 0 ? <p className="text-secondary mb-0">Nenhum perfil disponível nesta prévia.</p> : visible.map((person) => <div key={person.id} className="d-flex align-items-center gap-3 py-2 border-bottom border-secondary-subtle"><button type="button" className="cut-profile-v2__miniAvatar border-0 text-light" onClick={() => onOpenProfile(person.id)}>{person.avatar ? <img src={imageUrl(person.avatar)} alt="" /> : initialsOf(person)}</button><button type="button" className="border-0 bg-transparent text-light text-start flex-grow-1" onClick={() => onOpenProfile(person.id)}><strong className="d-block">{fullNameOf(person)}</strong>{person.user_name && <small className="text-secondary">@{person.user_name}</small>}</button>{Number(person.id) !== Number(currentUserId) && <Button size="sm" variant="outline-light" onClick={() => onMessage(person.id)}><i className="fa-regular fa-paper-plane" /></Button>}</div>)}
  </Modal.Body></Modal>;
}
PeopleModal.propTypes = { show: PropTypes.bool.isRequired, onHide: PropTypes.func.isRequired, title: PropTypes.string.isRequired, people: PropTypes.arrayOf(PropTypes.object), currentUserId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]), onOpenProfile: PropTypes.func.isRequired, onMessage: PropTypes.func.isRequired };

export default function UserProfilePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userId } = useParams();
  const { user } = useContext(AuthContext);
  const requestedUserId = userId ? Number(userId) : Number(user?.id || 0);
  const isOwnProfile = Boolean(user?.id) && (!userId || Number(userId) === Number(user.id));
  const [data, setData] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [secondaryLoading, setSecondaryLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("posts");
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [peopleModal, setPeopleModal] = useState(null);
  const [shareNotice, setShareNotice] = useState("");

  const loadProfile = useCallback(async () => {
    if (!requestedUserId) return;
    setLoading(true); setError("");
    try {
      if (isOwnProfile) {
        const [privateOverview, publicOverview] = await Promise.all([cutinappService.profileOverview(), cutinappService.publicProfile(requestedUserId).catch(() => ({}))]);
        const response = { ...publicOverview, ...privateOverview, profile: { ...(publicOverview?.profile || {}), ...(privateOverview?.profile || {}) }, stats: { ...(publicOverview?.stats || {}), ...(privateOverview?.stats || {}) }, followers_preview: publicOverview?.followers_preview || [], following_preview: publicOverview?.following_preview || [], mutual_connections: publicOverview?.mutual_connections || [], common_events: publicOverview?.common_events || [] };
        setData(response);
      } else {
        const response = await cutinappService.publicProfile(requestedUserId);
        setData(response || {});
        setFollowing(Boolean(response?.relationship?.following ?? response?.is_following ?? response?.following));
      }
    } catch (err) {
      setError(err?.response?.status === 404 ? "Este perfil não está disponível." : err?.response?.data?.message || err?.message || "Não foi possível carregar este perfil agora.");
    } finally { setLoading(false); }
  }, [isOwnProfile, requestedUserId]);

  useEffect(() => { window.scrollTo({ top: 0, behavior: "auto" }); loadProfile(); }, [loadProfile]);

  useEffect(() => {
    if (!data?.profile?.id) return undefined;
    const name = fullNameOf(data.profile);
    const oldTitle = document.title;
    document.title = `${name}${data.profile.user_name ? ` (@${data.profile.user_name})` : ""} | Cutinapp`;
    let canonical = document.querySelector('link[rel="canonical"]');
    const created = !canonical;
    if (!canonical) { canonical = document.createElement("link"); canonical.rel = "canonical"; document.head.appendChild(canonical); }
    canonical.href = `${window.location.origin}/profile/${data.profile.id}`;
    const meta = document.querySelector('meta[name="description"]');
    const oldDescription = meta?.getAttribute("content");
    if (meta) meta.setAttribute("content", data.profile.about ? String(data.profile.about).slice(0, 155) : `Veja o perfil de ${name}, eventos, publicações e conexões na Cutinapp.`);
    trackTelemetry("profile_view", { label: "Visualização de perfil", target: String(data.profile.id), metadata: { source: "profile", own_profile: isOwnProfile } });
    return () => { document.title = oldTitle; if (created) canonical.remove(); if (meta && oldDescription !== null) meta.setAttribute("content", oldDescription || ""); };
  }, [data?.profile, isOwnProfile]);

  useEffect(() => {
    if (!data?.profile?.id || tab !== "posts") return undefined;
    let active = true; setSecondaryLoading(true);
    cutinappService.feed({ page: 1, per_page: 60 }).then((response) => { if (active) setPosts(asArray(response?.community_activity).filter((post) => Number(post?.user_id) === Number(data.profile.id))); }).catch(() => { if (active) setPosts([]); }).finally(() => { if (active) setSecondaryLoading(false); });
    return () => { active = false; };
  }, [data?.profile?.id, tab]);

  const profile = data?.profile || {};
  const stats = data?.stats || {};
  const socialSettings = data?.social_settings || {};
  const actorIdentity = data?.actor_identity || { primary_role: "participant", roles: [{ key: "participant", label: "Participante" }] };
  const interests = asArray(data?.interests);
  const profileName = fullNameOf(profile);
  const profileInitials = initialsOf(profile);
  const background = imageUrl(profile.background);
  const avatar = imageUrl(profile.avatar);
  const profileUrl = `${window.location.origin}/profile/${profile.id || requestedUserId}`;
  const publicEvents = useMemo(() => { const seen = new Set(); return [...asArray(data?.common_events), ...asArray(data?.upcoming_events), ...asArray(data?.interested_events), ...asArray(data?.upcoming_with_ticket), ...asArray(data?.past_with_ticket)].filter((event) => { if (!event?.id || seen.has(event.id)) return false; seen.add(event.id); return true; }); }, [data]);
  const upcomingEvents = publicEvents.filter((event) => !event.end_date || new Date(event.end_date) > new Date());
  const pastEvents = publicEvents.filter((event) => event.end_date && new Date(event.end_date) <= new Date());
  const media = useMemo(() => posts.flatMap((post) => [post.image, post.media_url, ...asArray(post.media).map((item) => item?.url || item?.path)]).filter(Boolean), [posts]);
  const mutualCount = Number(data?.mutual_connections_count ?? asArray(data?.mutual_connections).length ?? 0);
  const commonEventsCount = Number(data?.common_events_count ?? asArray(data?.common_events).length ?? 0);

  const requireLogin = () => { if (user) return true; navigate("/login", { state: { from: `${location.pathname}${location.search}` } }); return false; };
  const openMessageTo = (targetUserId) => { if (!requireLogin()) return; trackTelemetry("profile_message_started", { label: "Mensagem iniciada pelo perfil", target: String(targetUserId), metadata: { source: "profile" } }); navigate(`/messages?user=${targetUserId}`, { state: { returnTo: location.pathname } }); };
  const openProfile = (targetUserId) => { setPeopleModal(null); navigate(`/profile/${targetUserId}`); };

  const toggleFollow = async () => {
    if (!requireLogin() || followBusy || isOwnProfile) return;
    const previous = following; setFollowing(!previous); setFollowBusy(true);
    setData((current) => current ? { ...current, stats: { ...current.stats, followers: Math.max(0, Number(current.stats?.followers || 0) + (previous ? -1 : 1)) } } : current);
    try { if (previous) await cutinappService.unfollow("user", requestedUserId); else await cutinappService.follow("user", requestedUserId); trackTelemetry(previous ? "profile_unfollow" : "profile_follow", { label: previous ? "Deixou de seguir" : "Seguiu pelo perfil", target: String(requestedUserId), metadata: { source: "profile" } }); }
    catch (err) { setFollowing(previous); setData((current) => current ? { ...current, stats: { ...current.stats, followers: Math.max(0, Number(current.stats?.followers || 0) + (previous ? 1 : -1)) } } : current); setError(err?.response?.data?.message || "Não foi possível atualizar essa conexão agora."); }
    finally { setFollowBusy(false); }
  };

  const shareProfile = async () => {
    try { const payload = { title: `${profileName} na Cutinapp`, text: profile.about || `Veja o perfil de ${profileName} na Cutinapp.`, url: profileUrl }; if (navigator.share) await navigator.share(payload); else { await navigator.clipboard.writeText(profileUrl); setShareNotice("Link do perfil copiado."); window.setTimeout(() => setShareNotice(""), 2200); } trackTelemetry("profile_shared", { label: "Perfil compartilhado", target: String(profile.id || requestedUserId), metadata: { source: "profile" } }); }
    catch (err) { if (err?.name !== "AbortError") setError("Não foi possível compartilhar o perfil agora."); }
  };

  const openEvent = (event) => { if (!event?.slug) return; trackTelemetry("profile_event_opened", { label: "Evento aberto pelo perfil", target: String(event.id || event.slug), metadata: { source: "profile", profile_user_id: Number(profile.id || requestedUserId) } }); navigate(`/event/${event.slug}`); };
  const openInterest = (interest) => navigate(`/event?search=${encodeURIComponent(interest)}`);

  if (loading) return <div className="cut-app-page"><NavlogComponent /><Container className="cut-page-container py-4"><div className="cut-profile-v2__skeleton" aria-label="Carregando perfil" /></Container></div>;

  return <div className="cut-app-page cut-profile-v2"><NavlogComponent />
    {error && <Container className="cut-page-container pt-3"><Alert variant="danger" dismissible onClose={() => setError("")}>{error}</Alert></Container>}
    {shareNotice && <Container className="cut-page-container pt-3"><Alert variant="info">{shareNotice}</Alert></Container>}
    {data?.profile && <>
      <section className={`cut-profile-v2__hero ${actorThemeClass(actorIdentity)}`} style={background ? { backgroundImage: `url(${JSON.stringify(background)})` } : undefined}><Container className="cut-page-container"><div className="cut-profile-v2__heroInner">
        <div className="cut-profile-v2__avatar">{avatar ? <img src={avatar} alt={`Foto de ${profileName}`} /> : <span>{profileInitials}</span>}</div>
        <div className="cut-profile-v2__identity"><h1>{profileName}{profile.verified && <i className="fa-solid fa-circle-check ms-2" title="Perfil verificado" />}</h1>{profile.user_name && <div className="cut-profile-v2__username">@{profile.user_name}</div>}<ProfileActorBadges identity={actorIdentity} /><div className="cut-profile-v2__meta">{socialSettings.show_city !== false && profile.city && <span><i className="fa-solid fa-location-dot" />{profile.city}{profile.uf ? ` - ${profile.uf}` : ""}</span>}{profile.favorite_genre && <span><i className="fa-solid fa-music" />{profile.favorite_genre}</span>}{profile.created_at && <span><i className="fa-regular fa-clock" />Na Cutinapp desde {new Date(profile.created_at).getFullYear()}</span>}</div>{profile.about && <p className="cut-profile-v2__bio">{profile.about}</p>}</div>
        <div className="cut-profile-v2__actions">{isOwnProfile ? <><Button variant="light" onClick={() => navigate("/user/edit")}><i className="fa-regular fa-pen-to-square me-2" />Editar perfil</Button><Button variant="outline-light" onClick={shareProfile}><i className="fa-solid fa-share-nodes me-2" />Compartilhar</Button></> : <><Button variant={following ? "outline-light" : "light"} disabled={followBusy || socialSettings.allow_follows === false} onClick={toggleFollow}>{followBusy ? <Spinner size="sm" /> : <><i className={`fa-solid ${following ? "fa-user-check" : "fa-user-plus"} me-2`} />{following ? "Seguindo" : "Seguir"}</>}</Button><Button variant="outline-light" onClick={() => openMessageTo(requestedUserId)}><i className="fa-regular fa-paper-plane me-2" />Mensagem</Button><Button variant="outline-light" onClick={shareProfile} aria-label="Compartilhar perfil"><i className="fa-solid fa-share-nodes" /></Button><Dropdown align="end"><Dropdown.Toggle variant="outline-light" aria-label="Mais opções"><i className="fa-solid fa-ellipsis" /></Dropdown.Toggle><Dropdown.Menu><Dropdown.Item onClick={() => setQrOpen(true)}><i className="fa-solid fa-qrcode me-2" />QR Code do perfil</Dropdown.Item><Dropdown.Item onClick={shareProfile}><i className="fa-solid fa-link me-2" />Compartilhar perfil</Dropdown.Item></Dropdown.Menu></Dropdown></>}</div>
      </div></Container></section>

      <div className="cut-profile-v2__summary"><Container className="cut-page-container"><div className="cut-profile-v2__summaryInner"><button className="cut-profile-v2__stat" type="button" onClick={() => setTab("posts")}><strong>{number(stats.posts)}</strong><span>publicações</span></button><button className="cut-profile-v2__stat" type="button" onClick={() => setPeopleModal("followers")}><strong>{number(stats.followers)}</strong><span>seguidores</span></button><button className="cut-profile-v2__stat" type="button" onClick={() => setPeopleModal("following")}><strong>{number(stats.following_participants)}</strong><span>seguindo</span></button><button className="cut-profile-v2__stat" type="button" onClick={() => setTab("events")}><strong>{number(upcomingEvents.length || stats.interested || stats.upcoming_with_ticket)}</strong><span>eventos</span></button></div></Container></div>

      <Container className="cut-page-container py-4">
        {(mutualCount > 0 || commonEventsCount > 0) && <div className="cut-profile-v2__common">{mutualCount > 0 && <button type="button" className="border-0 bg-transparent p-0" onClick={() => setPeopleModal("mutuals")}><span><i className="fa-solid fa-user-group me-2" />{mutualCount} conexões em comum</span></button>}{commonEventsCount > 0 && <span><i className="fa-regular fa-calendar-check me-2" />{commonEventsCount} eventos em comum</span>}</div>}
        <ProfileActorLinks identity={actorIdentity} />
        <div className="cut-profile-v2__tabs" role="tablist" aria-label="Conteúdo do perfil">{[["posts","Publicações","fa-regular fa-message"],["events","Eventos","fa-regular fa-calendar"],["media","Mídia","fa-regular fa-image"],["about","Sobre","fa-regular fa-circle-user"]].map(([key,label,icon]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}><i className={`${icon} me-2`} />{label}</button>)}</div>

        {tab === "posts" && <section className="cut-profile-v2__section"><div className="cut-profile-v2__heading"><div><h2>Publicações</h2><p>Conteúdo compartilhado por {isOwnProfile ? "você" : profile.first_name || profileName}.</p></div>{isOwnProfile && <Button size="sm" onClick={() => navigate("/feed")}><i className="fa-solid fa-plus me-2" />Publicar</Button>}</div>{secondaryLoading ? <div className="cut-profile-v2__skeleton" /> : posts.length === 0 ? <EmptyState icon="fa-regular fa-message" title="Nenhuma publicação por aqui" text={isOwnProfile ? "Compartilhe algo no feed para sua publicação aparecer no perfil." : "Este usuário ainda não possui publicações públicas."} action={isOwnProfile ? () => navigate("/feed") : null} actionLabel="Criar publicação" /> : <div className="cut-profile-v2__postGrid">{posts.map((post) => <article className="cut-profile-v2__post" key={post.id}><div className="cut-profile-v2__postHeader"><div className="cut-profile-v2__miniAvatar">{avatar ? <img src={avatar} alt="" /> : profileInitials}</div><div><strong>{profileName}</strong><small>{fmt(post.created_at)}</small></div></div><div className="cut-profile-v2__postBody">{post.body}</div><div className="cut-profile-v2__postActions"><button type="button" className={post.is_liked ? "active" : ""} onClick={() => navigate(`/feed?post=${post.id}`)}><i className={`${post.is_liked ? "fa-solid" : "fa-regular"} fa-heart`} /> {number(post.likes_count)}</button><button type="button" onClick={() => navigate(`/feed?post=${post.id}`)}><i className="fa-regular fa-comment" /> {number(post.comments_count || post.replies?.length)}</button><button type="button" onClick={() => navigate(`/feed?post=${post.id}`)}><i className="fa-solid fa-share-nodes" /></button></div></article>)}</div>}</section>}

        {tab === "events" && <><section className="cut-profile-v2__section"><div className="cut-profile-v2__heading"><div><h2>Próximos eventos</h2><p>Agenda, interesses e experiências conectadas a este perfil.</p></div></div>{upcomingEvents.length ? <div className="cut-profile-v2__eventGrid">{upcomingEvents.slice(0,24).map((event) => <EventCard key={event.id} event={event} onOpen={openEvent} />)}</div> : <EmptyState icon="fa-regular fa-calendar-plus" title="Nenhum próximo evento" text={isOwnProfile ? "Explore eventos e monte sua agenda." : "Não há próximos eventos públicos neste perfil."} action={isOwnProfile ? () => navigate("/event") : null} actionLabel="Descobrir eventos" />}</section>{pastEvents.length > 0 && <section className="cut-profile-v2__section"><div className="cut-profile-v2__heading"><div><h2>Eventos anteriores</h2><p>Histórico público de experiências.</p></div></div><div className="cut-profile-v2__eventGrid">{pastEvents.slice(0,24).map((event) => <EventCard key={event.id} event={event} onOpen={openEvent} />)}</div></section>}</>}

        {tab === "media" && <section className="cut-profile-v2__section"><div className="cut-profile-v2__heading"><div><h2>Fotos e vídeos</h2><p>Mídia pública das publicações deste perfil.</p></div></div>{media.length ? <div className="cut-profile-v2__mediaGrid">{media.slice(0,40).map((item,index) => <button key={`${item}-${index}`} type="button" onClick={() => window.open(imageUrl(item), "_blank", "noopener,noreferrer")}><img src={imageUrl(item)} alt="Mídia do perfil" loading="lazy" /></button>)}</div> : <EmptyState icon="fa-regular fa-images" title="Nenhuma mídia pública" text="Fotos e vídeos aparecerão aqui quando forem compartilhados." />}</section>}

        {tab === "about" && <><section className="cut-profile-v2__section"><div className="cut-profile-v2__heading"><div><h2>Sobre {profileName}</h2><p>Identidade, interesses e atuação na Cutinapp.</p></div>{isOwnProfile && <Button size="sm" variant="outline-light" onClick={() => navigate("/user/edit")}>Editar</Button>}</div>{profile.about ? <p className="cut-profile-v2__bio">{profile.about}</p> : isOwnProfile ? <EmptyState icon="fa-regular fa-pen-to-square" title="Conte mais sobre você" text="Uma boa bio ajuda pessoas a entenderem rapidamente quem você é." action={() => navigate("/user/edit")} actionLabel="Adicionar bio" /> : null}</section>{socialSettings.show_interests !== false && interests.length > 0 && <section className="cut-profile-v2__section"><div className="cut-profile-v2__heading"><div><h2>Interesses</h2><p>Toque para descobrir eventos relacionados.</p></div></div><div className="cut-profile-v2__interestList">{interests.map((interest) => <button type="button" key={interest} onClick={() => openInterest(interest)}>#{interest}</button>)}</div></section>}{isOwnProfile && asArray(data?.passes).length > 0 && <section className="cut-profile-v2__section"><div className="cut-profile-v2__heading"><div><h2>Carteira</h2><p>Seus ingressos continuam privados e acessíveis apenas para você.</p></div><Button size="sm" onClick={() => navigate("/passes")}>Abrir carteira</Button></div></section>}</>}
      </Container>
      {!isOwnProfile && <div className="cut-profile-v2__stickyActions"><Button variant={following ? "outline-light" : "light"} disabled={followBusy || socialSettings.allow_follows === false} onClick={toggleFollow}>{following ? "Seguindo" : "Seguir"}</Button><Button variant="outline-light" onClick={() => openMessageTo(requestedUserId)}><i className="fa-regular fa-paper-plane me-2" />Mensagem</Button></div>}
    </>}

    <PeopleModal show={Boolean(peopleModal)} onHide={() => setPeopleModal(null)} title={peopleModal === "followers" ? "Seguidores" : peopleModal === "following" ? "Seguindo" : "Conexões em comum"} people={peopleModal === "followers" ? data?.followers_preview : peopleModal === "following" ? data?.following_preview : data?.mutual_connections} currentUserId={user?.id} onOpenProfile={openProfile} onMessage={openMessageTo} />
    <Modal show={qrOpen} onHide={() => setQrOpen(false)} centered contentClassName="bg-dark text-light"><Modal.Header closeButton closeVariant="white"><Modal.Title>QR Code do perfil</Modal.Title></Modal.Header><Modal.Body><div className="cut-profile-v2__qr"><QrCodeComponent value={profileUrl} size={230} subject={`perfil de ${profileName}`} /></div><p className="text-center text-secondary mb-0">Aponte a câmera para abrir este perfil rapidamente.</p></Modal.Body><Modal.Footer><Button variant="outline-light" onClick={shareProfile}>Compartilhar</Button><Button onClick={() => setQrOpen(false)}>Fechar</Button></Modal.Footer></Modal>
  </div>;
}
