import React, { useContext, useEffect, useState } from "react";
import { Alert, Button, Card, Col, Container, Row } from "react-bootstrap";
import { useNavigate, useParams } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import cutinappService from "../../services/CutinappService";
import { storageUrl } from "../../config";
import { safeExternalHref } from "../../utils/safeUrl";

const mediaUrl = (value) => !value ? "" : /^https?:\/\//i.test(value) ? value : `${storageUrl}${String(value).replace(/^\//, "")}`;
const fmt = (value) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "";

export default function ProductionPublicPage() {
  const { slug } = useParams();
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => cutinappService.publicProduction(slug).then(setData);
  useEffect(() => { let active = true; cutinappService.publicProduction(slug).then((r) => active && setData(r)).catch((e) => active && setError(e?.message || "Produção não encontrada." )).finally(() => active && setLoading(false)); return () => { active = false; }; }, [slug]);

  const toggleFollow = async () => {
    if (!user) return navigate("/login", { state: { from: `/production/${slug}/public` } });
    setBusy(true);
    try {
      if (data.production.is_following) await cutinappService.unfollow("production", data.production.id);
      else await cutinappService.follow("production", data.production.id);
      await load();
    } catch (e) { setError(e?.message || "Não foi possível atualizar o acompanhamento."); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="cut-app-page"><NavlogComponent /><ProcessingIndicatorComponent label="Carregando produção" /></div>;
  if (!data) return <div className="cut-app-page"><NavlogComponent /><Container className="py-5"><Alert variant="danger">{error || "Produção não encontrada."}</Alert></Container></div>;
  const { production, upcoming = [], past = [], artists = [] } = data;
  const instagramHref = safeExternalHref(production.instagram_url);
  const websiteHref = safeExternalHref(production.website_url);

  return <div className="cut-app-page"><NavlogComponent />
    <section className="cut-profile-hero" style={production.background ? { backgroundImage: `linear-gradient(180deg,rgba(2,8,13,.12),rgba(2,8,13,.95)),url(${mediaUrl(production.background)})` } : undefined}>
      <Container className="cut-page-container"><div className="cut-profile-hero__content"><div className="cut-profile-avatar cut-profile-avatar--square">{production.logo ? <img src={mediaUrl(production.logo)} alt={production.name} /> : <span>{production.name?.slice(0,2).toUpperCase()}</span>}</div><div><span className="cut-eyebrow">Produção Cutinapp</span><h1>{production.name}</h1><p>{production.city ? `${production.city}${production.uf ? ` - ${production.uf}` : ""}` : ""}</p><div className="cut-social-stats"><span>{production.followers_count || 0} seguidores</span><span>{upcoming.length} próximos eventos</span></div><div className="cut-card-actions mt-3"><Button onClick={toggleFollow} disabled={busy}>{production.is_following ? "Seguindo" : "Seguir produção"}</Button>{instagramHref && <Button as="a" href={instagramHref} target="_blank" rel="noopener noreferrer" variant="outline-light">Instagram</Button>}{websiteHref && <Button as="a" href={websiteHref} target="_blank" rel="noopener noreferrer" variant="outline-light">Site</Button>}</div></div></div></Container>
    </section>
    <Container className="cut-page-container py-5">{error && <Alert variant="danger">{error}</Alert>}
      <Card className="cut-panel mb-5"><Card.Body className="p-4"><span className="cut-eyebrow">Sobre a produção</span><h2 className="cut-section-title">{production.name}</h2><p className="cut-body-copy">{production.description || "Esta produção ainda não adicionou uma apresentação pública."}</p></Card.Body></Card>
      <div className="cut-section-heading"><div><span className="cut-eyebrow">Agenda</span><h2>Próximos eventos</h2></div></div>
      {upcoming.length === 0 ? <Card className="cut-empty-state mb-5"><Card.Body><p>Nenhum evento anunciado no momento.</p></Card.Body></Card> : <Row className="g-4 mb-5">{upcoming.map((event) => <Col md={6} lg={4} key={event.id}><Card className="cut-event-mini h-100" role="button" onClick={() => navigate(`/event/${event.slug}`)}><Card.Body><span className="cut-eyebrow">{event.category || "Evento"}</span><h3>{event.title}</h3><p>{fmt(event.start_date)}</p><p>{event.venue || event.city}</p></Card.Body></Card></Col>)}</Row>}
      {artists.length > 0 && <><div className="cut-section-heading"><div><span className="cut-eyebrow">Conexões</span><h2>Artistas relacionados</h2></div></div><div className="cut-artist-strip mb-5">{artists.map((artist) => <button key={artist.id} onClick={() => navigate(`/artist/${artist.slug}`)}><span>{artist.stage_name?.slice(0,2).toUpperCase()}</span><strong>{artist.stage_name}</strong></button>)}</div></>}
      {past.length > 0 && <Card className="cut-panel"><Card.Body className="p-4"><span className="cut-eyebrow">Histórico</span><h2 className="cut-section-title">Eventos anteriores</h2>{past.slice(0,12).map((event) => <button key={event.id} className="cut-history-link" onClick={() => navigate(`/event/${event.slug}`)}><strong>{event.title}</strong><span>{fmt(event.start_date)}</span></button>)}</Card.Body></Card>}
    </Container>
  </div>;
}
