import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import { Alert, Button, Card, Container, Dropdown, Modal } from "react-bootstrap";
import { useNavigate, useParams } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import ProductionTicketCartModal from "../../components/event/ProductionTicketCartModal";
import EventDiscoveryRail from "../../components/event/EventDiscoveryRail";
import ProductionNextEventHero from "../../components/production/ProductionNextEventHero";
import { FormattedText } from "../../components/editor/FormattedText";
import cutinappService from "../../services/CutinappService";
import { storageUrl } from "../../config";
import { safeExternalHref } from "../../utils/safeUrl";
import { subscribeGalleryUpdates } from "../../utils/gallerySync";
import "./production-experience.css";
import "./production-view-evolution.css";
import "../../components/WhatsAppFloatingButton.css";

const ProductionCommunitySection = React.lazy(() => import("../../components/production/ProductionCommunitySection"));
const ProductionGallery = React.lazy(() => import("../../components/production/ProductionGallery"));

const mediaUrl = (value) => {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `${storageUrl}${String(value).replace(/^\/?storage\//, "").replace(/^\//, "")}`;
};

const fmt = (value) => value
  ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value))
  : "Data a definir";

const initials = (name) => String(name || "U").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

export default function ProductionPublicPage() {
  const { slug } = useParams();
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [experience, setExperience] = useState({ analytics: { total_views: 0, unique_viewers: 0, viewers: [] }, media: [], gallery: { albums: [] } });
  const [loading, setLoading] = useState(true);
  const [secondaryLoading, setSecondaryLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [ticketCartOpen, setTicketCartOpen] = useState(false);
  const [sellableUpcoming, setSellableUpcoming] = useState([]);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState("inicio");
  const [tabsPinned, setTabsPinned] = useState(false);
  const mapSectionRef = useRef(null);
  const tabsSentinelRef = useRef(null);
  const contentTopRef = useRef(null);
  const eventsSectionRef = useRef(null);
  const photosSectionRef = useRef(null);
  const aboutSectionRef = useRef(null);
  const postsSectionRef = useRef(null);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [slug]);

  const loadCore = useCallback(async () => {
    const response = await cutinappService.publicProduction(slug);
    setData(response);
    return response;
  }, [slug]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setSecondaryLoading(true);
    setError("");
    setDescriptionExpanded(false);
    setShowMap(false);

    (async () => {
      try {
        const core = await cutinappService.publicProduction(slug);
        if (!active) return;
        setData(core);
        setLoading(false);

        const productionId = Number(core?.production?.id || 0);
        const tasks = [];

        if (productionId > 0) {
          tasks.push(
            cutinappService.publicEvents({ production_id: productionId, available: 1, view: "compact", per_page: 24, sort: "soonest" })
              .then((response) => { if (active) setSellableUpcoming(response?.events?.data || response?.data || []); })
              .catch(() => { if (active) setSellableUpcoming([]); })
          );
        }

        tasks.push(
          cutinappService.productionExperience(slug)
            .then((details) => { if (active) setExperience(details); })
            .catch(() => null)
        );

        await Promise.allSettled(tasks);
        if (active) setSecondaryLoading(false);
      } catch (err) {
        if (!active) return;
        setError(err?.message || "Produção não encontrada.");
        setLoading(false);
        setSecondaryLoading(false);
      }
    })();

    return () => { active = false; };
  }, [slug]);

  const production = data?.production;

  useEffect(() => {
    const productionId = Number(production?.id || 0);
    if (!productionId) return undefined;

    let active = true;
    let timer = null;
    const unsubscribe = subscribeGalleryUpdates(productionId, (payload) => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        try {
          const details = await cutinappService.productionExperience(slug);
          if (active) setExperience(details);
          if (payload?.action === "cover" && active) await loadCore();
        } catch (_) {
          // Keep the last valid public state.
        }
      }, 220);
    });

    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
      unsubscribe();
    };
  }, [production?.id, slug, loadCore]);

  useEffect(() => {
    const sentinel = tabsSentinelRef.current;
    if (!sentinel) return undefined;
    const onScroll = () => {
      const navHeight = document.querySelector(".navbar")?.getBoundingClientRect().height || 0;
      setTabsPinned(sentinel.getBoundingClientRect().top <= navHeight);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [production?.id]);

  const setFollowingState = useCallback((following) => {
    setData((current) => {
      if (!current?.production) return current;
      const wasFollowing = Boolean(current.production.is_following);
      if (wasFollowing === following) return current;

      const followersCount = Number(current.production.followers_count || 0);
      return {
        ...current,
        production: {
          ...current.production,
          is_following: following,
          followers_count: Math.max(0, followersCount + (following ? 1 : -1)),
        },
      };
    });
  }, []);

  const updateFollow = async (nextFollowing) => {
    if (!user) {
      navigate("/login", { state: { from: `/production/${slug}/public` } });
      return;
    }
    if (busy || !data?.production?.id) return;

    const previousFollowing = Boolean(data.production.is_following);
    if (previousFollowing === nextFollowing) return;

    setError("");
    setBusy(true);
    setFollowingState(nextFollowing);

    try {
      if (nextFollowing) await cutinappService.follow("production", data.production.id);
      else await cutinappService.unfollow("production", data.production.id);
    } catch (err) {
      setFollowingState(previousFollowing);
      setError(err?.response?.data?.message || err?.message || "Não foi possível atualizar o acompanhamento.");
    } finally {
      setBusy(false);
    }
  };

  const followProduction = () => updateFollow(true);
  const unfollowProduction = () => updateFollow(false);

  if (loading) {
    return <div className="cut-app-page"><NavlogComponent /><ProcessingIndicatorComponent label="Abrindo produção" /></div>;
  }

  if (!data || !production) {
    return <div className="cut-app-page"><NavlogComponent /><Container className="py-5"><Alert variant="danger">{error || "Produção não encontrada."}</Alert></Container></div>;
  }

  const isOwner = Boolean(user && Number(production.user_id) === Number(user.id));
  const producer = production?.user || null;
  const producerName = producer?.name || [producer?.first_name, producer?.last_name].filter(Boolean).join(" ") || producer?.user_name || "Produtor";
  const producerAvatar = mediaUrl(producer?.avatar || producer?.photo || producer?.image);

  const upcoming = Array.isArray(data?.upcoming) ? data.upcoming : [];
  const past = Array.isArray(data?.past) ? data.past : [];
  const artists = Array.isArray(data?.artists) ? data.artists : [];
  const analytics = experience?.analytics || { total_views: 0, unique_viewers: 0, viewers: [] };
  const media = Array.isArray(experience?.media) ? experience.media : [];
  const galleryAlbums = Array.isArray(experience?.gallery?.albums) ? experience.gallery.albums : [];
  const instagramHref = safeExternalHref(production?.instagram_url);
  const websiteHref = safeExternalHref(production?.website_url);
  const publicHeroStyle = production?.background
    ? { "--cut-production-public-hero-image": `url(${JSON.stringify(mediaUrl(production.background))})` }
    : undefined;

  const mapQuery = production?.location_public
    ? (production.latitude && production.longitude
      ? `${production.latitude},${production.longitude}`
      : production.formatted_address || [production.address, production.address_number, production.neighborhood, production.city, production.uf].filter(Boolean).join(", "))
    : "";
  const mapEmbedUrl = mapQuery ? `https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed` : "";
  const mapsHref = mapQuery ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}` : "";
  const productionUrl = `${window.location.origin}/production/${encodeURIComponent(slug)}/public`;
  const whatsappShareMessage = `Olha esta produção na Cutinapp: ${production.name}\n${productionUrl}`;
  const whatsappShareHref = `https://wa.me/?text=${encodeURIComponent(whatsappShareMessage)}`;
  const descriptionText = String(production.description || "");
  const longDescription = descriptionText.replace(/<[^>]*>/g, "").length > 420;
  const phoneDigits = String(production.phone || "").replace(/\D/g, "");
  const normalizedPhone = phoneDigits ? (phoneDigits.startsWith("55") ? phoneDigits : `55${phoneDigits}`) : "";
  const phoneHref = normalizedPhone ? `tel:+${normalizedPhone}` : "";
  const whatsappContactHref = normalizedPhone ? `https://wa.me/${normalizedPhone}` : "";
  const nextEvent = upcoming[0] || null;

  const goToTab = (key) => {
    setActiveTab(key);
    const targets = {
      inicio: contentTopRef,
      eventos: eventsSectionRef,
      fotos: photosSectionRef,
      sobre: aboutSectionRef,
      publicacoes: postsSectionRef,
    };
    window.requestAnimationFrame(() => {
      const node = targets[key]?.current;
      if (!node) return;
      const navOffset = document.querySelector(".cut-production-profile-tabs")?.getBoundingClientRect().height || 0;
      const appNavOffset = document.querySelector("nav")?.getBoundingClientRect().height || 0;
      const top = node.getBoundingClientRect().top + window.scrollY - navOffset - appNavOffset - 12;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    });
  };

  const shareNative = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: production.name, text: `Conheça ${production.name} na Cutinapp`, url: productionUrl });
        return;
      }
      await navigator.clipboard.writeText(productionUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (_) {
      // User cancelling native share is not an error.
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(productionUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (_) {
      setError("Não foi possível copiar o link automaticamente.");
    }
  };

  const revealMap = () => {
    setShowMap(true);
    window.requestAnimationFrame(() => mapSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };

  return (
    <div className="cut-app-page cut-production-themed-page">
      <NavlogComponent />

      <section className="cut-profile-hero cut-production-themed-page__hero cut-production-themed-page__hero--public" style={publicHeroStyle}>
        <Container className="cut-page-container">
          <div className="cut-profile-hero__content cut-production-public-identity">
            <div className="cut-profile-avatar cut-profile-avatar--square cut-production-public-logo">
              {production.logo
                ? <img src={mediaUrl(production.logo)} alt={production.name} loading="eager" decoding="async" />
                : <span>{initials(production.name)}</span>}
            </div>
            <div className="cut-production-public-hero-copy">
              <div className="cut-production-public-meta-row">
                <span className="cut-eyebrow">Produção Cutinapp</span>
                <span className="cut-production-type-chip">{production.type === "fixed" ? "Espaço fixo" : "Produção independente"}</span>
              </div>
              <h1>{production.name}</h1>
              <p className="cut-production-public-location">{production.city ? <><i className="fa-solid fa-location-dot" />{production.city}{production.uf ? ` - ${production.uf}` : ""}</> : "Eventos e experiências"}</p>

              <div className="cut-social-stats">
                <span>{production.followers_count || 0} seguidores</span>
                <button type="button" className="cut-inline-profile-link" onClick={() => setShowViewers(true)}><i className="fa-regular fa-eye" /> {analytics.total_views || 0} visualizações</button>
                <span>{upcoming.length} próximos eventos</span>
              </div>

              {producer?.id && <button type="button" className="cut-production-producer-link" onClick={() => navigate(`/profile/${producer.id}`)} aria-label={`Abrir perfil de ${producerName}`}>
                <span className="cut-production-producer-avatar">{producerAvatar ? <img src={producerAvatar} alt="" loading="lazy" decoding="async" /> : initials(producerName)}</span>
                <span className="cut-production-producer-copy"><small>Produzido por</small><strong>{producerName}</strong></span>
                <i className="fa-solid fa-chevron-right" aria-hidden="true" />
              </button>}

              <div className="cut-card-actions mt-3 cut-production-public-primary-actions">
                {production.is_following ? (
                  <Dropdown className="cut-production-follow-dropdown" align="start">
                    <Dropdown.Toggle
                      variant="outline-light"
                      disabled={busy}
                      aria-label={`Você está seguindo ${production.name}. Abrir opções`}
                    >
                      <i className={`fa-solid ${busy ? "fa-spinner fa-spin" : "fa-user-check"} me-2`} />
                      Seguindo
                    </Dropdown.Toggle>
                    <Dropdown.Menu>
                      <Dropdown.Item
                        className="cut-production-unfollow-action"
                        onClick={unfollowProduction}
                        disabled={busy}
                      >
                        <i className="fa-solid fa-user-minus me-2" />
                        Deixar de seguir
                      </Dropdown.Item>
                    </Dropdown.Menu>
                  </Dropdown>
                ) : (
                  <Button className="cut-production-follow-button" onClick={followProduction} disabled={busy}>
                    <i className={`fa-solid ${busy ? "fa-spinner fa-spin" : "fa-user-plus"} me-2`} />
                    {busy ? "Seguindo..." : "Seguir"}
                  </Button>
                )}
                {sellableUpcoming.length > 0 && <Button variant="success" onClick={() => setTicketCartOpen(true)}><i className="fa-solid fa-ticket me-2" />Ingressos</Button>}
                <Button variant="outline-light" onClick={shareNative}><i className="fa-solid fa-share-nodes me-2" />Compartilhar</Button>
                <div className="cut-production-public-more">
                  {isOwner && <Button variant="outline-light" onClick={() => navigate(`/production/edit/${production.id}`)} title="Editar produção"><i className="fa-regular fa-pen-to-square" /></Button>}
                  {instagramHref && <Button as="a" href={instagramHref} target="_blank" rel="noopener noreferrer" variant="outline-light" title="Instagram"><i className="fa-brands fa-instagram" /></Button>}
                  {websiteHref && <Button as="a" href={websiteHref} target="_blank" rel="noopener noreferrer" variant="outline-light" title="Site"><i className="fa-solid fa-globe" /></Button>}
                </div>
              </div>
            </div>
          </div>
        </Container>
      </section>

      <div ref={tabsSentinelRef} className="cut-production-tabs-sentinel" aria-hidden="true" />
      <nav className={`cut-production-profile-tabs ${tabsPinned ? "is-fixed" : ""}` } aria-label="Seções da produção">
        {[
          ["inicio", "Início"],
          ["eventos", "Eventos"],
          ["fotos", "Fotos"],
          ["sobre", "Sobre"],
          ["publicacoes", "Publicações"],
        ].map(([key, label]) => (
          <button key={key} type="button" className={activeTab === key ? "is-active" : ""} onClick={() => goToTab(key)}>{label}</button>
        ))}
      </nav>

      <Container className="cut-page-container py-4 py-lg-5" ref={contentTopRef}>
        {error && <Alert variant="danger" dismissible onClose={() => setError("")}>{error}</Alert>}

        <div className="cut-production-profile-stats" aria-label="Resumo da produção">
          <div><i className="fa-regular fa-eye" /><strong>{analytics.total_views || 0}</strong><span>Visualizações</span></div>
          <div><i className="fa-regular fa-calendar" /><strong>{upcoming.length}</strong><span>Próximos eventos</span></div>
          <div><i className="fa-solid fa-users" /><strong>{production.followers_count || 0}</strong><span>Seguidores</span></div>
          <div><i className="fa-regular fa-heart" /><strong>{production.likes_count || 0}</strong><span>Curtidas</span></div>
        </div>

        <ProductionNextEventHero
          event={nextEvent}
          production={production}
          allTo={`/agenda/${slug}`}
          emptyTitle="Novas datas em breve"
          emptyText="Acompanhe esta produção para receber as próximas experiências assim que forem publicadas."
        />

        <div ref={eventsSectionRef} className="cut-production-tab-anchor" />
        <EventDiscoveryRail
          className="cut-production-section cut-production-agenda-section cut-production-agenda-section--priority"
          events={upcoming}
          productionOverride={production}
          eyebrow="Agenda"
          title="Próximos eventos"
          description="As próximas experiências desta produção, em ordem de data."
          allTo={`/agenda/${slug}`}
          allLabel="Ver todos"
          emptyTitle="Nenhum próximo evento anunciado"
          emptyText="Quando uma nova data for publicada, ela aparecerá aqui."
          maxItems={12}
        />

        <div ref={aboutSectionRef} className="cut-production-tab-anchor" />
        <div className="cut-production-public-about">
          <Card className="cut-panel cut-production-about-card">
            <Card.Body className="p-4 p-lg-5">
              <span className="cut-eyebrow">Sobre</span>
              <h2 className="cut-section-title mt-2">{production.fantasy || production.name}</h2>
              <div className={`cut-production-description ${descriptionExpanded ? "is-expanded" : ""}`}>
                <FormattedText className="cut-body-copy" value={production.description} emptyText="Esta produção ainda não adicionou uma apresentação pública." />
              </div>
              {longDescription && <Button variant="link" className="cut-production-description-toggle" onClick={() => setDescriptionExpanded((value) => !value)}>{descriptionExpanded ? "Mostrar menos" : "Ver mais"}</Button>}
              <div className="cut-production-public-social">
                {phoneHref && <Button as="a" href={phoneHref} variant="outline-light"><i className="fa-solid fa-phone me-2" />Ligar</Button>}
                {whatsappContactHref && <Button as="a" href={whatsappContactHref} target="_blank" rel="noopener noreferrer" variant="outline-light"><i className="fa-brands fa-whatsapp me-2" />WhatsApp</Button>}
                {instagramHref && <Button as="a" href={instagramHref} target="_blank" rel="noopener noreferrer" variant="outline-light"><i className="fa-brands fa-instagram me-2" />Instagram</Button>}
                {websiteHref && <Button as="a" href={websiteHref} target="_blank" rel="noopener noreferrer" variant="outline-light"><i className="fa-solid fa-globe me-2" />Site</Button>}
                <Button variant="outline-light" onClick={copyLink}><i className="fa-regular fa-copy me-2" />{copied ? "Link copiado" : "Copiar link"}</Button>
              </div>
            </Card.Body>
          </Card>

          <Card className="cut-panel cut-production-location-card" ref={mapSectionRef}>
            <Card.Body className="p-4">
              <span className="cut-eyebrow">Localização</span>
              <h2 className="cut-section-title mt-2">Onde acontece</h2>
              {mapQuery ? (
                <>
                  <div className="cut-production-location-copy"><i className="fa-solid fa-location-dot" /><span>{production.formatted_address || [production.address, production.address_number, production.neighborhood, production.city, production.uf].filter(Boolean).join(", ")}</span></div>
                  <div className="cut-production-location-actions">
                    {!showMap && <Button variant="outline-light" onClick={revealMap}><i className="fa-regular fa-map me-2" />Ver no mapa</Button>}
                    <Button as="a" href={mapsHref} target="_blank" rel="noopener noreferrer"><i className="fa-solid fa-route me-2" />Como chegar</Button>
                  </div>
                  {showMap && <iframe title={`Mapa de ${production.name}`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" src={mapEmbedUrl} />}
                </>
              ) : <p className="text-muted mb-0">Esta produção ainda não publicou sua localização.</p>}
            </Card.Body>
          </Card>
        </div>

        <div ref={photosSectionRef} className="cut-production-tab-anchor" />
        {secondaryLoading ? (
          <div className="cut-production-section cut-production-async-indicator">
            <ProcessingIndicatorComponent fullscreen={false} label="Preparando fotos e informações" />
          </div>
        ) : (
          <React.Suspense fallback={<div className="cut-production-section cut-production-async-indicator"><ProcessingIndicatorComponent fullscreen={false} label="Preparando galeria" /></div>}>
            <ProductionGallery
              media={media}
              albums={galleryAlbums}
              productionName={production.name}
              productionType={production.type}
              isOwner={isOwner}
              canReport={Boolean(user)}
              onManage={() => navigate(`/production/edit/${production.id}#production-editor-gallery`)}
              onReport={(mediaId, payload) => cutinappService.reportProductionMedia(slug, mediaId, payload)}
            />
          </React.Suspense>
        )}

        {artists.length > 0 && <section className="cut-production-section"><div className="cut-production-section-head"><div><span className="cut-eyebrow">Conexões</span><h2>Artistas relacionados</h2></div></div><div className="cut-artist-strip">{artists.map((artist) => <button key={artist.id} onClick={() => navigate(`/artist/${artist.slug}`)}><span>{artist.stage_name?.slice(0, 2).toUpperCase()}</span><strong>{artist.stage_name}</strong></button>)}</div></section>}

        {past.length > 0 && <section className="cut-production-section"><Card className="cut-panel"><Card.Body className="p-4"><span className="cut-eyebrow">Histórico</span><h2 className="cut-section-title">Eventos anteriores</h2>{past.slice(0, 8).map((event) => <button key={event.id} className="cut-history-link" onClick={() => navigate(`/event/${event.slug}`)}><strong>{event.title}</strong><span>{fmt(event.start_date)}</span></button>)}</Card.Body></Card></section>}

        <div ref={postsSectionRef} className="cut-production-tab-anchor" />
        {!secondaryLoading && <React.Suspense fallback={<div className="cut-production-section cut-production-async-indicator"><ProcessingIndicatorComponent fullscreen={false} label="Preparando publicações" /></div>}><ProductionCommunitySection production={production} isOwner={isOwner} /></React.Suspense>}
      </Container>

      <a className="cut-whatsapp-fab" href={whatsappShareHref} target="_blank" rel="noopener noreferrer" aria-label="Compartilhar produção no WhatsApp" title="Compartilhar produção no WhatsApp"><i className="fa-brands fa-whatsapp" aria-hidden="true" /><span>Compartilhar</span></a>

      <ProductionTicketCartModal show={ticketCartOpen} onHide={() => setTicketCartOpen(false)} productionSlug={slug} />

      <Modal show={showViewers} onHide={() => setShowViewers(false)} centered backdrop keyboard contentClassName="cut-viewers-modal">
        <Modal.Header><Modal.Title>Quem visualizou</Modal.Title></Modal.Header>
        <Modal.Body>{analytics.viewers?.length ? <div className="cut-viewer-list">{analytics.viewers.map((viewer) => <button type="button" className="cut-viewer-row cut-viewer-row--link" key={viewer.id} onClick={() => { setShowViewers(false); navigate(`/profile/${viewer.id}`); }} aria-label={`Abrir perfil de ${viewer.name}`}><div className="cut-viewer-avatar">{viewer.avatar ? <img src={mediaUrl(viewer.avatar)} alt="" loading="lazy" decoding="async" /> : initials(viewer.name)}</div><div><strong>{viewer.name}</strong><small>{viewer.last_viewed_at ? `Última visita: ${fmt(viewer.last_viewed_at)}` : "Visitou a produção"}</small></div><span>{viewer.views_count} {viewer.views_count === 1 ? "visita" : "visitas"}</span></button>)}</div> : <p className="text-muted mb-0">As visualizações anônimas entram no total. Usuários identificados aparecem aqui quando acessarem a página.</p>}</Modal.Body>
      </Modal>
    </div>
  );
}
