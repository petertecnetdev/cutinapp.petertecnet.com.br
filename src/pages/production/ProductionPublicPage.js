import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Container, Modal } from "react-bootstrap";
import { useNavigate, useParams } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import ProductionCommunitySection from "../../components/production/ProductionCommunitySection";
import cutinappService from "../../services/CutinappService";
import { storageUrl } from "../../config";
import { safeExternalHref } from "../../utils/safeUrl";
import { activateOnKeyboard } from "../../utils/keyboardActivation";
import "./production-experience.css";
import "../../components/WhatsAppFloatingButton.css";

const mediaUrl = (value) => {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `${storageUrl}${String(value).replace(/^\/?storage\//, "").replace(/^\//, "")}`;
};
const fmt = (value) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value)) : "Data a definir";
const initials = (name) => String(name || "U").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

export default function ProductionPublicPage() {
  const { slug } = useParams();
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [experience, setExperience] = useState({ analytics: { total_views: 0, unique_viewers: 0, viewers: [] }, media: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showViewers, setShowViewers] = useState(false);

  const loadCore = useCallback(async () => {
    const response = await cutinappService.publicProduction(slug);
    setData(response);
    return response;
  }, [slug]);

  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    (async () => {
      try {
        const core = await cutinappService.publicProduction(slug);
        if (!active) return;
        setData(core);
        try {
          const details = await cutinappService.productionExperience(slug);
          if (active) setExperience(details);
        } catch { /* a página principal continua disponível mesmo se métricas falharem */ }
      } catch (err) {
        if (active) setError(err?.message || "Produção não encontrada.");
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [slug]);

  const toggleFollow = async () => {
    if (!user) return navigate("/login", { state: { from: `/production/${slug}/public` } });
    setBusy(true);
    try {
      if (data.production.is_following) await cutinappService.unfollow("production", data.production.id);
      else await cutinappService.follow("production", data.production.id);
      await loadCore();
    } catch (err) { setError(err?.message || "Não foi possível atualizar o acompanhamento."); }
    finally { setBusy(false); }
  };

  const production = data?.production;
  const upcoming = data?.upcoming || [];
  const past = data?.past || [];
  const artists = data?.artists || [];
  const analytics = experience?.analytics || { total_views: 0, unique_viewers: 0, viewers: [] };
  const media = experience?.media || [];
  const instagramHref = safeExternalHref(production?.instagram_url);
  const websiteHref = safeExternalHref(production?.website_url);
  const mapQuery = useMemo(() => {
    if (!production?.location_public) return "";
    if (production.latitude && production.longitude) return `${production.latitude},${production.longitude}`;
    return production.formatted_address || [production.address, production.address_number, production.neighborhood, production.city, production.uf].filter(Boolean).join(", ");
  }, [production]);
  const mapEmbedUrl = mapQuery ? `https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed` : "";

  if (loading) return <div className="cut-app-page"><NavlogComponent /><ProcessingIndicatorComponent label="Carregando produção" /></div>;
  if (!data || !production) return <div className="cut-app-page"><NavlogComponent /><Container className="py-5"><Alert variant="danger">{error || "Produção não encontrada."}</Alert></Container></div>;

  const productionUrl = `${window.location.origin}/production/${encodeURIComponent(slug)}/public`;
  const whatsappShareMessage = `Olha esta produção na Cutinapp: ${production.name}\n${productionUrl}`;
  const whatsappShareHref = `https://wa.me/?text=${encodeURIComponent(whatsappShareMessage)}`;

  return <div className="cut-app-page"><NavlogComponent />
    <section className="cut-profile-hero" style={production.background ? { backgroundImage: `linear-gradient(180deg,rgba(2,8,13,.12),rgba(2,8,13,.95)),url(${mediaUrl(production.background)})` } : undefined}><Container className="cut-page-container"><div className="cut-profile-hero__content"><div className="cut-profile-avatar cut-profile-avatar--square">{production.logo ? <img src={mediaUrl(production.logo)} alt={production.name} /> : <span>{initials(production.name)}</span>}</div><div><span className="cut-eyebrow">Produção Cutinapp</span><h1>{production.name}</h1><p>{production.city ? `${production.city}${production.uf ? ` - ${production.uf}` : ""}` : ""}</p><div className="cut-social-stats"><span>{production.followers_count || 0} seguidores</span><button type="button" className="cut-inline-profile-link" onClick={() => setShowViewers(true)}><i className="fa-regular fa-eye" /> {analytics.total_views || 0} visualizações</button><span>{upcoming.length} próximos eventos</span></div><div className="cut-card-actions mt-3"><Button onClick={toggleFollow} disabled={busy}>{production.is_following ? "Seguindo" : "Seguir produção"}</Button>{instagramHref && <Button as="a" href={instagramHref} target="_blank" rel="noopener noreferrer" variant="outline-light" className="cut-production-icon-link cut-production-icon-link--instagram" aria-label="Instagram" title="Instagram"><i className="fa-brands fa-instagram" /></Button>}{websiteHref && <Button as="a" href={websiteHref} target="_blank" rel="noopener noreferrer" variant="outline-light" className="cut-production-icon-link" aria-label="Site" title="Site"><i className="fa-solid fa-globe" /></Button>}</div></div></div></Container></section>

    <Container className="cut-page-container py-5">{error && <Alert variant="danger" dismissible onClose={() => setError("")}>{error}</Alert>}
      <div className="cut-production-public-about">
        <Card className="cut-panel"><Card.Body className="p-4 p-lg-5"><span className="cut-eyebrow">Sobre a produção</span><h2 className="cut-section-title mt-2">{production.name}</h2><p className="cut-body-copy">{production.description || "Esta produção ainda não adicionou uma apresentação pública."}</p><div className="cut-production-public-social">{instagramHref && <Button as="a" href={instagramHref} target="_blank" rel="noopener noreferrer" variant="outline-light"><i className="fa-brands fa-instagram me-2" />Instagram</Button>}{websiteHref && <Button as="a" href={websiteHref} target="_blank" rel="noopener noreferrer" variant="outline-light"><i className="fa-solid fa-globe me-2" />Site</Button>}</div></Card.Body></Card>
        <Card className="cut-panel cut-production-location-card"><Card.Body className="p-4"><span className="cut-eyebrow">Localização</span><h2 className="cut-section-title mt-2">Onde acontece</h2>{mapEmbedUrl ? <><div className="cut-production-location-copy"><i className="fa-solid fa-location-dot" /><span>{production.formatted_address || [production.address, production.address_number, production.city, production.uf].filter(Boolean).join(", ")}</span></div><iframe title={`Mapa de ${production.name}`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" src={mapEmbedUrl} /></> : <p className="text-muted mb-0">Esta produção ainda não publicou sua localização.</p>}</Card.Body></Card>
      </div>

      <section className="cut-production-section"><div className="cut-production-section-head"><div><span className="cut-eyebrow">Agenda</span><h2>Próximos eventos</h2></div></div>{upcoming.length === 0 ? <Card className="cut-empty-state"><Card.Body><p>Nenhum evento anunciado no momento.</p></Card.Body></Card> : <div className="cut-production-events-carousel">{upcoming.map((event) => <article className="cut-production-event-slide" key={event.id} role="link" tabIndex={0} aria-label={`Abrir evento ${event.title}`} onClick={() => navigate(`/event/${event.slug}`)} onKeyDown={(e) => activateOnKeyboard(e, () => navigate(`/event/${event.slug}`))}><div className="cut-production-event-slide__media">{event.image ? <img src={mediaUrl(event.image)} alt={event.title} loading="lazy" decoding="async" /> : <div className="cut-production-event-slide__fallback"><i className="fa-regular fa-calendar" /></div>}</div><div className="cut-production-event-slide__body"><span className="cut-eyebrow">{event.category || "Evento"}</span><h3>{event.title}</h3><p><i className="fa-regular fa-calendar me-2" />{fmt(event.start_date)}</p><p><i className="fa-solid fa-location-dot me-2" />{event.venue || event.city || "Local a definir"}</p></div></article>)}</div>}</section>

      {media.length > 0 && <section className="cut-production-section cut-production-gallery"><div className="cut-production-section-head"><div><span className="cut-eyebrow">{production.type === "fixed" ? "O espaço" : "Galeria"}</span><h2>{production.type === "fixed" ? "Conheça o local" : "Fotos da produção"}</h2></div></div><div className="cut-production-gallery-grid">{media.map((item) => <figure className="cut-production-gallery-item" key={item.id}><img src={mediaUrl(item.url)} alt={item.caption || `Foto de ${production.name}`} loading="lazy" />{item.caption && <figcaption>{item.caption}</figcaption>}</figure>)}</div></section>}

      {artists.length > 0 && <section className="cut-production-section"><div className="cut-production-section-head"><div><span className="cut-eyebrow">Conexões</span><h2>Artistas relacionados</h2></div></div><div className="cut-artist-strip">{artists.map((artist) => <button key={artist.id} onClick={() => navigate(`/artist/${artist.slug}`)}><span>{artist.stage_name?.slice(0, 2).toUpperCase()}</span><strong>{artist.stage_name}</strong></button>)}</div></section>}

      {past.length > 0 && <section className="cut-production-section"><Card className="cut-panel"><Card.Body className="p-4"><span className="cut-eyebrow">Histórico</span><h2 className="cut-section-title">Eventos anteriores</h2>{past.slice(0, 12).map((event) => <button key={event.id} className="cut-history-link" onClick={() => navigate(`/event/${event.slug}`)}><strong>{event.title}</strong><span>{fmt(event.start_date)}</span></button>)}</Card.Body></Card></section>}

      <ProductionCommunitySection production={production} />
    </Container>

    <a
      className="cut-whatsapp-fab"
      href={whatsappShareHref}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Compartilhar produção no WhatsApp"
      title="Compartilhar produção no WhatsApp"
    >
      <i className="fa-brands fa-whatsapp" aria-hidden="true" />
      <span>Compartilhar</span>
    </a>

    <Modal show={showViewers} onHide={() => setShowViewers(false)} centered><Modal.Header closeButton><Modal.Title>Quem visualizou</Modal.Title></Modal.Header><Modal.Body>{analytics.viewers?.length ? <div className="cut-viewer-list">{analytics.viewers.map((viewer) => <div className="cut-viewer-row" key={viewer.id}><div className="cut-viewer-avatar">{viewer.avatar ? <img src={mediaUrl(viewer.avatar)} alt="" /> : initials(viewer.name)}</div><div><strong>{viewer.name}</strong><small>{viewer.last_viewed_at ? `Última visita: ${fmt(viewer.last_viewed_at)}` : "Visitou a produção"}</small></div><span>{viewer.views_count} {viewer.views_count === 1 ? "visita" : "visitas"}</span></div>)}</div> : <p className="text-muted mb-0">As visualizações anônimas entram no total. Usuários identificados aparecem aqui quando acessarem a página.</p>}</Modal.Body></Modal>
  </div>;
}
