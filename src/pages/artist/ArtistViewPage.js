import React, { useContext, useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { Alert, Badge, Button, Card, Col, Container, Row } from "react-bootstrap";
import { useNavigate, useParams } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import EventArtwork from "../../components/event/EventArtwork";
import cutinappService from "../../services/CutinappService";
import { storageUrl } from "../../config";
import { safeExternalHref } from "../../utils/safeUrl";
import "./ArtistViewPage.css";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
const timeFormatter = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const longDateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" });

const asDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const fmt = (value) => {
  const date = asDate(value);
  return date ? longDateFormatter.format(date) : "";
};
const fmtDate = (value) => {
  const date = asDate(value);
  return date ? dateFormatter.format(date) : "";
};
const fmtTime = (value) => {
  const date = asDate(value);
  return date ? timeFormatter.format(date) : "";
};
const mediaUrl = (value) => !value ? "" : /^https?:\/\//i.test(value) ? value : `${storageUrl}${String(value).replace(/^\//, "")}`;
const TYPE_LABELS = { solo: "Artista solo", band: "Banda", duo: "Duo", group: "Grupo", collective: "Coletivo", orchestra: "Orquestra" };
const GROUP_TYPES = new Set(["band", "duo", "group", "collective", "orchestra"]);

function ArtistEventCard({ event, onOpen, status = "confirmed" }) {
  const location = [event?.venue, event?.city].filter(Boolean).join(" · ");
  const pending = status === "pending";

  return (
    <button type="button" className="artist-profile-event-card cut-event-mini" onClick={onOpen}>
      <span className="artist-profile-event-card__media">
        <EventArtwork image={event?.image} title={event?.title} alt="" loading="lazy" fallbackClassName="artist-profile-event-card__placeholder" />
        <span className={`artist-profile-event-card__status ${pending ? "is-pending" : ""}`}>
          {pending ? "Aguardando confirmação" : "Confirmado"}
        </span>
      </span>
      <span className="artist-profile-event-card__body">
        <span className="artist-profile-event-card__production">{event?.production?.name || event?.category || "Evento Cutinapp"}</span>
        <strong>{event?.title}</strong>
        <span className="artist-profile-event-card__date">
          <i className="fa-regular fa-calendar" />
          {fmtDate(event?.start_date)}
          {fmtTime(event?.start_date) && <small>{fmtTime(event.start_date)}</small>}
        </span>
        {location && <span className="artist-profile-event-card__location"><i className="fa-solid fa-location-dot" />{location}</span>}
      </span>
    </button>
  );
}

ArtistEventCard.propTypes = {
  event: PropTypes.shape({
    image: PropTypes.string,
    venue: PropTypes.string,
    city: PropTypes.string,
    category: PropTypes.string,
    title: PropTypes.string,
    start_date: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]),
    production: PropTypes.shape({
      name: PropTypes.string,
    }),
  }).isRequired,
  onOpen: PropTypes.func.isRequired,
  status: PropTypes.oneOf(["confirmed", "pending"]),
};

