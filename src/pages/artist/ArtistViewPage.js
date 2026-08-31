import React, { useContext, useEffect, useState } from "react";
import { Alert, Button, Card, Col, Container, Row } from "react-bootstrap";
import { useNavigate, useParams } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import cutinappService from "../../services/CutinappService";
import { storageUrl } from "../../config";

const fmt = (value) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "";
const mediaUrl = (value) => !value ? "" : /^https?:\/\//i.test(value) ? value : `${storageUrl}${String(value).replace(/^\//, "")}`;

export default function ArtistViewPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => cutinappService.publicArtist(slug).then(setData);
  useEffect(() => { let active = true; setLoading(true); cutinappService.publicArtist(slug).then((r) => active && setData(r)).catch((e) => active && setError(e?.message || "Artista não encontrado." )).finally(() => active && setLoading(false)); return () => { active = false; }; }, [slug]);

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

  if (loading) return <div className="cut-app-page"><NavlogComponent /><ProcessingIndicatorComponent label="Carregando artista" /></div>;
  if (!data) return <div className="cut-app-page"><NavlogComponent /><Container className="py-5"><Alert variant="danger">{error || "Artista não encontrado."}</Alert></Container></div>;
  const { artist, upcoming_events: upcoming = [], past_events: past = [] } = data;

  return <div className="cut-app-page"><NavlogComponent />
    <section className="cut-profile-hero" style={artist.cover ? { backgroundImage: `linear-gradient(180deg,rgba(2,8,13,.1),rgba(2,8,13,.95)),url(${mediaUrl(artist.cover)})` } : undefined}>
      <Container className="cut-page-container"><div className="cut-profile-hero__content"><div className="cut-profile-avatar">{artist.photo ? <img src={mediaUrl(artist.photo)} alt={artist.stage_name} /> : <span>{artist.stage_name?.slice(0,2).toUpperCase()}</span>}</div><div><span className="cut-eyebrow">Artista Cutinapp</span><h1>{artist.stage_name}</h1><p>{artist.city ? `${artist.city}${artist.uf ? ` - ${artist.uf}` : ""}` : ""}</p><div className="cut-social-stats"><span>{artist.followers_count || 0} seguidores</span><span>{upcoming.length} próximos eventos</span></div><div className="cut-card-actions mt-3"><Button onClick={toggleFollow} disabled={busy}>{artist.is_following ? "Seguindo" : "Seguir artista"}</Button>{artist.instagram_url && <Button as="a" href={artist.instagram_url} target="_blank" rel="noreferrer" variant="outline-light">Instagram</Button>}{artist.spotify_url && <Button as="a" href={artist.spotify_url} target="_blank" rel="noreferrer" variant="outline-light">Spotify</Button>}</div></div></div></Container>
    </section>
    <Container className="cut-page-container py-5">{error && <Alert variant="danger">{error}</Alert>}
      <Row className="g-4"><Col lg={8}><Card className="cut-panel mb-4"><Card.Body className="p-4"><span className="cut-eyebrow">Sobre</span><h2 className="cut-section-title">{artist.stage_name}</h2><p className="cut-body-copy">{artist.bio || "Este artista ainda não adicionou uma biografia."}</p>{artist.genres?.length > 0 && <div className="cut-active-filters">{artist.genres.map((g) => <span key={g}>{g}</span>)}</div>}</Card.Body></Card><h2 className="cut-section-title">Próximos eventos</h2>{upcoming.length === 0 ? <Card className="cut-empty-state"><Card.Body><p>Nenhum próximo evento anunciado.</p></Card.Body></Card> : <Row className="g-3">{upcoming.map((event) => <Col md={6} key={event.id}><Card className="cut-event-mini" onClick={() => navigate(`/event/${event.slug}`)} role="button"><Card.Body><span className="cut-eyebrow">{event.production?.name || "Evento"}</span><h3>{event.title}</h3><p>{fmt(event.start_date)}</p><p>{event.city || event.venue}</p></Card.Body></Card></Col>)}</Row>}</Col><Col lg={4}><Card className="cut-panel"><Card.Body className="p-4"><span className="cut-eyebrow">Histórico</span><h2 className="cut-section-title">Eventos anteriores</h2>{past.length === 0 ? <p className="text-secondary">Ainda sem histórico público.</p> : past.slice(0,8).map((event) => <button key={event.id} className="cut-history-link" onClick={() => navigate(`/event/${event.slug}`)}><strong>{event.title}</strong><span>{fmt(event.start_date)}</span></button>)}</Card.Body></Card></Col></Row>
    </Container>
  </div>;
}
