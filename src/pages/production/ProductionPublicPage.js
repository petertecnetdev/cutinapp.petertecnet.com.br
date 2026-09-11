import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Badge, Button, Card, Container, Modal } from "react-bootstrap";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import SeoHead, { SITE_URL } from "../../components/SeoHead";
import ProductionTicketCartModal from "../../components/event/ProductionTicketCartModal";
import ProductionCommunitySection from "../../components/production/ProductionCommunitySection";
import cutinappService from "../../services/CutinappService";
import { storageUrl } from "../../config";
import { safeExternalHref } from "../../utils/safeUrl";
import { activateOnKeyboard } from "../../utils/keyboardActivation";
import { isPeterTecnetRoot } from "../../utils/applicationRoles";
import { trackTelemetry } from "../../utils/telemetry";
import "./production-experience.css";
import "./production-public-evolved.css";
import "../../components/WhatsAppFloatingButton.css";

const mediaUrl = (value) => {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `${storageUrl}${String(value).replace(/^\/?storage\//, "").replace(/^\//, "")}`;
};

const fmt = (value, withTime = true) => {
  if (!value) return "Data a definir";
  const options = withTime
    ? { dateStyle: "medium", timeStyle: "short", timeZone: "America/Sao_Paulo" }
    : { dateStyle: "medium", timeZone: "America/Sao_Paulo" };
  return new Intl.DateTimeFormat("pt-BR", options).format(new Date(value));
};

