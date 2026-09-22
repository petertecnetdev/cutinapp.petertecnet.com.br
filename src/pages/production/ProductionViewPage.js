import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Container, Modal } from "react-bootstrap";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import EventArtwork from "../../components/event/EventArtwork";
const ProductionCommunitySection = React.lazy(() => import("../../components/production/ProductionCommunitySection"));
const ProductionGallery = React.lazy(() => import("../../components/production/ProductionGallery"));
import { FormattedText } from "../../components/editor/FormattedText";
import cutinappService from "../../services/CutinappService";
import { storageUrl } from "../../config";
import { safeExternalHref } from "../../utils/safeUrl";
import { activateOnKeyboard } from "../../utils/keyboardActivation";
import "./production-experience.css";

const mediaUrl = (value) => {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `${storageUrl}${String(value).replace(/^\/?storage\//, "").replace(/^\//, "")}`;
};
const fmt = (value) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value)) : "Data a definir";
const initials = (name) => String(name || "U").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

export default function ProductionViewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showViewers, setShowViewers] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [eventsVisible, setEventsVisible] = useState(8);

  const load = useCallback(async () => {
    setError("");
    try { setWorkspace(await cutinappService.productionWorkspace(id)); }
    catch (err) { setError(err?.message || "Não foi possível abrir a produção."); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  const production = workspace?.organization;
  const events = workspace?.events || [];
  const analytics = workspace?.analytics || { total_views: 0, unique_viewers: 0, viewers: [] };
  const media = workspace?.media || [];
  const galleryAlbums = workspace?.gallery?.albums || [];
  const instagramHref = safeExternalHref(production?.instagram_url);
  const websiteHref = safeExternalHref(production?.website_url);

  const mapQuery = useMemo(() => {
    if (!production) return "";
    if (production.latitude && production.longitude) return `${production.latitude},${production.longitude}`;
    const address = production.formatted_address || [production.address, production.address_number, production.neighborhood, production.city, production.uf].filter(Boolean).join(", ");
    return address || [production.name, production.city, production.uf].filter(Boolean).join(", ");
  }, [production]);
  const mapEmbedUrl = mapQuery ? `https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed` : "";

  const shareProductionOnWhatsApp = () => {
    if (!production) return;
    const publicPath = production.slug ? `/production/${production.slug}/public` : window.location.pathname;
    const publicUrl = `${window.location.origin}${publicPath}`;
    const message = `Conheça a produção ${production.name} na Cutinapp: ${publicUrl}`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  };

  if (loading) return <div className="cut-app-page cut-production-themed-page"><NavlogComponent /><ProcessingIndicatorComponent label="Abrindo produção" /></div>;

  const heroStyle = production?.background ? { "--cut-production-public-hero-image": `url(${JSON.stringify(mediaUrl(production.background))})` } : undefined;
  const locationLabel = production ? ([production.formatted_address || [production.address, production.address_number].filter(Boolean).join(", "), production.neighborhood, production.city, production.uf].filter(Boolean).join(" · ") || "Localização não informada") : "";

  return <div className="cut-app-page cut-production-themed-page">
    <NavlogComponent />
    <Container className="cut-page-container pt-4">{location.state?.created && <Alert variant="success">Produção criada com sucesso.</Alert>}{location.state?.updated && <Alert variant="success">Alterações salvas com sucesso.</Alert>}{error && <Alert variant="danger" dismissible onClose={() => setError("")}>{error}</Alert>}</Container>
    {production && <>
      <section className="cut-profile-hero cut-production-themed-page__hero cut-production-themed-page__hero--public" style={heroStyle}><Container className="cut-page-container"><div className="cut-profile-hero__content cut-production-public-identity"><div className="cut-profile-avatar cut-profile-avatar--square cut-production-public-logo">{production.logo ? <img src={mediaUrl(production.logo)} alt={`Logo de ${production.name}`} /> : <span>{initials(production.name)}</span>}</div><div className="cut-production-public-hero-copy"><span className="cut-eyebrow">Produção Cutinapp</span><h1>{production.name}</h1><p>{production.description || "Produção de eventos e experiências."}</p><div className="cut-social-stats"><span><i className="fa-regular fa-calendar me-1" />{production.events_count || events.length} eventos</span><span><i className="fa-regular fa-eye me-1" />{analytics.total_views || 0} visualizações</span><span><i className="fa-regular fa-user me-1" />{production.followers_count || 0} seguidores</span>{production.city && <span><i className="fa-solid fa-location-dot me-1" />{production.city}{production.uf ? ` - ${production.uf}` : ""}</span>}</div><div className="cut-card-actions mt-3"><Button variant="outline-light" onClick={() => navigate("/production/mine")}>Minhas produções</Button><Button variant="outline-light" onClick={() => navigate(`/production/edit/${production.id}`)}>Editar</Button><Button onClick={() => navigate(`/event/create?productionId=${production.id}`)}>Criar evento</Button>{production.slug && <Button variant="outline-light" onClick={() => navigate(`/production/${production.slug}/public`)}><i className="fa-solid fa-arrow-up-right-from-square me-2" />Ver página pública</Button>}<Button variant="success" onClick={shareProductionOnWhatsApp} aria-label={`Compartilhar ${production.name} pelo WhatsApp`} title="Compartilhar pelo WhatsApp"><i className="fa-brands fa-whatsapp me-2" />Compartilhar</Button></div></div></div></Container></section>

      <Container className="cut-page-container py-4 py-lg-5">
        <div className="cut-production-workspace-grid">
          <Card className="cut-panel cut-production-themed-card cut-production-info-card" style={production.background ? { "--cut-production-card-bg": `url(${mediaUrl(production.background)})` } : undefined}><Card.Body className="p-4 p-lg-5"><span className="cut-eyebrow">Sobre a produção</span><h2>{production.fantasy || production.name}</h2><div className={`cut-production-description ${descriptionExpanded ? "is-expanded" : ""}`}><FormattedText className="cut-body-copy" value={production.description} emptyText="Adicione uma apresentação da sua produção para que o público conheça melhor seu trabalho." /></div>{String(production.description || "").replace(/<[^>]*>/g, "").length > 420 && <Button variant="link" className="cut-production-description-toggle" onClick={() => setDescriptionExpanded((value) => !value)}>{descriptionExpanded ? "Mostrar menos" : "Ver mais"}</Button>}<div className="cut-detail-list mt-4"><div><span>Telefone</span><strong>{production.phone || "Não informado"}</strong></div><div><span>CNPJ</span><strong>{production.cnpj || "Não informado"}</strong></div><div><span>Modelo</span><strong>{production.type === "fixed" ? "Espaço fixo" : production.type === "independent" ? "Produção independente" : "Não definido"}</strong></div></div><div className="cut-production-info-actions">{instagramHref && <Button as="a" href={instagramHref} target="_blank" rel="noopener noreferrer" variant="outline-light" className="cut-production-icon-link cut-production-icon-link--instagram" aria-label="Abrir Instagram" title="Instagram"><i className="fa-brands fa-instagram" /></Button>}{websiteHref && <Button as="a" href={websiteHref} target="_blank" rel="noopener noreferrer" variant="outline-light" className="cut-production-icon-link" aria-label="Abrir site" title="Site"><i className="fa-solid fa-globe" /></Button>}</div></Card.Body></Card>

          <div className="d-grid gap-4">
            <Card className="cut-panel"><Card.Body className="p-4"><span className="cut-eyebrow">Alcance</span><h2 className="cut-section-title mt-2">Pessoas conhecendo a produção</h2><div className="cut-production-analytics"><button type="button" onClick={() => setShowViewers(true)}><span>Visualizações</span><strong>{analytics.total_views || 0}</strong></button><button type="button" onClick={() => setShowViewers(true)}><span>Pessoas identificadas</span><strong>{analytics.unique_viewers || 0}</strong></button><div><span>Seguidores</span><strong>{production.followers_count || 0}</strong></div></div></Card.Body></Card>
            <Card className="cut-panel cut-production-location-card"><Card.Body className="p-4"><span className="cut-eyebrow">Localização</span><h2 className="cut-section-title mt-2">Onde encontrar</h2><div className="cut-production-location-copy"><i className="fa-solid fa-location-dot" /><span>{locationLabel}</span></div>{mapEmbedUrl && <><div className="cut-production-location-actions">{!showMap && <Button variant="outline-light" onClick={() => setShowMap(true)}><i className="fa-regular fa-map me-2" />Ver no mapa</Button>}<Button as="a" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`} target="_blank" rel="noopener noreferrer"><i className="fa-solid fa-route me-2" />Como chegar</Button></div>{showMap && <iframe title={`Mapa de ${production.name}`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" src={mapEmbedUrl} />}</>}</Card.Body></Card>
          </div>
        </div>

        <section className="cut-production-section cut-production-agenda-section cut-production-agenda-section--priority"><div className="cut-production-section-head"><div><span className="cut-eyebrow">Agenda</span><h2>Eventos desta produção</h2></div><Button variant="outline-light" onClick={() => navigate(`/event/create?productionId=${production.id}`)}><i className="fa-solid fa-plus me-2" />Novo evento</Button></div>{events.length === 0 ? <Card className="cut-empty-state"><Card.Body><p>Nenhum evento cadastrado nesta produção ainda.</p></Card.Body></Card> : <div className="cut-production-events-carousel">{events.slice(0, eventsVisible).map((event) => <article className="cut-production-event-slide" key={event.id} role="link" tabIndex={0} aria-label={`Abrir evento ${event.title}`} onClick={() => navigate(`/event/${event.slug}`)} onKeyDown={(e) => activateOnKeyboard(e, () => navigate(`/event/${event.slug}`))}><div className="cut-production-event-slide__media"><EventArtwork image={event.image} title={event.title} alt={event.title} loading="lazy" decoding="async" fallbackClassName="cut-production-event-slide__fallback" /></div><div className="cut-production-event-slide__body"><span className="cut-eyebrow">{event.category || "Evento"}</span><h3>{event.title}</h3><p><i className="fa-regular fa-calendar me-2" />{fmt(event.start_date)}</p><p><i className="fa-solid fa-location-dot me-2" />{event.venue || event.city || "Local a definir"}</p></div></article>)}</div>}{eventsVisible < events.length && <div className="cut-production-progressive-actions"><Button variant="outline-light" onClick={() => setEventsVisible((value) => value + 8)}>Carregar mais eventos</Button><span>{Math.min(eventsVisible, events.length)} de {events.length}</span></div>}</section>

        <React.Suspense fallback={<div className="cut-production-section" aria-hidden="true" />}><ProductionGallery
          media={media}
          albums={galleryAlbums}
          productionName={production.name}
          productionType={production.type}
          isOwner
          onManage={() => navigate(`/production/edit/${production.id}#production-editor-gallery`)}
        /></React.Suspense>

        <React.Suspense fallback={null}><ProductionCommunitySection production={production} isOwner /></React.Suspense>
      </Container>

      <Modal show={showViewers} onHide={() => setShowViewers(false)} centered backdrop keyboard contentClassName="cut-viewers-modal"><Modal.Header><Modal.Title>Quem visualizou</Modal.Title></Modal.Header><Modal.Body>{analytics.viewers?.length ? <div className="cut-viewer-list">{analytics.viewers.map((viewer) => <button type="button" className="cut-viewer-row cut-viewer-row--link" key={viewer.id} onClick={() => { setShowViewers(false); navigate(`/profile/${viewer.id}`); }} aria-label={`Abrir perfil de ${viewer.name}`}><div className="cut-viewer-avatar">{viewer.avatar ? <img src={mediaUrl(viewer.avatar)} alt="" /> : initials(viewer.name)}</div><div><strong>{viewer.name}</strong><small>{viewer.last_viewed_at ? `Última visita: ${fmt(viewer.last_viewed_at)}` : "Visitou a produção"}</small></div><span>{viewer.views_count} {viewer.views_count === 1 ? "visita" : "visitas"}</span></button>)}</div> : <p className="text-muted mb-0">As visualizações anônimas entram no total, mas só usuários identificados aparecem nesta lista.</p>}</Modal.Body></Modal>
    </>}
  </div>;
}
