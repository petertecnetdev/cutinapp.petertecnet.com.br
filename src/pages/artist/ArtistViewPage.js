import React, { useContext, useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Row } from "react-bootstrap";
import { useNavigate, useParams } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import cutinappService from "../../services/CutinappService";
import { storageUrl } from "../../config";
import { safeExternalHref } from "../../utils/safeUrl";

const fmt = (value) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "";
const mediaUrl = (value) => !value ? "" : /^https?:\/\//i.test(value) ? value : `${storageUrl}${String(value).replace(/^\//, "")}`;
const TYPE_LABELS = { solo: "Artista solo", band: "Banda", duo: "Duo", group: "Grupo", collective: "Coletivo", orchestra: "Orquestra" };
const GROUP_TYPES = new Set(["band", "duo", "group", "collective", "orchestra"]);

export default function ArtistViewPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const [data, setData] = useState(null);
  const [social, setSocial] = useState({ members: [], member_of: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [artistData, memberData] = await Promise.all([
      cutinappService.publicArtist(slug),
      cutinappService.publicArtistMembers(slug),
    ]);
    setData(artistData);
    setSocial(memberData || { members: [], member_of: [] });
  };

  useEffect(() => { let active = true; setLoading(true); Promise.all([cutinappService.publicArtist(slug), cutinappService.publicArtistMembers(slug)]).then(([artistData, memberData]) => { if (active) { setData(artistData); setSocial(memberData || { members: [], member_of: [] }); } }).catch((e) => active && setError(e?.message || "Artista não encontrado.")).finally(() => active && setLoading(false)); return () => { active = false; }; }, [slug]);

  const toggleFollow = async () => {
    if (!user) return navigate("/login", { state: { from: `/artist/${slug}` } });
    setBusy(true);
    try {
      if (data.artist.is_following) await cutinappService.unfollow("artist", data.artist.id);
      else await cutinappService.follow("artist", data.artist.id);
      await load();
    } catch (e) { setError(e?.message || "Não foi possível atualizar o acompanhamento."); }
    finally { setBusy(false); }
  };

  const currentMembers = useMemo(() => (social.members || []).filter((member) => member.is_current), [social.members]);
  const formerMembers = useMemo(() => (social.members || []).filter((member) => !member.is_current), [social.members]);

  if (loading) return <div className="cut-app-page"><NavlogComponent /><ProcessingIndicatorComponent label="Carregando artista" /></div>;
  if (!data) return <div className="cut-app-page"><NavlogComponent /><Container className="py-5"><Alert variant="danger">{error || "Artista não encontrado."}</Alert></Container></div>;
  const { artist, upcoming_events: upcoming = [], past_events: past = [] } = data;
  const isGroup = GROUP_TYPES.has(artist.artist_type);
  const instagramHref = safeExternalHref(artist.instagram_url);
  const spotifyHref = safeExternalHref(artist.spotify_url);

  return <div className="cut-app-page"><NavlogComponent />
    <section className="cut-profile-hero" style={artist.cover ? { backgroundImage: `linear-gradient(180deg,rgba(2,8,13,.1),rgba(2,8,13,.95)),url(${mediaUrl(artist.cover)})` } : undefined}>
      <Container className="cut-page-container"><div className="cut-profile-hero__content"><div className="cut-profile-avatar">{artist.photo ? <img src={mediaUrl(artist.photo)} alt={artist.stage_name} /> : <span>{artist.stage_name?.slice(0,2).toUpperCase()}</span>}</div><div><span className="cut-eyebrow">{TYPE_LABELS[artist.artist_type] || "Artista Cutinapp"}</span><h1>{artist.stage_name}</h1><p>{artist.city ? `${artist.city}${artist.uf ? ` - ${artist.uf}` : ""}` : ""}</p><div className="cut-social-stats"><span>{artist.followers_count || 0} seguidores</span><span>{upcoming.length} próximos eventos</span>{isGroup && <span>{currentMembers.length} integrante(s)</span>}</div><div className="cut-card-actions mt-3"><Button onClick={toggleFollow} disabled={busy}>{artist.is_following ? "Seguindo" : isGroup ? "Seguir formação" : "Seguir artista"}</Button>{instagramHref && <Button as="a" href={instagramHref} target="_blank" rel="noopener noreferrer" variant="outline-light">Instagram</Button>}{spotifyHref && <Button as="a" href={spotifyHref} target="_blank" rel="noopener noreferrer" variant="outline-light">Spotify</Button>}</div></div></div></Container>
    </section>
    <Container className="cut-page-container py-5">{error && <Alert variant="danger">{error}</Alert>}
      <Row className="g-4"><Col lg={8}>
        <Card className="cut-panel mb-4"><Card.Body className="p-4"><span className="cut-eyebrow">Sobre</span><h2 className="cut-section-title">{artist.stage_name}</h2><p className="cut-body-copy">{artist.bio || "Este perfil artístico ainda não adicionou uma biografia."}</p>{artist.genres?.length > 0 && <div className="cut-active-filters">{artist.genres.map((g) => <span key={g}>{g}</span>)}</div>}</Card.Body></Card>
        {isGroup && <Card className="cut-panel mb-4"><Card.Body className="p-4"><span className="cut-eyebrow">Formação atual</span><h2 className="cut-section-title">Integrantes de {artist.stage_name}</h2>{currentMembers.length === 0 ? <p className="text-secondary">Os integrantes desta formação ainda não foram publicados.</p> : <Row className="g-3">{currentMembers.map((member) => { const linked = member.linked_artist; const clickable = Boolean(linked?.slug); return <Col sm={6} key={member.id}><Card className="cut-event-mini h-100" role={clickable ? "button" : undefined} onClick={() => clickable && navigate(`/artist/${linked.slug}`)}><Card.Body className="d-flex gap-3 align-items-center"><div className="cut-artist-card__photo" style={{ width: 64, height: 64, flex: "0 0 64px" }}>{member.photo || linked?.photo ? <img src={mediaUrl(member.photo || linked.photo)} alt={member.display_name} /> : <span>{member.display_name?.slice(0,2).toUpperCase()}</span>}</div><div><h3 className="mb-1">{member.display_name}</h3><p className="mb-1 text-secondary">{member.role || "Integrante"}</p>{linked && <Badge bg="secondary">Ver perfil Cutinapp</Badge>}</div></Card.Body></Card></Col>; })}</Row>}{formerMembers.length > 0 && <div className="mt-4"><span className="cut-eyebrow">Histórico da formação</span><div className="d-flex flex-wrap gap-2 mt-2">{formerMembers.map((member) => <Badge bg="secondary" key={member.id}>{member.display_name}{member.role ? ` · ${member.role}` : ""}</Badge>)}</div></div>}</Card.Body></Card>}
        {(social.member_of || []).length > 0 && <Card className="cut-panel mb-4"><Card.Body className="p-4"><span className="cut-eyebrow">Também faz parte de</span><div className="d-flex flex-wrap gap-2 mt-2">{social.member_of.map((membership) => <Button key={membership.id} variant="outline-light" onClick={() => navigate(`/artist/${membership.artist.slug}`)}>{membership.artist.stage_name}{membership.role ? ` · ${membership.role}` : ""}</Button>)}</div></Card.Body></Card>}
        <h2 className="cut-section-title">Próximos eventos</h2>{upcoming.length === 0 ? <Card className="cut-empty-state"><Card.Body><p>Nenhum próximo evento anunciado.</p></Card.Body></Card> : <Row className="g-3">{upcoming.map((event) => <Col md={6} key={event.id}><Card className="cut-event-mini" onClick={() => navigate(`/event/${event.slug}`)} role="button"><Card.Body><span className="cut-eyebrow">{event.production?.name || "Evento"}</span><h3>{event.title}</h3><p>{fmt(event.start_date)}</p><p>{event.city || event.venue}</p></Card.Body></Card></Col>)}</Row>}
      </Col><Col lg={4}><Card className="cut-panel"><Card.Body className="p-4"><span className="cut-eyebrow">Histórico</span><h2 className="cut-section-title">Eventos anteriores</h2>{past.length === 0 ? <p className="text-secondary">Ainda sem histórico público.</p> : past.slice(0,8).map((event) => <button key={event.id} className="cut-history-link" onClick={() => navigate(`/event/${event.slug}`)}><strong>{event.title}</strong><span>{fmt(event.start_date)}</span></button>)}</Card.Body></Card></Col></Row>
    </Container>
  </div>;
}
