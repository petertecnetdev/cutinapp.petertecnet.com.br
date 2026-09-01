import React, { useContext, useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Row } from "react-bootstrap";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import EventCommunitySection from "../../components/event/EventCommunitySection";
import { AuthContext } from "../../context/AuthContext";
import eventService from "../../services/EventService";
import cutinappService from "../../services/CutinappService";
import { storageUrl } from "../../config";

const formatDate = (value) => value
  ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value))
  : "Data não informada";

const buildMapEmbedUrl = (event) => {
  if (!event) return "";
  let query = "";
  if (event.google_maps_url) {
    try {
      const url = new URL(event.google_maps_url);
      query = url.searchParams.get("q") || url.searchParams.get("query") || "";
      if (!query && url.pathname.includes("/place/")) query = decodeURIComponent(url.pathname.split("/place/")[1]?.split("/")[0] || "").replace(/\+/g, " ");
    } catch (_) { query = ""; }
  }
  if (!query) query = [event.venue, event.address, event.city, event.uf].filter(Boolean).join(", ");
  return query ? `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed` : "";
};

export default function EventViewPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const [data, setData] = useState(null);
  const [artists, setArtists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [claimingId, setClaimingId] = useState(null);
  const [artistClaimingId, setArtistClaimingId] = useState(null);
  const [socialBusy, setSocialBusy] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [interested, setInterested] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([eventService.view(slug), cutinappService.publicEventArtists(slug).catch(() => [])])
      .then(([response, lineup]) => { if (active) { setData(response); setArtists(lineup); } })
      .catch((err) => active && setError(err?.message || "Não foi possível carregar este evento."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [slug]);

  const event = data?.event || null;
  const tickets = useMemo(() => (data?.tickets || []).filter((ticket) => Number(ticket.price) === 0), [data]);
  const claimableArtists = useMemo(() => artists.filter((artist) => !artist.claimed_at), [artists]);
  const isOwner = Boolean(event?.production?.user_id && Number(event.production.user_id) === Number(user?.id));
  const mapEmbedUrl = useMemo(() => buildMapEmbedUrl(event), [event]);

  const claim = async (ticket) => {
    if (!user) return navigate("/login", { state: { from: `${location.pathname}${location.search}` } });
    if (!ticket.available) return;
    setClaimingId(ticket.id); setError(""); setSuccess("");
    try {
      const response = await cutinappService.claimCourtesy(ticket.id);
      setSuccess(response.already_issued ? "Você já tinha este ingresso. Abrindo sua carteira..." : "Ingresso emitido. Seu QR Code já está disponível.");
      window.setTimeout(() => navigate(`/passes/${response.pass?.id || ""}`.replace(/\/$/, "")), 450);
    } catch (err) { setError(err?.message || "Não foi possível retirar este ingresso."); }
    finally { setClaimingId(null); }
  };

  const claimArtist = async (artist) => {
    const from = `${location.pathname}${location.search}`;
    if (!user) {
      return navigate("/register", {
        state: { from, artistClaim: { eventId: event.id, artistId: artist.id, artistName: artist.stage_name } },
      });
    }

    setArtistClaimingId(artist.id); setError(""); setSuccess("");
    try {
      const response = await cutinappService.claimArtistEvent(event.id, artist.id);
      setSuccess(response.message || "Solicitação de vínculo enviada ao produtor.");
    } catch (err) { setError(err?.message || "Não foi possível enviar a reivindicação deste vínculo artístico."); }
    finally { setArtistClaimingId(null); }
  };

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: event?.title || "Evento Cutinapp", text: event?.city ? `${event.title} em ${event.city}` : event?.title, url });
      else { await navigator.clipboard.writeText(url); setSuccess("Link do evento copiado."); }
    } catch (err) { if (err?.name !== "AbortError") setError("Não foi possível compartilhar neste navegador."); }
  };

  const setEngagement = async (kind) => {
    if (!user) return navigate("/login", { state: { from: `${location.pathname}${location.search}` } });
    setSocialBusy(true); setError("");
    try {
      const nextFavorite = kind === "favorite" ? !favorite : favorite;
      const nextInterested = kind === "interested" ? !interested : interested;
      await cutinappService.engagement(event.id, { is_favorite: nextFavorite, is_interested: nextInterested });
      setFavorite(nextFavorite); setInterested(nextInterested);
    } catch (err) { setError(err?.message || "Não foi possível salvar sua preferência."); }
    finally { setSocialBusy(false); }
  };

  return <div className="cut-app-page"><NavlogComponent />{(loading || claimingId || artistClaimingId) && <ProcessingIndicatorComponent label={claimingId ? "Emitindo ingresso" : artistClaimingId ? "Enviando reivindicação" : "Carregando evento"} />}
    {!loading && event && <>
      <section className="cut-event-hero cut-event-hero--premium" style={event.image ? { backgroundImage: `linear-gradient(180deg,rgba(3,10,16,.08),rgba(3,10,16,.98)),url(${storageUrl}${String(event.image).replace(/^\//, "")})` } : undefined}>
        <Container className="cut-page-container"><div className="cut-event-hero__content"><div className="d-flex flex-wrap gap-2 mb-3">{event.category && <Badge bg="dark">{event.category}</Badge>}<Badge bg="success">Publicado</Badge>{tickets.some((t) => t.available) && <Badge bg="info" text="dark">Ingressos disponíveis</Badge>}</div><h1>{event.title}</h1><p className="cut-event-hero__date">{formatDate(event.start_date)}</p><span>{event.venue || event.address}{event.city ? ` · ${event.city}${event.uf ? ` - ${event.uf}` : ""}` : ""}</span>{event.production?.name && <button className="cut-inline-profile-link" onClick={() => navigate(`/production/${event.production.slug}/public`)}>Por {event.production.name} <i className="fa-solid fa-arrow-up-right-from-square" /></button>}<div className="cut-card-actions mt-4"><Button onClick={share}><i className="fa-solid fa-share-nodes me-2" />Compartilhar</Button><Button variant={interested ? "info" : "outline-light"} onClick={() => setEngagement("interested")} disabled={socialBusy}><i className="fa-regular fa-star me-2" />Tenho interesse</Button><Button variant={favorite ? "danger" : "outline-light"} onClick={() => setEngagement("favorite")} disabled={socialBusy}><i className={`${favorite ? "fa-solid" : "fa-regular"} fa-heart me-2`} />{favorite ? "Salvo" : "Salvar"}</Button><Button variant="outline-light" href="#comunidade"><i className="fa-regular fa-comments me-2" />Conversa</Button>{event.google_maps_url && <Button variant="outline-light" as="a" href={event.google_maps_url} target="_blank" rel="noreferrer"><i className="fa-solid fa-location-arrow me-2" />Maps</Button>}</div></div></Container>
      </section>

      <Container className="cut-page-container py-4 py-lg-5">{error && <Alert variant="danger">{error}</Alert>}{success && <Alert variant="success">{success}</Alert>}
        {location.state?.artistClaim && <Alert variant="info">Sua conta foi criada. Agora selecione abaixo o artista que representa você e envie a reivindicação ao produtor deste evento.</Alert>}
        {artists.length > 0 && <section className="mb-5"><div className="cut-section-heading"><div><span className="cut-eyebrow">Line-up</span><h2>Quem faz este evento acontecer</h2></div></div><div className="cut-lineup-grid">{artists.map((artist) => <button key={artist.id} className={`cut-lineup-card ${artist.pivot?.is_headliner ? "cut-lineup-card--headliner" : ""}`} onClick={() => navigate(`/artist/${artist.slug}`)}><div className="cut-lineup-card__avatar">{artist.photo ? <img src={/^https?:/.test(artist.photo) ? artist.photo : `${storageUrl}${String(artist.photo).replace(/^\//, "")}`} alt={artist.stage_name} /> : <span>{artist.stage_name?.slice(0,2).toUpperCase()}</span>}</div><div><span>{artist.pivot?.is_headliner ? "Atração principal" : artist.pivot?.participation_type || "Artista"}</span><strong>{artist.stage_name}</strong>{artist.pivot?.scheduled_at && <small>{formatDate(artist.pivot.scheduled_at)}</small>}{artist.pivot?.stage && <small>{artist.pivot.stage}</small>}</div><i className="fa-solid fa-chevron-right" /></button>)}</div>
          {claimableArtists.length > 0 && <Card className="cut-panel mt-4"><Card.Body className="p-4"><span className="cut-eyebrow">Artista do evento?</span><h3 className="cut-section-title">Reivindique seu vínculo</h3><p className="text-secondary">Se o produtor cadastrou você antes da criação da sua conta, escolha seu perfil abaixo. O produtor receberá a solicitação e confirmará que você realmente faz parte deste line-up.</p><div className="d-flex flex-wrap gap-2">{claimableArtists.map((artist) => <Button key={artist.id} variant="outline-light" onClick={() => claimArtist(artist)} disabled={artistClaimingId === artist.id}><i className="fa-solid fa-user-check me-2" />Sou {artist.stage_name}</Button>)}</div>{!user && <small className="d-block text-secondary mt-3">Você será direcionado ao cadastro e voltará para este evento após confirmar o e-mail.</small>}</Card.Body></Card>}
        </section>}

        <Row className="g-4"><Col lg={8}>
          <Card className="cut-panel mb-4"><Card.Body className="p-4 p-lg-5"><span className="cut-eyebrow">Sobre o evento</span><h2 className="cut-section-title mt-2">Informações</h2><p className="cut-body-copy">{event.description}</p><div className="cut-event-details"><div><i className="fa-regular fa-calendar" /><span><strong>Início</strong>{formatDate(event.start_date)}</span></div><div><i className="fa-regular fa-clock" /><span><strong>Término</strong>{formatDate(event.end_date)}</span></div><div><i className="fa-solid fa-location-dot" /><span><strong>Local</strong>{event.venue || event.address}</span></div>{event.city && <div><i className="fa-solid fa-map" /><span><strong>Cidade</strong>{event.city}{event.uf ? ` - ${event.uf}` : ""}</span></div>}</div></Card.Body></Card>
          {event.production?.name && <Card className="cut-panel mb-4"><Card.Body className="p-4"><span className="cut-eyebrow">Responsável</span><div className="cut-production-inline"><div><h2>{event.production.name}</h2><p>Veja os próximos eventos e acompanhe esta produção.</p></div><Button variant="outline-light" onClick={() => navigate(`/production/${event.production.slug}/public`)}>Ver página da produção</Button></div></Card.Body></Card>}
          {mapEmbedUrl && <Card className="cut-panel"><Card.Body className="p-0 overflow-hidden"><iframe title={`Mapa de ${event.title}`} src={mapEmbedUrl} width="100%" height="360" style={{ border: 0, display: "block" }} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen /></Card.Body></Card>}
        </Col>
        <Col lg={4}><Card className="cut-panel cut-ticket-purchase-panel"><Card.Body className="p-4"><span className="cut-eyebrow">Entrada</span><h2 className="cut-section-title mt-2">Ingressos</h2>
          {tickets.length === 0 ? <div className="cut-empty-state-inline"><p>Nenhum ingresso gratuito disponível neste momento.</p>{isOwner && <Button onClick={() => navigate(`/ticket/create?eventId=${event.id}`)}>Criar cortesia</Button>}</div> : <div className="cut-ticket-list">{tickets.map((ticket) => { const remaining = Number(ticket.remaining ?? 0); const available = Boolean(ticket.available); return <div className="cut-ticket-option" key={ticket.id}><div><span className="cut-ticket-kicker">{ticket.type || ticket.ticket_type || "Ingresso"}</span><strong>{ticket.name}</strong><span>Grátis · {ticket.expired ? "prazo encerrado" : available ? `${remaining} restante${remaining === 1 ? "" : "s"}` : "esgotado"}</span>{ticket.limit_date && !ticket.expired && <small>Retirada até {formatDate(ticket.limit_date)}</small>}</div><Button onClick={() => claim(ticket)} disabled={!available || claimingId === ticket.id}>{available ? (user ? "Obter ingresso" : "Entrar para obter") : ticket.expired ? "Prazo encerrado" : "Esgotado"}</Button></div>; })}</div>}
          {isOwner && <div className="cut-owner-actions mt-4"><Button variant="outline-light" onClick={() => navigate(`/event/edit/${event.id}`)}>Gerenciar</Button><Button variant="outline-light" onClick={() => navigate(`/event/${event.id}/lineup`)}>Line-up</Button><Button variant="outline-light" onClick={() => navigate(`/event/${event.id}/artist-claims`)}>Reivindicações</Button><Button variant="outline-light" onClick={() => navigate(`/checkin?eventId=${event.id}`)}>Portaria</Button></div>}
        </Card.Body></Card></Col></Row>

        <EventCommunitySection event={event} isOwner={isOwner} />
      </Container>
    </>}
    {!loading && !event && <Container className="cut-page-container py-5"><Alert variant="danger">{error || "Evento não encontrado ou não está publicado."}</Alert><Button variant="outline-light" onClick={() => navigate("/event")}>Voltar aos eventos</Button></Container>}
  </div>;
}