const initials = (name) => String(name || "U").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
const eventDate = (event) => new Date(event?.start_date || event?.end_date || 0);
const isToday = (event, now = new Date()) => eventDate(event).toDateString() === now.toDateString();
const isTomorrow = (event, now = new Date()) => {
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return eventDate(event).toDateString() === tomorrow.toDateString();
};
const eventTimingLabel = (event, now = new Date()) => {
  const start = eventDate(event);
  if (!event?.start_date || Number.isNaN(start.getTime())) return "Em breve";
  if (event?.is_happening_now) return "Acontecendo agora";
  if (isToday(event, now)) return "Hoje";
  if (isTomorrow(event, now)) return "Amanhã";
  const diff = Math.ceil((start.getTime() - now.getTime()) / 86400000);
  if (diff > 1 && diff <= 7) return `Em ${diff} dias`;
  return fmt(event.start_date, false);
};
const countdown = (event, clock) => {
  if (!event?.start_date) return "";
  const remaining = new Date(event.start_date).getTime() - clock.getTime();
  if (remaining <= 0) return event?.is_happening_now ? "Já começou" : "";
  const days = Math.floor(remaining / 86400000);
  const hours = Math.floor((remaining % 86400000) / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}min`;
  return `${Math.max(minutes, 1)} min`;
};
const eventImage = (event) => mediaUrl(event?.image || event?.flyer || event?.banner);
const ticketPriceLabel = (event) => {
  if (Number(event?.sellable_free_ticket_lots_count || 0) > 0) return "Gratuito";
  const price = Number(event?.ticket_starting_price);
  if (!Number.isFinite(price) || price < 0 || Number(event?.sellable_ticket_lots_count || 0) <= 0) return "";
  return `A partir de ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(price)}`;
};
const productionImage = (production) => mediaUrl(production?.background || production?.logo);
const starRow = (value = 0) => {
  const rounded = Math.round(Number(value || 0));
  return Array.from({ length: 5 }, (_, index) => index < rounded);
};
const haversineKm = (lat1, lon1, lat2, lon2) => {
  const toRad = (value) => Number(value) * Math.PI / 180;
  const dLat = toRad(Number(lat2) - Number(lat1));
  const dLon = toRad(Number(lon2) - Number(lon1));
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

export default function ProductionPublicPage() {
  const { slug } = useParams();
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  const heroRef = useRef(null);
  const [data, setData] = useState(null);
  const [experience, setExperience] = useState({
    analytics: { total_views: 0, unique_viewers: 0, viewers: [] },
    media: [],
    social_proof: {},
    reviews: [],
    related_productions: [],
  });
  const [loading, setLoading] = useState(true);
  const [experienceLoading, setExperienceLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [ticketCartOpen, setTicketCartOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(null);
  const [sellableUpcoming, setSellableUpcoming] = useState([]);
  const [aboutExpanded, setAboutExpanded] = useState(false);
  const [compactHeader, setCompactHeader] = useState(false);
  const [clock, setClock] = useState(() => new Date());
  const [distanceKm, setDistanceKm] = useState(null);
  const [distanceBusy, setDistanceBusy] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  const [interestedEventIds, setInterestedEventIds] = useState([]);

  const loadCore = useCallback(async () => {
    const response = await cutinappService.publicProduction(slug);
    setData(response);
    return response;
  }, [slug]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
    let active = true;
    setLoading(true);
    setExperienceLoading(true);
    setError("");
    (async () => {
      try {
        const core = await cutinappService.publicProduction(slug);
        if (!active) return;
        setData(core);
        setInterestedEventIds((core?.upcoming || []).filter((event) => Boolean(event?.is_interested)).map((event) => Number(event.id)));
        const productionId = Number(core?.production?.id || 0);

        const backgroundRequests = [];
        if (productionId > 0) {
          backgroundRequests.push(
            cutinappService.publicEvents({ production_id: productionId, available: 1, view: "compact", per_page: 24, sort: "soonest" })
              .then((sellable) => { if (active) setSellableUpcoming(sellable?.events?.data || []); })
              .catch(() => { if (active) setSellableUpcoming([]); })
          );
        }

        backgroundRequests.push(
          cutinappService.productionExperience(slug)
            .then((details) => { if (active) setExperience((current) => ({ ...current, ...details })); })
            .catch(() => {})
            .finally(() => { if (active) setExperienceLoading(false); })
        );

        Promise.allSettled(backgroundRequests);
      } catch (err) {
        if (active) setError(err?.message || "Produção não encontrada.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [slug]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const node = heroRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(([entry]) => setCompactHeader(!entry.isIntersecting), { threshold: 0.08 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [data]);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return undefined;
    const nodes = Array.from(document.querySelectorAll(".cut-production-reveal"));
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [data, experienceLoading]);

  const production = data?.production;
  const upcoming = useMemo(() => data?.upcoming || [], [data]);
  const weeklyAgenda = useMemo(() => data?.weekly_agenda || [], [data]);
  const past = useMemo(() => data?.past || [], [data]);
  const artists = useMemo(() => data?.artists || [], [data]);
  const analytics = experience?.analytics || { total_views: 0, unique_viewers: 0, viewers: [] };
  const media = experience?.media || [];
  const socialProof = experience?.social_proof || {};
  const reviews = experience?.reviews || [];
  const relatedProductions = experience?.related_productions || [];
  const nextEvent = upcoming[0] || null;
  const canManage = Boolean(production && user && (Number(production.user_id) === Number(user.id) || isPeterTecnetRoot(user)));
  const instagramHref = safeExternalHref(production?.instagram_url);
  const websiteHref = safeExternalHref(production?.website_url);
  const pageBackground = productionImage(production);
  const nextEventHero = eventImage(nextEvent) || pageBackground;
  const ratingAverage = Number(socialProof.rating_average || production?.rating_average || 0);
  const ratingsCount = Number(socialProof.ratings_count || production?.ratings_count || 0);
  const attendeesCount = Number(socialProof.attendees_count || 0);
  const verifiedRatingsCount = Number(socialProof.verified_ratings_count || 0);

  const mapQuery = useMemo(() => {
    if (!production?.location_public) return "";
    if (production.latitude && production.longitude) return `${production.latitude},${production.longitude}`;
    return production.formatted_address || [production.address, production.address_number, production.neighborhood, production.city, production.uf].filter(Boolean).join(", ");
  }, [production]);
  const mapEmbedUrl = mapQuery ? `https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed` : "";
  const directionsHref = mapQuery ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mapQuery)}` : "";

  const productionUrl = `${typeof window !== "undefined" ? window.location.origin : SITE_URL}/production/${encodeURIComponent(slug)}/public`;
  const description = production?.description || "Esta produção ainda não adicionou uma apresentação pública.";
  const seoDescription = String(production?.description || `Conheça ${production?.name || "esta produção"}, seus próximos eventos, atrações e experiências na Cutinapp.`).replace(/\s+/g, " ").trim().slice(0, 180);
  const jsonLd = useMemo(() => production ? [
    {
      "@context": "https://schema.org",
      "@type": production.type === "fixed" ? "Organization" : "Organization",
      name: production.name,
      description: seoDescription,
      url: productionUrl,
      logo: mediaUrl(production.logo) || undefined,
      image: pageBackground || undefined,
      sameAs: [instagramHref, websiteHref].filter(Boolean),
      address: production.location_public ? {
        "@type": "PostalAddress",
        streetAddress: [production.address, production.address_number].filter(Boolean).join(", ") || undefined,
        addressLocality: production.city || undefined,
        addressRegion: production.uf || undefined,
        postalCode: production.cep || undefined,
        addressCountry: "BR",
      } : undefined,
    },
    ...upcoming.slice(0, 8).map((event) => ({
      "@context": "https://schema.org",
      "@type": "Event",
      name: event.title,
      startDate: event.start_date,
      endDate: event.end_date,
      url: `${SITE_URL}/event/${event.slug}`,
      image: eventImage(event) || undefined,
      eventStatus: "https://schema.org/EventScheduled",
      organizer: { "@type": "Organization", name: production.name, url: productionUrl },
      location: event.venue || event.city ? { "@type": "Place", name: event.venue || event.city } : undefined,
    })),
  ] : [], [production, upcoming, seoDescription, productionUrl, pageBackground, instagramHref, websiteHref]);

  const track = useCallback((type, metadata = {}) => {
    try {
      trackTelemetry(type, {
        label: production?.name || "Produção",
        target: String(production?.id || ""),
        metadata: { production_slug: slug, path: location.pathname, ...metadata },
      });
    } catch (_) {
      // Telemetria nunca pode interromper a experiência pública.
    }
  }, [production, slug, location.pathname]);

  useEffect(() => {
    if (!production) return;
    track("production_public_experience_viewed", {
      upcoming_events: upcoming.length,
      past_events: past.length,
      followers: Number(production.followers_count || 0),
    });
  }, [production, upcoming.length, past.length, track]);

  const pulseHaptic = () => {
    try {
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(10);
    } catch (_) {
      // Haptic feedback is optional and never blocks interaction.
    }
  };

  const markInterested = async (event) => {
    if (!event?.id) return;
    if (!user) return navigate("/login", { state: { from: `/production/${slug}/public` } });
    if (interestedEventIds.includes(Number(event.id))) return;

    try {
      await cutinappService.engagement(event.id, { is_interested: true });
      setInterestedEventIds((current) => [...new Set([...current, Number(event.id)])]);
      pulseHaptic();
      setShareMessage(`Interesse registrado em ${event.title}.`);
      track("production_event_interest_marked", { event_id: event.id, event_slug: event.slug });
    } catch (err) {
      setError(err?.message || "Não foi possível registrar seu interesse agora.");
    }
  };

  const toggleFollow = async () => {
    if (!user) return navigate("/login", { state: { from: `/production/${slug}/public` } });
    setBusy(true);
    try {
      if (data.production.is_following) {
        await cutinappService.unfollow("production", data.production.id);
        track("production_unfollowed");
      } else {
        await cutinappService.follow("production", data.production.id);
        track("production_followed");
      }
      await loadCore();
      pulseHaptic();
    } catch (err) {
      setError(err?.message || "Não foi possível atualizar o acompanhamento.");
    } finally {
      setBusy(false);
    }
  };

  const enableUpdates = async () => {
    if (!user) return navigate("/login", { state: { from: `/production/${slug}/public` } });
    try {
      if (!data?.production?.is_following) await cutinappService.follow("production", data.production.id);
      if ("Notification" in window && Notification.permission === "default") {
        await Notification.requestPermission();
      }
      await loadCore();
      setShareMessage("Novidades ativadas para esta produção.");
      track("production_updates_enabled", { notification_permission: "Notification" in window ? Notification.permission : "unsupported" });
    } catch (err) {
      setError(err?.message || "Não foi possível ativar as novidades agora.");
    }
  };

  const shareProduction = async () => {
    const payload = {
      title: production?.name || "Produção na Cutinapp",
      text: `Confira ${production?.name || "esta produção"} e seus eventos na Cutinapp.`,
      url: productionUrl,
    };
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share(payload);
        track("production_shared", { channel: "native" });
        return;
      }
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(productionUrl);
      } else {
        throw new Error("Clipboard indisponível");
      }
      setShareMessage("Link copiado.");
      track("production_shared", { channel: "copy" });
    } catch (err) {
      if (err?.name !== "AbortError") setShareMessage("Não foi possível compartilhar agora.");
    }
  };

  const openEvent = (event, source = "list") => {
    track("production_event_opened", { event_id: event.id, event_slug: event.slug, source });
    navigate(`/event/${event.slug}`);
  };

  const openTickets = (source = "page") => {
    track("production_ticket_cta_clicked", { source, sellable_events: sellableUpcoming.length });
    pulseHaptic();
    setTicketCartOpen(true);
  };

  const calculateDistance = () => {
    if (!production?.latitude || !production?.longitude || typeof navigator === "undefined" || !navigator.geolocation) return;
    setDistanceBusy(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setDistanceKm(haversineKm(position.coords.latitude, position.coords.longitude, production.latitude, production.longitude));
        setDistanceBusy(false);
        track("production_distance_calculated");
      },
      () => {
        setDistanceBusy(false);
        setShareMessage("Não foi possível acessar sua localização.");
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  };

  const galleryPrevious = () => setGalleryIndex((current) => current === null ? null : (current - 1 + media.length) % media.length);
  const galleryNext = () => setGalleryIndex((current) => current === null ? null : (current + 1) % media.length);

  if (loading) return <div className="cut-app-page cut-production-public-loading"><NavlogComponent /><ProcessingIndicatorComponent label="Preparando experiência da produção" /></div>;
  if (!data || !production) return <div className="cut-app-page"><NavlogComponent /><Container className="py-5"><Alert variant="danger">{error || "Produção não encontrada."}</Alert><Button variant="outline-light" onClick={() => navigate("/productions")}>Explorar produções</Button></Container></div>;

  const hasLongDescription = description.length > 320;
  const whatsappShareMessage = `Olha esta produção na Cutinapp: ${production.name}\n${productionUrl}`;
  const whatsappShareHref = `https://wa.me/?text=${encodeURIComponent(whatsappShareMessage)}`;
  const pageStyle = pageBackground ? { "--cut-production-page-bg": `url(${JSON.stringify(pageBackground)})` } : undefined;
  const stickyTicketAvailable = sellableUpcoming.length > 0;
  const primaryActionLabel = stickyTicketAvailable ? "Comprar ingresso" : nextEvent ? "Ver próximo evento" : "Ver agenda";

  return <div className="cut-app-page cut-production-themed-page cut-production-public-v2" style={pageStyle}>
    <SeoHead
      title={`${production.name} | Eventos e experiências na Cutinapp`}
      description={seoDescription}
      canonical={productionUrl}
      image={pageBackground || mediaUrl(production.logo)}
      type="profile"
      robots="index, follow, max-image-preview:large"
      jsonLd={jsonLd}
      scriptId="production-public"
    />
    <NavlogComponent />

    <div className={`cut-production-compact-bar ${compactHeader ? "is-visible" : ""}`} aria-hidden={!compactHeader}>
      <Container className="cut-page-container cut-production-compact-bar__inner">
        <div className="cut-production-compact-identity">
          <span className="cut-production-compact-avatar">{production.logo ? <img src={mediaUrl(production.logo)} alt="" /> : initials(production.name)}</span>
          <div><strong>{production.name}</strong><small>{nextEvent ? eventTimingLabel(nextEvent, clock) : "Produção Cutinapp"}</small></div>
        </div>
        <div className="cut-production-compact-actions">
          <Button variant="outline-light" size="sm" onClick={shareProduction} aria-label="Compartilhar produção"><i className="fa-solid fa-arrow-up-from-bracket" /></Button>
          {stickyTicketAvailable
            ? <Button size="sm" onClick={() => openTickets("compact_header")}><i className="fa-solid fa-ticket me-2" />Ingressos</Button>
            : <Button size="sm" onClick={() => nextEvent ? openEvent(nextEvent, "compact_header") : navigate(`/agenda/${slug}`)}>{nextEvent ? "Próximo evento" : "Agenda"}</Button>}
        </div>
      </Container>
    </div>

    <section ref={heroRef} className="cut-production-hero-v2">
      <div className="cut-production-hero-v2__cover" style={nextEventHero ? { backgroundImage: `url(${JSON.stringify(nextEventHero)})` } : undefined} aria-hidden="true" />
      <div className="cut-production-hero-v2__veil" aria-hidden="true" />
      <Container className="cut-page-container cut-production-hero-v2__content">
        <div className="cut-production-hero-v2__identity">
          <div className="cut-production-hero-v2__logo">{production.logo ? <img src={mediaUrl(production.logo)} alt={production.name} /> : <span>{initials(production.name)}</span>}</div>
          <div className="cut-production-hero-v2__copy">
            <div className="cut-production-hero-v2__eyebrow-row">
              <span className="cut-eyebrow">{production.type === "fixed" ? "Espaço de eventos" : "Produção de eventos"}</span>
              {(production.is_featured || production.is_verified) && <Badge bg="info"><i className="fa-solid fa-circle-check me-1" />Em destaque</Badge>}
            </div>
            <h1>{production.name}</h1>
            <p className="cut-production-hero-v2__location">{production.city ? <><i className="fa-solid fa-location-dot" /> {production.city}{production.uf ? ` - ${production.uf}` : ""}</> : "Experiências, eventos e comunidade na Cutinapp"}</p>

            <div className="cut-production-proof-strip" aria-label="Resumo da produção">
              <span><strong>{Number(production.followers_count || socialProof.followers_count || 0).toLocaleString("pt-BR")}</strong><small>seguidores</small></span>
              <button type="button" onClick={() => setShowViewers(true)}><strong>{Number(analytics.total_views || 0).toLocaleString("pt-BR")}</strong><small>visualizações</small></button>
              <span><strong>{upcoming.length}</strong><small>próximos</small></span>
              {attendeesCount > 0 && <span><strong>{attendeesCount.toLocaleString("pt-BR")}</strong><small>participantes</small></span>}
              {ratingsCount > 0 && <span><strong>{ratingAverage.toFixed(1)} <i className="fa-solid fa-star" /></strong><small>{ratingsCount} avaliações</small></span>}
            </div>

            <div className="cut-production-hero-v2__actions">
              <Button onClick={toggleFollow} disabled={busy} className={production.is_following ? "is-following" : ""}>
                <i className={`${production.is_following ? "fa-solid" : "fa-regular"} fa-heart me-2`} />
                {production.is_following ? "Seguindo" : "Seguir produção"}
              </Button>
              {stickyTicketAvailable && <Button variant="success" onClick={() => openTickets("hero")}><i className="fa-solid fa-ticket me-2" />Comprar ingresso</Button>}
              <Button variant="outline-light" onClick={shareProduction}><i className="fa-solid fa-arrow-up-from-bracket me-2" />Compartilhar</Button>
              <Button variant="outline-light" onClick={enableUpdates}><i className="fa-regular fa-bell me-2" />Receber novidades</Button>
              {instagramHref && <Button as="a" href={instagramHref} target="_blank" rel="noopener noreferrer" variant="outline-light" className="cut-production-icon-link cut-production-icon-link--instagram" aria-label="Instagram" onClick={() => track("production_social_clicked", { network: "instagram" })}><i className="fa-brands fa-instagram" /></Button>}
              {websiteHref && <Button as="a" href={websiteHref} target="_blank" rel="noopener noreferrer" variant="outline-light" className="cut-production-icon-link" aria-label="Site" onClick={() => track("production_social_clicked", { network: "website" })}><i className="fa-solid fa-globe" /></Button>}
            </div>
          </div>
        </div>

        {nextEvent && <article className="cut-production-next-event">
          <div className="cut-production-next-event__media">{nextEventHero ? <img src={nextEventHero} alt={nextEvent.title} fetchPriority="high" /> : <div className="cut-production-next-event__fallback"><i className="fa-regular fa-calendar-days" /></div>}</div>
          <div className="cut-production-next-event__body">
            <div className="cut-production-next-event__top">
              <Badge bg={nextEvent?.is_happening_now ? "danger" : "primary"}>{eventTimingLabel(nextEvent, clock)}</Badge>
              {countdown(nextEvent, clock) && <span className="cut-production-countdown"><i className="fa-regular fa-clock" /> {countdown(nextEvent, clock)}</span>}
            </div>
            <small>Próximo evento</small>
            <h2>{nextEvent.title}</h2>
            <p><i className="fa-regular fa-calendar" /> {fmt(nextEvent.start_date)}</p>
            <p><i className="fa-solid fa-location-dot" /> {nextEvent.venue || nextEvent.city || "Local a definir"}</p>
            {ticketPriceLabel(nextEvent) && <p className="cut-production-next-event__price"><i className="fa-solid fa-ticket" /> {ticketPriceLabel(nextEvent)}</p>}
            <div className="cut-production-next-event__actions">
              <Button onClick={() => openEvent(nextEvent, "hero_spotlight")}>Ver evento</Button>
              {sellableUpcoming.some((event) => Number(event.id) === Number(nextEvent.id)) && <Button variant="success" onClick={() => openTickets("next_event")}><i className="fa-solid fa-ticket me-2" />Ingressos</Button>}{!nextEvent.has_ended && <Button variant="outline-light" onClick={() => markInterested(nextEvent)} disabled={interestedEventIds.includes(Number(nextEvent.id))}><i className={`${interestedEventIds.includes(Number(nextEvent.id)) ? "fa-solid" : "fa-regular"} fa-star me-2`} />{interestedEventIds.includes(Number(nextEvent.id)) ? "Interesse registrado" : "Tenho interesse"}</Button>}
            </div>
          </div>
        </article>}
      </Container>
    </section>

    <Container className="cut-page-container cut-production-public-v2__body">
      {error && <Alert variant="danger" dismissible onClose={() => setError("")}>{error}</Alert>}
      {shareMessage && <Alert variant="info" dismissible onClose={() => setShareMessage("")}>{shareMessage}</Alert>}

      {canManage && <section className="cut-production-owner-bar cut-production-reveal">
        <div><span className="cut-eyebrow">Área do produtor</span><strong>Gerencie esta produção sem misturar o administrativo com a experiência pública.</strong></div>
        <div>
          <Button variant="outline-light" onClick={() => navigate(`/production/edit/${production.id}`)}><i className="fa-regular fa-pen-to-square me-2" />Editar produção</Button>
          <Button variant="outline-light" onClick={() => navigate(`/production/${production.id}`)}><i className="fa-solid fa-chart-line me-2" />Gerenciar</Button>
          <Button onClick={() => navigate("/event/create", { state: { productionId: production.id } })}><i className="fa-solid fa-plus me-2" />Criar evento</Button>
        </div>
      </section>}

      <nav className="cut-production-quick-nav cut-production-reveal" aria-label="Navegação da produção">
        <a href="#agenda"><i className="fa-regular fa-calendar-days" />Agenda</a>
        {media.length > 0 && <a href="#galeria"><i className="fa-regular fa-images" />Fotos</a>}
        {artists.length > 0 && <a href="#artistas"><i className="fa-solid fa-microphone-lines" />Artistas</a>}
        {past.length > 0 && <a href="#reviva"><i className="fa-solid fa-clock-rotate-left" />Reviva</a>}
        <a href="#comunidade"><i className="fa-regular fa-comments" />Comunidade</a>
        {mapEmbedUrl && <a href="#localizacao"><i className="fa-solid fa-location-dot" />Como chegar</a>}
      </nav>

      {weeklyAgenda.length > 0 && <section className="cut-production-weekly cut-production-reveal">
        <div className="cut-production-section-head"><div><span className="cut-eyebrow">Ritmo da casa</span><h2>Agenda semanal</h2><p>Os eventos fixos que fazem parte da identidade desta produção.</p></div><Button variant="outline-light" onClick={() => navigate(`/agenda/${slug}`)}>Agenda completa</Button></div>
        <div className="cut-production-weekly__track">{weeklyAgenda.map((slot, index) => <button type="button" key={`${slot.day_of_week}-${slot.event?.id}-${index}`} onClick={() => slot.event && openEvent(slot.event, "weekly_agenda")}>
          <span>{["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][Number(slot.day_of_week) % 7]}</span>
          <strong>{slot.event?.title || "Evento"}</strong>
          <small>{slot.event?.start_date ? fmt(slot.event.start_date, false) : "Recorrente"}</small>
        </button>)}</div>
      </section>}

      <section className="cut-production-about-grid cut-production-reveal">
        <Card className="cut-panel cut-production-about-card"><Card.Body>
          <span className="cut-eyebrow">Sobre a produção</span>
          <h2>{production.name}</h2>
          <p className={aboutExpanded || !hasLongDescription ? "" : "is-clamped"}>{description}</p>
          {hasLongDescription && <button type="button" className="cut-production-text-toggle" onClick={() => setAboutExpanded((value) => !value)}>{aboutExpanded ? "Mostrar menos" : "Ver mais"} <i className={`fa-solid fa-chevron-${aboutExpanded ? "up" : "down"}`} /></button>}
          <div className="cut-production-about-meta">
            {production.type && <span><i className="fa-solid fa-sparkles" />{production.type === "fixed" ? "Local fixo" : "Produção independente"}</span>}
            {production.city && <span><i className="fa-solid fa-location-dot" />{production.city}{production.uf ? `/${production.uf}` : ""}</span>}
            {ratingsCount > 0 && <span><i className="fa-solid fa-star" />{ratingAverage.toFixed(1)} de 5</span>}
          </div>
        </Card.Body></Card>

        <Card className="cut-panel cut-production-social-proof-card"><Card.Body>
          <span className="cut-eyebrow">Comunidade real</span>
          <h2>Quem já viveu essa experiência</h2>
          {experienceLoading ? <div className="cut-production-proof-skeleton"><span /><span /><span /></div> : <>
            <div className="cut-production-attendee-stack">
              {(socialProof.attendees_preview || []).slice(0, 8).map((attendee) => <button type="button" key={attendee.id} onClick={() => navigate(`/profile/${attendee.id}`)} title={attendee.name}>{attendee.avatar ? <img src={mediaUrl(attendee.avatar)} alt={attendee.name} loading="lazy" /> : initials(attendee.name)}</button>)}
              {attendeesCount > 0 && <strong>{attendeesCount.toLocaleString("pt-BR")} participantes</strong>}
            </div>
            <p>{attendeesCount > 0 ? "Pessoas que receberam ou compraram ingressos para eventos desta produção." : "Quando participantes adquirirem ingressos, a prova social aparecerá aqui."}</p>
            {ratingsCount > 0 && <div className="cut-production-rating-summary"><strong>{ratingAverage.toFixed(1)}</strong><div><span>{starRow(ratingAverage).map((filled, index) => <i key={index} className={`${filled ? "fa-solid" : "fa-regular"} fa-star`} />)}</span><small>{ratingsCount} avaliações · {verifiedRatingsCount} verificadas</small></div></div>}
          </>}
        </Card.Body></Card>
      </section>

      <section id="agenda" className="cut-production-section cut-production-reveal">
        <div className="cut-production-section-head">
          <div><span className="cut-eyebrow">Agenda</span><h2>Próximos eventos</h2><p>Descubra o que vem por aí e entre no clima antes mesmo do evento começar.</p></div>
          <Button variant="outline-light" onClick={() => navigate(`/agenda/${slug}`)}><i className="fa-regular fa-calendar-days me-2" />Ver agenda completa</Button>
        </div>
        {upcoming.length === 0 ? <Card className="cut-empty-state cut-production-empty-evolved"><Card.Body><i className="fa-regular fa-calendar-plus" /><h3>A próxima experiência ainda está sendo preparada</h3><p>Siga a produção para receber novidades assim que novos eventos forem publicados.</p><Button onClick={enableUpdates}><i className="fa-regular fa-bell me-2" />Quero ser avisado</Button></Card.Body></Card> : <div className="cut-production-events-carousel cut-production-events-carousel--evolved">{upcoming.map((event, index) => <article className={`cut-production-event-slide cut-production-event-slide--evolved ${index === 0 ? "is-next" : ""}`} key={event.id} role="link" tabIndex={0} aria-label={`Abrir evento ${event.title}`} onClick={() => openEvent(event, "events_carousel")} onKeyDown={(e) => activateOnKeyboard(e, () => openEvent(event, "events_carousel_keyboard"))}>
          <div className="cut-production-event-slide__media">{eventImage(event) ? <img src={eventImage(event)} alt={event.title} loading={index < 2 ? "eager" : "lazy"} decoding="async" /> : <div className="cut-production-event-slide__fallback">{initials(event.title)}</div>}<span className="cut-production-event-timing">{eventTimingLabel(event, clock)}</span></div>
          <div className="cut-production-event-slide__body"><span className="cut-eyebrow">{event.category || "Evento"}</span><h3>{event.title}</h3><p><i className="fa-regular fa-calendar me-2" />{fmt(event.start_date)}</p><p><i className="fa-solid fa-location-dot me-2" />{event.venue || event.city || "Local a definir"}</p><div className="cut-production-event-slide__footer"><span>Ver detalhes <i className="fa-solid fa-arrow-right" /></span>{ticketPriceLabel(event) && <Badge bg={Number(event.sellable_free_ticket_lots_count || 0) > 0 ? "success" : "info"}>{ticketPriceLabel(event)}</Badge>}</div></div>
        </article>)}</div>}
      </section>

      {media.length > 0 && <section id="galeria" className="cut-production-section cut-production-reveal">
        <div className="cut-production-section-head"><div><span className="cut-eyebrow">{production.type === "fixed" ? "O espaço" : "Bastidores"}</span><h2>{production.type === "fixed" ? "Conheça o local" : "Veja como é por dentro"}</h2><p>Fotos reais para transformar curiosidade em vontade de participar.</p></div><span className="cut-production-section-count">{media.length} fotos</span></div>
        <div className="cut-production-gallery-grid cut-production-gallery-grid--evolved">{media.map((item, index) => <button type="button" className={`cut-production-gallery-item ${index === 0 ? "is-featured" : ""}`} key={item.id} onClick={() => { setGalleryIndex(index); track("production_gallery_opened", { media_id: item.id, position: index }); }}><img src={mediaUrl(item.url)} alt={item.caption || `Foto de ${production.name}`} loading="lazy" decoding="async" />{item.caption && <span>{item.caption}</span>}<i className="fa-solid fa-up-right-and-down-left-from-center" /></button>)}</div>
      </section>}

      {artists.length > 0 && <section id="artistas" className="cut-production-section cut-production-reveal">
        <div className="cut-production-section-head"><div><span className="cut-eyebrow">Conexões</span><h2>Artistas e atrações</h2><p>Descubra quem ajuda a construir a identidade dos eventos desta produção.</p></div></div>
        <div className="cut-production-artist-rail">{artists.map((artist) => <button key={artist.id} type="button" onClick={() => { track("production_artist_opened", { artist_id: artist.id }); navigate(`/artist/${artist.slug}`); }}><span>{artist.photo ? <img src={mediaUrl(artist.photo)} alt={artist.stage_name} loading="lazy" /> : initials(artist.stage_name)}</span><strong>{artist.stage_name}</strong><small>{Array.isArray(artist.genres) ? artist.genres.slice(0, 2).join(" · ") : "Ver perfil"}</small></button>)}</div>
      </section>}

      {reviews.length > 0 && <section className="cut-production-section cut-production-reveal">
        <div className="cut-production-section-head"><div><span className="cut-eyebrow">Avaliações</span><h2>O que participantes avaliaram</h2><p>Avaliações ligadas aos eventos desta produção.</p></div></div>
        <div className="cut-production-review-grid">{reviews.slice(0, 8).map((review, index) => <article key={`${review.event_id}-${review.user_id}-${index}`}>
          <header><span>{review.avatar ? <img src={mediaUrl(review.avatar)} alt="" loading="lazy" /> : initials(review.name)}</span><div><strong>{review.name || "Participante"}</strong><small>{review.verified_attendee ? <><i className="fa-solid fa-circle-check" /> Presença verificada</> : "Avaliação"}</small></div></header>
          <div className="cut-production-review-stars">{starRow(review.rating).map((filled, starIndex) => <i key={starIndex} className={`${filled ? "fa-solid" : "fa-regular"} fa-star`} />)}</div>
          <button type="button" onClick={() => review.event_slug && navigate(`/event/${review.event_slug}`)}>{review.event_title || "Evento"} <i className="fa-solid fa-arrow-right" /></button>
        </article>)}</div>
      </section>}

      {past.length > 0 && <section id="reviva" className="cut-production-section cut-production-reveal">
        <div className="cut-production-section-head"><div><span className="cut-eyebrow">Reviva</span><h2>Veja como foi</h2><p>Eventos antigos continuam vivos: fotos, lembranças, avaliações e conversas ajudam a contar a história da produção.</p></div></div>
        <div className="cut-production-past-grid">{past.slice(0, 8).map((event) => <article key={event.id} onClick={() => openEvent(event, "reviva")} onKeyDown={(e) => activateOnKeyboard(e, () => openEvent(event, "reviva_keyboard"))} tabIndex={0} role="link">
          <div>{eventImage(event) ? <img src={eventImage(event)} alt={event.title} loading="lazy" /> : <span>{initials(event.title)}</span>}</div>
          <section><small>{fmt(event.start_date, false)}</small><h3>{event.title}</h3><span>Reviver evento <i className="fa-solid fa-arrow-right" /></span></section>
        </article>)}</div>
      </section>}

      <ProductionCommunitySection production={production} isOwner={canManage} />

      <section className="cut-production-bottom-grid cut-production-reveal">
        <Card id="localizacao" className="cut-panel cut-production-location-card cut-production-location-card--evolved"><Card.Body>
          <div className="cut-production-section-head cut-production-section-head--compact"><div><span className="cut-eyebrow">Localização</span><h2>Como chegar</h2></div></div>
          {mapEmbedUrl ? <>
            <div className="cut-production-location-copy"><i className="fa-solid fa-location-dot" /><span>{production.formatted_address || [production.address, production.address_number, production.neighborhood, production.city, production.uf].filter(Boolean).join(", ")}</span></div>
            <iframe title={`Mapa de ${production.name}`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" src={mapEmbedUrl} />
            <div className="cut-production-location-actions">
              <Button as="a" href={directionsHref} target="_blank" rel="noopener noreferrer" onClick={() => track("production_directions_clicked")}><i className="fa-solid fa-diamond-turn-right me-2" />Traçar rota</Button>
              {production.latitude && production.longitude && typeof navigator !== "undefined" && navigator.geolocation && <Button variant="outline-light" disabled={distanceBusy} onClick={calculateDistance}><i className="fa-solid fa-location-crosshairs me-2" />{distanceBusy ? "Calculando..." : distanceKm !== null ? `${distanceKm.toFixed(distanceKm < 10 ? 1 : 0)} km de você` : "Calcular distância"}</Button>}
            </div>
          </> : <div className="cut-production-location-private"><i className="fa-solid fa-location-dot" /><strong>Localização ainda não publicada</strong><span>A produção pode divulgar o endereço quando fizer sentido para os próximos eventos.</span></div>}
        </Card.Body></Card>

        <Card className="cut-panel cut-production-share-card"><Card.Body>
          <span className="cut-eyebrow">Chame sua turma</span>
          <h2>Compartilhe a produção</h2>
          <p>Leve seus amigos direto para a agenda e para os próximos eventos.</p>
          <div>
            <Button onClick={shareProduction}><i className="fa-solid fa-arrow-up-from-bracket me-2" />Compartilhar</Button>
            <Button as="a" href={whatsappShareHref} target="_blank" rel="noopener noreferrer" variant="success" onClick={() => track("production_shared", { channel: "whatsapp" })}><i className="fa-brands fa-whatsapp me-2" />WhatsApp</Button>
          </div>
        </Card.Body></Card>
      </section>

      {relatedProductions.length > 0 && <section className="cut-production-section cut-production-reveal">
        <div className="cut-production-section-head"><div><span className="cut-eyebrow">Continue explorando</span><h2>Você também pode gostar</h2><p>Outras produções com experiências na mesma região.</p></div></div>
        <div className="cut-production-related-grid">{relatedProductions.slice(0, 6).map((item) => <button type="button" key={item.id} onClick={() => { track("production_related_opened", { related_id: item.id, related_slug: item.slug }); navigate(`/production/${item.slug}/public`); }}>
          <div className="cut-production-related-grid__media">{item.background || item.logo ? <img src={mediaUrl(item.background || item.logo)} alt={item.name} loading="lazy" /> : <span>{initials(item.name)}</span>}</div>
          <div><strong>{item.name}</strong><span>{item.city ? `${item.city}${item.uf ? `/${item.uf}` : ""}` : "Cutinapp"}</span><small>{Number(item.upcoming_events_count || 0)} próximos eventos · {Number(item.followers_count || 0)} seguidores</small></div>
        </button>)}</div>
      </section>}
    </Container>

    <div className="cut-production-mobile-cta">
      <button type="button" onClick={() => stickyTicketAvailable ? openTickets("mobile_sticky") : nextEvent ? openEvent(nextEvent, "mobile_sticky") : navigate(`/agenda/${slug}`)}>
        <i className={`fa-solid ${stickyTicketAvailable ? "fa-ticket" : nextEvent ? "fa-bolt" : "fa-calendar-days"}`} />
        <span><small>{stickyTicketAvailable ? "Ingressos disponíveis" : nextEvent ? eventTimingLabel(nextEvent, clock) : "Agenda pública"}</small><strong>{primaryActionLabel}</strong></span>
        <i className="fa-solid fa-chevron-right" />
      </button>
    </div>

    <ProductionTicketCartModal show={ticketCartOpen} onHide={() => setTicketCartOpen(false)} productionSlug={slug} />

    <Modal show={galleryIndex !== null} onHide={() => setGalleryIndex(null)} centered fullscreen className="cut-production-gallery-modal">
      <Modal.Header closeButton><Modal.Title>{production.name} · Galeria</Modal.Title></Modal.Header>
      <Modal.Body>{galleryIndex !== null && media[galleryIndex] && <div className="cut-production-gallery-modal__stage">
        <button type="button" aria-label="Foto anterior" onClick={galleryPrevious}><i className="fa-solid fa-chevron-left" /></button>
        <figure><img src={mediaUrl(media[galleryIndex].url)} alt={media[galleryIndex].caption || `Foto de ${production.name}`} />{media[galleryIndex].caption && <figcaption>{media[galleryIndex].caption}</figcaption>}<small>{galleryIndex + 1} de {media.length}</small></figure>
        <button type="button" aria-label="Próxima foto" onClick={galleryNext}><i className="fa-solid fa-chevron-right" /></button>
      </div>}</Modal.Body>
    </Modal>

    <Modal show={showViewers} onHide={() => setShowViewers(false)} centered>
      <Modal.Header closeButton><Modal.Title>Quem visualizou</Modal.Title></Modal.Header>
      <Modal.Body>{analytics.viewers?.length ? <div className="cut-viewer-list">{analytics.viewers.map((viewer) => <div className="cut-viewer-row" key={viewer.id}><button type="button" className="cut-viewer-avatar" onClick={() => navigate(`/profile/${viewer.id}`)}>{viewer.avatar ? <img src={mediaUrl(viewer.avatar)} alt="" /> : initials(viewer.name)}</button><div><strong>{viewer.name}</strong><small>{viewer.last_viewed_at ? `Última visita: ${fmt(viewer.last_viewed_at)}` : "Visitou a produção"}</small></div><span>{viewer.views_count} {viewer.views_count === 1 ? "visita" : "visitas"}</span></div>)}</div> : <p className="text-muted mb-0">As visualizações anônimas entram no total. Usuários identificados aparecem aqui quando acessarem a página.</p>}</Modal.Body>
    </Modal>
  </div>;
}