export default function ArtistViewPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const [data, setData] = useState(null);
  const [social, setSocial] = useState({ members: [], member_of: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [shareLabel, setShareLabel] = useState("Compartilhar");

  const load = async () => {
    const [artistData, memberData] = await Promise.all([
      cutinappService.publicArtist(slug),
      cutinappService.publicArtistMembers(slug),
    ]);
    setData(artistData);
    setSocial(memberData || { members: [], member_of: [] });
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([
      cutinappService.publicArtist(slug),
      cutinappService.publicArtistMembers(slug),
    ]).then(([artistData, memberData]) => {
      if (!active) return;
      setData(artistData);
      setSocial(memberData || { members: [], member_of: [] });
    }).catch((e) => {
      if (active) setError(e?.response?.data?.message || e?.message || "Artista não encontrado.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [slug]);

  const toggleFollow = async () => {
    if (!user) return navigate("/login", { state: { from: `/artist/${slug}` } });
    setBusy(true);
    try {
      if (data.artist.is_following) await cutinappService.unfollow("artist", data.artist.id);
      else await cutinappService.follow("artist", data.artist.id);
      await load();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "Não foi possível atualizar o acompanhamento.");
    } finally {
      setBusy(false);
    }
  };

  const shareProfile = async () => {
    if (typeof window === "undefined") return;
    const shareData = { title: data?.artist?.stage_name || "Artista Cutinapp", url: window.location.href };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
      await navigator.clipboard.writeText(window.location.href);
      setShareLabel("Link copiado");
    } catch (e) {
      if (e?.name !== "AbortError") setError("Não foi possível compartilhar este perfil agora.");
    }
  };

  const currentMembers = useMemo(() => (social.members || []).filter((member) => member.is_current), [social.members]);
  const formerMembers = useMemo(() => (social.members || []).filter((member) => !member.is_current), [social.members]);

  if (loading) return <div className="cut-app-page"><NavlogComponent /><ProcessingIndicatorComponent label="Carregando artista" /></div>;
  if (!data) return <div className="cut-app-page"><NavlogComponent /><Container className="py-5"><Alert variant="danger">{error || "Artista não encontrado."}</Alert></Container></div>;

  const {
    artist,
    origin_organization: originOrganization,
    event_summary: eventSummary,
    upcoming_events: upcoming = [],
    past_events: past = [],
    pending_events: pending = [],
  } = data;
  const isGroup = GROUP_TYPES.has(artist.artist_type);
  const summary = {
    upcoming: Number(eventSummary?.upcoming ?? upcoming.length),
    past: Number(eventSummary?.past ?? past.length),
    total: Number(eventSummary?.total ?? (upcoming.length + past.length)),
    pending: Number(eventSummary?.pending ?? pending.length),
  };
  const relatedProductions = Array.from(new Map(
    [...upcoming, ...past]
      .map((event) => event?.production)
      .filter((production) => production?.id)
      .map((production) => [Number(production.id), production])
  ).values());
  const publicReference = artist.reference_visible !== false
    && artist.origin_type === "organization"
    && artist.origin_label;
  const instagramHref = safeExternalHref(artist.instagram_url);
  const spotifyHref = safeExternalHref(artist.spotify_url);
  const youtubeHref = safeExternalHref(artist.youtube_url);
  const websiteHref = safeExternalHref(artist.website_url);
  const bio = artist.bio || artist.short_bio || "Este perfil artístico ainda não adicionou uma biografia.";

  return <div className="cut-app-page artist-profile-page"><NavlogComponent />
    <section className="cut-profile-hero artist-profile-hero" style={artist.cover ? { backgroundImage: `linear-gradient(180deg,rgba(2,8,13,.15),rgba(2,8,13,.94)),url(${mediaUrl(artist.cover)})` } : undefined}>
      <Container className="cut-page-container">
        <div className="cut-profile-hero__content artist-profile-hero__content">
          <div className="cut-profile-avatar artist-profile-avatar">
            {artist.photo ? <img src={mediaUrl(artist.photo)} alt={artist.stage_name} /> : <span>{artist.stage_name?.slice(0, 2).toUpperCase()}</span>}
          </div>
          <div className="artist-profile-hero__copy">
            <div className="d-flex align-items-center gap-2 flex-wrap">
              <span className="cut-eyebrow">{TYPE_LABELS[artist.artist_type] || "Artista Cutinapp"}</span>
              {artist.verification_status === "verified" && <Badge bg="success"><i className="fa-solid fa-circle-check me-1" />Verificado</Badge>}
              {artist.verification_status === "account_linked" && <Badge bg="info"><i className="fa-solid fa-link me-1" />Conta vinculada</Badge>}
            </div>
            <h1>{artist.stage_name}</h1>
            {artist.short_bio && <p className="artist-profile-tagline">{artist.short_bio}</p>}
            <div className="artist-profile-meta">
              {artist.city && <span><i className="fa-solid fa-location-dot" />{artist.city}{artist.uf ? ` - ${artist.uf}` : ""}</span>}
              {publicReference && (
                <button
                  type="button"
                  className="artist-profile-origin-link"
                  onClick={() => originOrganization?.slug && navigate(`/production/${originOrganization.slug}/public`)}
                  disabled={!originOrganization?.slug}
                >
                  <i className="fa-solid fa-handshake-angle" />
                  Apresentado por <strong>{artist.origin_label}</strong>
                </button>
              )}
            </div>
            <div className="artist-profile-metrics" aria-label="Resumo do artista">
              <span><strong>{artist.followers_count || 0}</strong><small>seguidores</small></span>
              <span><strong>{summary.upcoming}</strong><small>próximos</small></span>
              <span><strong>{summary.total}</strong><small>eventos</small></span>
              {summary.pending > 0 && <span className="is-pending"><strong>{summary.pending}</strong><small>convites</small></span>}
            </div>
            <div className="cut-card-actions artist-profile-actions">
              <Button onClick={toggleFollow} disabled={busy}>
                <i className={`${artist.is_following ? "fa-solid" : "fa-regular"} fa-heart me-2`} />
                {artist.is_following ? "Seguindo" : isGroup ? "Seguir formação" : "Seguir artista"}
              </Button>
              <Button variant="outline-light" onClick={shareProfile}><i className="fa-solid fa-share-nodes me-2" />{shareLabel}</Button>
              {instagramHref && <Button as="a" href={instagramHref} target="_blank" rel="noopener noreferrer" variant="outline-light" aria-label="Instagram"><i className="fa-brands fa-instagram" /></Button>}
              {spotifyHref && <Button as="a" href={spotifyHref} target="_blank" rel="noopener noreferrer" variant="outline-light" aria-label="Spotify"><i className="fa-brands fa-spotify" /></Button>}
            </div>
          </div>
        </div>
      </Container>
    </section>

    <Container className="cut-page-container py-5">
      {error && <Alert variant="danger">{error}</Alert>}

      {pending.length > 0 && (
        <Card className="cut-panel artist-profile-pending mb-4">
          <Card.Body className="p-4">
            <div className="artist-profile-section-heading">
              <div>
                <span className="cut-eyebrow">Ação necessária</span>
                <h2 className="cut-section-title mb-1">Convites de eventos aguardando sua confirmação</h2>
                <p>Esses eventos já estão vinculados ao seu perfil, mas só entram no line-up público depois da sua confirmação.</p>
              </div>
              <Button onClick={() => navigate("/artist/onboarding")} variant="warning">Revisar convites</Button>
            </div>
            <Row className="g-3 mt-1">
              {pending.map((event) => <Col md={6} xl={4} key={event.id}><ArtistEventCard event={event} status="pending" onOpen={() => navigate("/artist/onboarding")} /></Col>)}
            </Row>
          </Card.Body>
        </Card>
      )}

      <Row className="g-4">
        <Col lg={8}>
          <Card className="cut-panel mb-4 artist-profile-about">
            <Card.Body className="p-4">
              <span className="cut-eyebrow">Sobre</span>
              <h2 className="cut-section-title">{artist.stage_name}</h2>
              <p className="cut-body-copy">{bio}</p>
              {artist.genres?.length > 0 && <div className="cut-active-filters">{artist.genres.map((genre) => <span key={genre}>{genre}</span>)}</div>}
            </Card.Body>
          </Card>

          {isGroup && <Card className="cut-panel mb-4"><Card.Body className="p-4"><span className="cut-eyebrow">Formação atual</span><h2 className="cut-section-title">Integrantes de {artist.stage_name}</h2>{currentMembers.length === 0 ? <p className="text-secondary">Os integrantes desta formação ainda não foram publicados.</p> : <Row className="g-3">{currentMembers.map((member) => { const linked = member.linked_artist; const clickable = Boolean(linked?.slug); return <Col sm={6} key={member.id}><Card className="cut-event-mini h-100" role={clickable ? "button" : undefined} tabIndex={clickable ? 0 : undefined} onClick={() => clickable && navigate(`/artist/${linked.slug}`)} onKeyDown={(event) => { if (clickable && (event.key === "Enter" || event.key === " ")) navigate(`/artist/${linked.slug}`); }}><Card.Body className="d-flex gap-3 align-items-center"><div className="cut-artist-card__photo" style={{ width: 64, height: 64, flex: "0 0 64px", borderRadius: 16 }}>{member.photo || linked?.photo ? <img src={mediaUrl(member.photo || linked.photo)} alt={member.display_name} /> : <span>{member.display_name?.slice(0, 2).toUpperCase()}</span>}</div><div><h3 className="mb-1">{member.display_name}</h3><p className="mb-1 text-secondary">{member.role || "Integrante"}</p>{linked && <Badge bg="secondary">Ver perfil Cutinapp</Badge>}</div></Card.Body></Card></Col>; })}</Row>}{formerMembers.length > 0 && <div className="mt-4"><span className="cut-eyebrow">Histórico da formação</span><div className="d-flex flex-wrap gap-2 mt-2">{formerMembers.map((member) => <Badge bg="secondary" key={member.id}>{member.display_name}{member.role ? ` · ${member.role}` : ""}</Badge>)}</div></div>}</Card.Body></Card>}

          {(social.member_of || []).length > 0 && <Card className="cut-panel mb-4"><Card.Body className="p-4"><span className="cut-eyebrow">Também faz parte de</span><div className="d-flex flex-wrap gap-2 mt-2">{social.member_of.map((membership) => <Button key={membership.id} variant="outline-light" onClick={() => navigate(`/artist/${membership.artist.slug}`)}>{membership.artist.stage_name}{membership.role ? ` · ${membership.role}` : ""}</Button>)}</div></Card.Body></Card>}

          <div className="artist-profile-section-heading">
            <div><span className="cut-eyebrow">Agenda</span><h2 className="cut-section-title mb-0">Próximos eventos</h2></div>
            {summary.upcoming > 0 && <span className="artist-profile-count">{summary.upcoming} confirmado{summary.upcoming === 1 ? "" : "s"}</span>}
          </div>
          {upcoming.length === 0
            ? <Card className="cut-empty-state artist-profile-empty"><Card.Body><i className="fa-regular fa-calendar-plus" /><h3>Nenhum evento confirmado no momento</h3><p>{pending.length > 0 ? "Há convite aguardando sua confirmação logo acima." : "Quando uma participação for confirmada, ela aparecerá aqui automaticamente."}</p></Card.Body></Card>
            : <Row className="g-3">{upcoming.map((event) => <Col md={6} key={event.id}><ArtistEventCard event={event} onOpen={() => navigate(`/event/${event.slug}`)} /></Col>)}</Row>}
        </Col>

        <Col lg={4}>
          {originOrganization && (
            <Card className="cut-panel mb-4 artist-profile-origin-card">
              <Card.Body className="p-4">
                <span className="cut-eyebrow">Origem na Cutinapp</span>
                <h2 className="cut-section-title">Apresentado por</h2>
                <button type="button" onClick={() => originOrganization.slug && navigate(`/production/${originOrganization.slug}/public`)} disabled={!originOrganization.slug}>
                  <span className="artist-profile-origin-card__logo">
                    {originOrganization.logo ? <img src={mediaUrl(originOrganization.logo)} alt="" /> : <i className="fa-solid fa-building" />}
                  </span>
                  <span><strong>{originOrganization.name}</strong>{originOrganization.city && <small>{originOrganization.city}{originOrganization.uf ? ` - ${originOrganization.uf}` : ""}</small>}</span>
                  <i className="fa-solid fa-chevron-right" />
                </button>
              </Card.Body>
            </Card>
          )}

          {(websiteHref || youtubeHref || instagramHref || spotifyHref) && (
            <Card className="cut-panel mb-4 artist-profile-links">
              <Card.Body className="p-4">
                <span className="cut-eyebrow">Links oficiais</span>
                <div className="d-grid gap-2 mt-3">
                  {websiteHref && <Button as="a" href={websiteHref} target="_blank" rel="noopener noreferrer" variant="outline-light" className="text-start"><i className="fa-solid fa-globe me-2" />Site oficial</Button>}
                  {youtubeHref && <Button as="a" href={youtubeHref} target="_blank" rel="noopener noreferrer" variant="outline-light" className="text-start"><i className="fa-brands fa-youtube me-2" />YouTube</Button>}
                  {instagramHref && <Button as="a" href={instagramHref} target="_blank" rel="noopener noreferrer" variant="outline-light" className="text-start"><i className="fa-brands fa-instagram me-2" />Instagram</Button>}
                  {spotifyHref && <Button as="a" href={spotifyHref} target="_blank" rel="noopener noreferrer" variant="outline-light" className="text-start"><i className="fa-brands fa-spotify me-2" />Spotify</Button>}
                </div>
              </Card.Body>
            </Card>
          )}

          {relatedProductions.length > 0 && (
            <Card className="cut-panel mb-4">
              <Card.Body className="p-4">
                <span className="cut-eyebrow">Relações profissionais</span>
                <h2 className="cut-section-title">Produções com histórico</h2>
                <p className="text-secondary small">Participações confirmadas em eventos públicos da Cutinapp.</p>
                <div className="d-grid gap-2">{relatedProductions.slice(0, 8).map((production) => <Button key={production.id} variant="outline-light" className="text-start" onClick={() => production.slug && navigate(`/production/${production.slug}/public`)} disabled={!production.slug}><i className="fa-solid fa-building me-2" />{production.name || production.fantasy || "Produção"}</Button>)}</div>
              </Card.Body>
            </Card>
          )}

          <Card className="cut-panel artist-profile-history">
            <Card.Body className="p-4">
              <span className="cut-eyebrow">Histórico</span>
              <h2 className="cut-section-title">Eventos anteriores</h2>
              {past.length === 0
                ? <p className="text-secondary">Ainda sem histórico público.</p>
                : past.slice(0, 8).map((event) => <button key={event.id} className="cut-history-link" onClick={() => navigate(`/event/${event.slug}`)}><strong>{event.title}</strong><span>{event.production?.name || "Evento"} · {fmt(event.start_date)}</span></button>)}
              {summary.past > past.length && <small className="artist-profile-history__more">Mostrando os {past.length} eventos mais recentes de {summary.past}.</small>}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  </div>;
}
