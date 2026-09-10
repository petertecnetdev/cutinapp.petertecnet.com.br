import React, { useContext, useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import WhatsAppFloatingButton from "../../components/WhatsAppFloatingButton";
import EventCommunitySection from "../../components/event/EventCommunitySection";
import EventCommercePanel from "../../components/event/EventCommercePanel";
import EventFlyerModal from "../../components/event/EventFlyerModal";
import { AuthContext } from "../../context/AuthContext";
import eventService from "../../services/EventService";
import cutinappService from "../../services/CutinappService";
import commerceService from "../../services/CommerceService";
import { storageUrl } from "../../config";
import { isPeterTecnetRoot } from "../../utils/applicationRoles";
import { buildEventShareUrl } from "../../utils/eventShareUrl";
import { safeExternalHref } from "../../utils/safeUrl";

const EVENT_DESCRIPTION_PREVIEW_LENGTH = 240;

const formatDate = (value) => value
  ? new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value))
  : "Data não informada";

const money = (value) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));

const saoPauloDateKey = (offsetDays = 0) => {
  const target = new Date(Date.now() + (offsetDays * 86400000));
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(target);
  const values = Object.fromEntries(parts.filter(({ type }) => ["year", "month", "day"].includes(type)).map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const resolveImageUrl = (value) => {
  if (!value) return "";
  const image = String(value);
  return /^https?:\/\//i.test(image) ? image : `${storageUrl}${image.replace(/^\/+/, "")}`;
};

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

const copyText = async (value) => {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.select();

  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!copied) throw new Error("copy_failed");
};

const getEventTemporalState = (event, currentTime = Date.now()) => {
  if (!event) return "future";
  const apiState = ["future", "ongoing", "past"].includes(event.temporal_status) ? event.temporal_status : null;
  const startAt = event.start_date ? new Date(event.start_date).getTime() : Number.NaN;
  const endAt = event.end_date ? new Date(event.end_date).getTime() : Number.NaN;

  if (Number.isFinite(endAt) && currentTime >= endAt) return "past";
  if (Number.isFinite(startAt) && currentTime >= startAt && (!Number.isFinite(endAt) || currentTime < endAt)) return "ongoing";
  if (Number.isFinite(startAt) && currentTime < startAt) return "future";
  return apiState || "future";
};

const temporalMeta = {
  future: {
    badge: "Próximo evento",
    badgeVariant: "primary",
    alertVariant: "info",
    icon: "fa-regular fa-calendar-days",
    title: "Este evento ainda vai acontecer",
    description: "Confira a programação, garanta sua entrada e acompanhe as novidades até o dia do evento.",
  },
  ongoing: {
    badge: "Acontecendo agora",
    badgeVariant: "success",
    alertVariant: "success",
    icon: "fa-solid fa-circle-play",
    title: "Este evento está acontecendo agora",
    description: "O evento já começou. As ações disponíveis permanecem ativas somente enquanto ele estiver em andamento.",
  },
  past: {
    badge: "Evento encerrado",
    badgeVariant: "secondary",
    alertVariant: "secondary",
    icon: "fa-solid fa-clock-rotate-left",
    title: "Este evento já aconteceu",
    description: "A página continua disponível como registro. Compras, retiradas de ingressos, itens antecipados e novas marcações de interesse estão encerradas.",
  },
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
  const [engagementLoading, setEngagementLoading] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [interested, setInterested] = useState(false);
  const [flyerOpen, setFlyerOpen] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [clock, setClock] = useState(() => Date.now());
  const [ownerResults, setOwnerResults] = useState(null);
  const [ownerResultsLoading, setOwnerResultsLoading] = useState(false);
  const [ownerResultsError, setOwnerResultsError] = useState("");
  const [duplicateDate, setDuplicateDate] = useState("");
  const [duplicating, setDuplicating] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setData(null);
    setArtists([]);
    setDescriptionExpanded(false);

    eventService.view(slug)
      .then((response) => { if (active) setData(response); })
      .catch((err) => { if (active) setError(err?.message || "Não foi possível carregar este evento."); })
      .finally(() => { if (active) setLoading(false); });

    cutinappService.publicEventArtists(slug)
      .then((lineup) => { if (active) setArtists(lineup); })
      .catch(() => {});
    return () => { active = false; };
  }, [slug]);

  const event = data?.event || null;
  const history = data?.history || null;
  const tickets = useMemo(() => (data?.tickets || []).filter((ticket) => Number(ticket.price) === 0), [data]);
  const claimableArtists = useMemo(() => artists.filter((artist) => !artist.claimed_at), [artists]);
  const isOwner = Boolean(event?.production?.user_id && Number(event.production.user_id) === Number(user?.id));
  const canManageEvent = isOwner || isPeterTecnetRoot(user);
  const productionId = Number(event?.production_id || event?.production?.id || 0);
  const mapEmbedUrl = useMemo(() => buildMapEmbedUrl(event), [event]);
  const googleMapsHref = useMemo(() => safeExternalHref(event?.google_maps_url), [event?.google_maps_url]);
  const flyerUrl = useMemo(() => resolveImageUrl(event?.image), [event?.image]);
  const temporalState = useMemo(() => getEventTemporalState(event, clock), [event, clock]);
  const temporal = temporalMeta[temporalState];
  const isPastEvent = temporalState === "past";
  const hasTickets = Number(event?.tickets_count || 0) > 0 || tickets.length > 0;
  const ticketAvailabilityStatus = event?.ticket_availability_status || null;
  const hasSellableTickets = ticketAvailabilityStatus
    ? ["free_available", "available"].includes(ticketAvailabilityStatus)
    : hasTickets;
  const ticketAvailabilityLabel = ({
    free_available: "Ingresso gratuito disponível",
    available: "Ingressos disponíveis",
    temporarily_reserved: "Ingressos reservados no momento",
    sold_out: "Ingressos esgotados",
    sales_ended: "Vendas encerradas",
    tickets_pending: "Ingressos em breve",
  })[ticketAvailabilityStatus] || (hasTickets ? "Ingressos disponíveis" : "Ingressos em breve");
  const canMarkInterested = event?.allowed_actions?.mark_interested ?? !isPastEvent;
  const showPersistentBuyCta = !isPastEvent && hasSellableTickets;
  const eventDescription = String(event?.description || "").trim();
  const hasLongDescription = eventDescription.length > EVENT_DESCRIPTION_PREVIEW_LENGTH;
  const visibleDescription = descriptionExpanded || !hasLongDescription
    ? eventDescription
    : `${eventDescription.slice(0, EVENT_DESCRIPTION_PREVIEW_LENGTH).trimEnd()}…`;

  useEffect(() => {
    if (!event || isPastEvent) return undefined;
    const timer = window.setInterval(() => setClock(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, [event, isPastEvent]);

  useEffect(() => {
    if (!event?.id || isOwner) return;
    try {
      window.PeterTecnetTelemetry?.track?.("producer_acquisition_event_page_cta_viewed", {
        label: "CTA de produtor exibido em página pública de evento",
        target: String(event.id),
        metadata: {
          source_event_id: Number(event.id),
          acquisition_surface: "public_event",
          authenticated: Boolean(user),
          next_step: "event_creation",
        },
      });
    } catch (_) {
      // Telemetria nunca bloqueia a página pública.
    }
  }, [event?.id, isOwner, user]);

  useEffect(() => {
    if (!event?.id || !user?.id) {
      setFavorite(false);
      setInterested(false);
      setEngagementLoading(false);
      return undefined;
    }

    let active = true;
    const eventId = Number(event.id);
    setEngagementLoading(true);

    cutinappService.profileOverview()
      .then((profile) => {
        if (!active) return;
        const interestedEvents = Array.isArray(profile?.interested_events) ? profile.interested_events : [];
        const favoriteEvents = Array.isArray(profile?.favorite_events) ? profile.favorite_events : [];
        setInterested(interestedEvents.some((item) => Number(item.id) === eventId));
        setFavorite(favoriteEvents.some((item) => Number(item.id) === eventId));
      })
      .catch(() => {
        if (!active) return;
        setInterested(false);
        setFavorite(false);
      })
      .finally(() => active && setEngagementLoading(false));

    return () => { active = false; };
  }, [event?.id, user?.id]);

  useEffect(() => {
    if (!isPastEvent || !isOwner || !event?.id || !productionId) {
      setOwnerResults(null);
      setOwnerResultsLoading(false);
      setOwnerResultsError("");
      return undefined;
    }

    let active = true;
    setOwnerResultsLoading(true);
    setOwnerResultsError("");

    Promise.allSettled([
      commerceService.producerSales(productionId, { event_id: event.id, per_page: 1 }),
      cutinappService.eventParticipants(event.id),
    ]).then(([salesResult, attendanceResult]) => {
      if (!active) return;
      const sales = salesResult.status === "fulfilled" ? salesResult.value?.summary || null : null;
      const attendance = attendanceResult.status === "fulfilled" ? attendanceResult.value?.stats || null : null;
      setOwnerResults({ sales, attendance });
      if (!sales && !attendance) setOwnerResultsError("Não foi possível carregar o fechamento deste evento agora.");
      else if (!sales || !attendance) setOwnerResultsError("Parte das métricas está temporariamente indisponível.");
    }).finally(() => active && setOwnerResultsLoading(false));

    return () => { active = false; };
  }, [isPastEvent, isOwner, event?.id, productionId]);

  const claim = async (ticket) => {
    if (isPastEvent || event?.allowed_actions?.claim_courtesy === false) {
      setError("Este evento já terminou. Não é mais possível emitir ou retirar ingressos.");
      return;
    }
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
    const url = buildEventShareUrl({ event, origin: window.location.origin, fallbackSlug: slug });
    const title = event?.title || "Evento Cutinapp";
    const text = event?.city ? `${title} em ${event.city}` : title;

    setError("");
    setSuccess("");

    try {
      if (navigator.share) {
        await navigator.share({ title, text, url });
        return;
      }

      await copyText(url);
      setSuccess("Link do evento copiado. Agora é só enviar para quem você quiser.");
    } catch (err) {
      if (err?.name !== "AbortError") setError("Não foi possível compartilhar neste navegador.");
    }
  };

  const startProducerActivation = () => {
    try {
      window.PeterTecnetTelemetry?.track?.("producer_acquisition_event_page_cta_clicked", {
        label: "Visitante iniciou criação de evento a partir de uma página pública",
        target: String(event?.id || slug || "public_event"),
        metadata: {
          source_event_id: Number(event?.id || 0),
          acquisition_surface: "public_event",
          authenticated: Boolean(user),
          next_step: "event_creation",
        },
      });
    } catch (_) {
      // Telemetria nunca bloqueia aquisição de produtores.
    }

    if (user) {
      navigate("/event/create", { state: { acquisitionSource: "public_event" } });
      return;
    }

    navigate("/register", {
      state: {
        from: "/event/create",
        acquisitionSource: "public_event",
      },
    });
  };

  const setEngagement = async (kind) => {
    if (kind === "interested" && !canMarkInterested) {
      setError("Este evento já terminou e não aceita novas marcações de interesse.");
      return;
    }
    if (!user) return navigate("/login", { state: { from: `${location.pathname}${location.search}` } });
    setSocialBusy(true); setError("");
    try {
      const nextFavorite = kind === "favorite" ? !favorite : favorite;
      const nextInterested = kind === "interested" ? !interested : interested;
      const payload = kind === "favorite" ? { is_favorite: nextFavorite } : { is_interested: nextInterested };
      await cutinappService.engagement(event.id, payload);
      setFavorite(nextFavorite); setInterested(nextInterested);
    } catch (err) { setError(err?.message || "Não foi possível salvar sua preferência."); }
    finally { setSocialBusy(false); }
  };

  const duplicateEvent = async () => {
    if (!duplicateDate) {
      setError("Escolha a data da próxima edição antes de duplicar o evento.");
      return;
    }
    setDuplicating(true);
    setError("");
    setSuccess("");
    try {
      const response = await eventService.duplicate(event.id, duplicateDate);
      const duplicatedId = Number(response?.event?.id || 0);
      if (!duplicatedId) throw new Error("A API não retornou a nova edição criada.");
      navigate(`/event/edit/${duplicatedId}`, {
        state: { success: response?.message || "Nova edição criada como rascunho." },
      });
    } catch (err) {
      setError(err?.message || "Não foi possível duplicar este evento.");
    } finally {
      setDuplicating(false);
    }
  };

  const attendanceIssued = Number(ownerResults?.attendance?.issued || 0);
  const attendanceCheckedIn = Number(ownerResults?.attendance?.checked_in || 0);
  const attendanceRate = attendanceIssued > 0 ? Math.round((attendanceCheckedIn / attendanceIssued) * 100) : 0;

  return <div className={`cut-app-page cut-event-view-page ${showPersistentBuyCta ? "cut-event-view-page--buyable" : ""}`}><NavlogComponent />{(loading || claimingId || artistClaimingId || duplicating) && <ProcessingIndicatorComponent label={claimingId ? "Emitindo ingresso" : artistClaimingId ? "Enviando reivindicação" : duplicating ? "Criando próxima edição" : "Carregando evento"} />}
    {!loading && event && <>
      <section className="cut-event-banner-stage" aria-label={`Imagem do evento ${event.title}`}>
        <Container className="cut-page-container">
          {flyerUrl ? <div className="cut-event-banner-frame"><img src={flyerUrl} alt={`Banner do evento ${event.title}`} /></div> : <div className="cut-event-banner-placeholder"><i className="fa-regular fa-image" aria-hidden="true" /></div>}
        </Container>
      </section>

      <section className="cut-event-summary-strip">
        <Container className="cut-page-container">
          <div className="cut-event-summary-card">
            <div className="cut-event-summary-card__content">
              <div className="d-flex flex-wrap gap-2 mb-3">{event.category && <Badge bg="dark">{event.category}</Badge>}<Badge bg={temporal.badgeVariant}>{temporal.badge}</Badge>{!isPastEvent && <Badge bg={hasSellableTickets ? "info" : "secondary"} text={hasSellableTickets ? "dark" : undefined}>{ticketAvailabilityLabel}</Badge>}</div>
              <h1>{event.title}</h1>
              <div className="cut-event-summary-card__meta">
                <span><i className="fa-regular fa-calendar" aria-hidden="true" />{formatDate(event.start_date)}</span>
                <span><i className="fa-solid fa-location-dot" aria-hidden="true" />{event.venue || event.address}{event.city ? ` · ${event.city}${event.uf ? ` - ${event.uf}` : ""}` : ""}</span>
              </div>
              {event.production?.name && <button className="cut-inline-profile-link mt-3" onClick={() => navigate(`/production/${event.production.slug}/public`)}>Por {event.production.name} <i className="fa-solid fa-arrow-up-right-from-square" /></button>}
            </div>
            <div className="cut-card-actions cut-event-summary-card__actions">
              {showPersistentBuyCta && <Button as="a" href="#ingressos" size="lg" variant="success" className="fw-bold" aria-label={`Montar carrinho para ${event.title}`}><i className="fa-solid fa-cart-shopping me-2" />Ingressos e itens</Button>}
              {canManageEvent && <Button variant="light" onClick={() => navigate(`/event/edit/${event.id}`)} aria-label={`Editar ${event.title}`} title="Editar evento"><i className="fa-solid fa-pen-to-square me-2" />Editar evento</Button>}
              <Button variant="outline-light" onClick={share} aria-label={`Compartilhar ${event.title}`}><i className="fa-solid fa-share-nodes me-2" />Compartilhar</Button>
              {flyerUrl && <Button variant="outline-light" onClick={() => setFlyerOpen(true)}><i className="fa-regular fa-image me-2" />Ver imagem</Button>}
              {canMarkInterested && <Button variant={interested ? "info" : "outline-light"} onClick={() => setEngagement("interested")} disabled={socialBusy || engagementLoading}><i className="fa-regular fa-star me-2" />Tenho interesse</Button>}
              <Button variant={favorite ? "danger" : "outline-light"} onClick={() => setEngagement("favorite")} disabled={socialBusy || engagementLoading}><i className={`${favorite ? "fa-solid" : "fa-regular"} fa-heart me-2`} />{favorite ? "Salvo" : "Salvar"}</Button>
              <Button variant="outline-light" href="#comunidade"><i className="fa-regular fa-comments me-2" />Conversa</Button>
              {googleMapsHref && <Button variant="outline-light" as="a" href={googleMapsHref} target="_blank" rel="noopener noreferrer"><i className="fa-solid fa-location-arrow me-2" />Maps</Button>}
            </div>
          </div>
        </Container>
      </section>

      <Container className="cut-page-container py-4 py-lg-5">
        <Alert variant={temporal.alertVariant} className="d-flex align-items-start gap-3 mb-4" role="status"><i className={`${temporal.icon} fs-4 mt-1`} aria-hidden="true" /><div><strong className="d-block mb-1">{temporal.title}</strong><span>{temporal.description}{temporalState === "ongoing" && event.end_date ? ` Término previsto para ${formatDate(event.end_date)}.` : ""}</span></div></Alert>
        {error && <Alert variant="danger">{error}</Alert>}{success && <Alert variant="success">{success}</Alert>}

        {isPastEvent && <Card className="cut-panel mb-4"><Card.Body className="p-4 p-lg-5"><span className="cut-eyebrow">Memória do evento</span><h2 className="cut-section-title mt-2">O que ficou desta edição</h2><p className="text-secondary">Realizado de {formatDate(event.start_date)} até {formatDate(event.end_date)}. A página permanece como registro da experiência, do line-up e da comunidade.</p><div className="cut-event-details mt-4"><div><i className="fa-solid fa-users" /><span><strong>Participantes</strong>{Number(history?.participants || 0)}</span></div><div><i className="fa-solid fa-qrcode" /><span><strong>Check-ins</strong>{Number(history?.checkins || 0)}</span></div><div><i className="fa-solid fa-music" /><span><strong>Artistas</strong>{Number(history?.artists ?? artists.length)}</span></div><div><i className="fa-regular fa-comments" /><span><strong>Publicações</strong>{Number(history?.community_posts || 0)}</span></div><div><i className="fa-solid fa-star" /><span><strong>Avaliações</strong>{Number(history?.rating_total || 0) > 0 ? `${Number(history?.rating_average || 0).toFixed(1)} / 5 · ${history.rating_total}` : "Ainda sem avaliações"}</span></div></div></Card.Body></Card>}

        {isPastEvent && isOwner && <Card className="cut-panel mb-5"><Card.Body className="p-4 p-lg-5"><div className="d-flex flex-column flex-lg-row justify-content-between gap-4"><div className="flex-grow-1"><span className="cut-eyebrow">Resultados do produtor</span><h2 className="cut-section-title mt-2">Fechamento desta edição</h2><p className="text-secondary">Use os números deste evento para avaliar presença, vendas e preparar a próxima edição.</p>{ownerResultsLoading ? <p className="text-secondary mb-0">Carregando fechamento...</p> : <><div className="cut-event-details mt-4"><div><i className="fa-solid fa-ticket" /><span><strong>Ingressos pagos</strong>{Number(ownerResults?.sales?.paid_tickets || 0)}</span></div><div><i className="fa-solid fa-bag-shopping" /><span><strong>Pedidos pagos</strong>{Number(ownerResults?.sales?.paid_count || 0)}</span></div><div><i className="fa-solid fa-box" /><span><strong>Itens vendidos</strong>{Number(ownerResults?.sales?.paid_items || 0)}</span></div><div><i className="fa-solid fa-money-bill-trend-up" /><span><strong>Receita bruta</strong>{money(ownerResults?.sales?.gross_paid)}</span></div><div><i className="fa-solid fa-wallet" /><span><strong>Líquido da produção</strong>{money(ownerResults?.sales?.organization_net)}</span></div><div><i className="fa-solid fa-user-check" /><span><strong>Entradas</strong>{attendanceCheckedIn} de {attendanceIssued} · {attendanceRate}%</span></div></div>{ownerResultsError && <Alert variant="warning" className="mt-3 mb-0">{ownerResultsError}</Alert>}</>}</div><div style={{ minWidth: "min(100%, 300px)" }}><Card className="cut-panel h-100"><Card.Body className="p-4"><span className="cut-eyebrow">Próxima edição</span><h3 className="h5 mt-2">Duplicar este evento</h3><p className="text-secondary small">Reaproveita informações, ingressos, itens e line-up. Vendas, passes, check-ins e histórico começam zerados.</p><Form.Group className="mb-3"><Form.Label>Nova data</Form.Label><Form.Control type="date" min={saoPauloDateKey(1)} value={duplicateDate} onChange={(e) => setDuplicateDate(e.target.value)} /></Form.Group><Button className="w-100" onClick={duplicateEvent} disabled={duplicating || !duplicateDate}><i className="fa-regular fa-copy me-2" />Duplicar evento</Button></Card.Body></Card></div></div></Card.Body></Card>}

        {location.state?.artistClaim && <Alert variant="info">Sua conta foi criada. Agora selecione abaixo o artista que representa você e envie a reivindicação ao produtor deste evento.</Alert>}
        {artists.length > 0 && <section className="mb-5"><div className="cut-section-heading"><div><span className="cut-eyebrow">Line-up</span><h2>Quem faz este evento acontecer</h2></div></div><div className="cut-lineup-grid">{artists.map((artist) => <button key={artist.id} className={`cut-lineup-card ${artist.pivot?.is_headliner ? "cut-lineup-card--headliner" : ""}`} onClick={() => navigate(`/artist/${artist.slug}`)}><div className="cut-lineup-card__avatar">{artist.photo ? <img src={/^https?:/.test(artist.photo) ? artist.photo : `${storageUrl}${String(artist.photo).replace(/^\//, "")}`} alt={artist.stage_name} /> : <span>{artist.stage_name?.slice(0,2).toUpperCase()}</span>}</div><div><span>{artist.pivot?.is_headliner ? "Atração principal" : artist.pivot?.participation_type || "Artista"}</span><strong>{artist.stage_name}</strong>{artist.pivot?.scheduled_at && <small>{formatDate(artist.pivot.scheduled_at)}</small>}{artist.pivot?.stage && <small>{artist.pivot.stage}</small>}</div><i className="fa-solid fa-chevron-right" /></button>)}</div>
          {claimableArtists.length > 0 && <Card className="cut-panel mt-4"><Card.Body className="p-4"><span className="cut-eyebrow">Artista do evento?</span><h3 className="cut-section-title">Reivindique seu vínculo</h3><p className="text-secondary">Se o produtor cadastrou você antes da criação da sua conta, escolha seu perfil abaixo. O produtor receberá a solicitação e confirmará que você realmente faz parte deste line-up.</p><div className="d-flex flex-wrap gap-2">{claimableArtists.map((artist) => <Button key={artist.id} variant="outline-light" onClick={() => claimArtist(artist)} disabled={artistClaimingId === artist.id}><i className="fa-solid fa-user-check me-2" />Sou {artist.stage_name}</Button>)}</div>{!user && <small className="d-block text-secondary mt-3">Você será direcionado ao cadastro e voltará para este evento após confirmar o e-mail.</small>}</Card.Body></Card>}
        </section>}

        {showPersistentBuyCta && <section id="ingressos" className="cut-ticket-shop-section mb-5" style={{ scrollMarginTop: "calc(var(--cut-navbar-height) + 18px)" }}>
          <div className="cut-ticket-shop-section__heading">
            <span className="cut-eyebrow">Carrinho do evento</span>
            <h2 className="cut-section-title mt-2 mb-1">Ingressos e itens</h2>
            <p className="text-secondary mb-0">Escolha quantos ingressos quiser, combine lotes diferentes e adicione os itens disponibilizados para este evento. A compra é fechada uma única vez.</p>
          </div>

          <EventCommercePanel slug={slug} eventId={event.id} user={user} onLoginRequired={(returnTo = `${location.pathname}${location.search}`) => navigate("/login", { state: { from: returnTo } })} />

          {tickets.length > 0 && <div className="cut-ticket-shop__courtesies mt-4">
            <div className="cut-ticket-shop__heading mb-3">
              <div>
                <span className="cut-eyebrow">Entradas gratuitas</span>
                <h3 className="mt-2">Cortesias e listas</h3>
                <p>Ingressos gratuitos continuam individuais: cada participante resgata o próprio QR Code na sua conta.</p>
              </div>
            </div>
            <div className="cut-ticket-shop__list">{tickets.map((ticket) => {
              const remaining = Number(ticket.remaining ?? 0);
              const available = Boolean(ticket.available);
              return <div className={`cut-ticket-shop__option ${!available ? "cut-ticket-shop__option--sold-out" : ""}`} key={`courtesy-${ticket.id}`}>
                <div className="cut-ticket-shop__option-copy">
                  <span className="cut-ticket-kicker">{ticket.type || ticket.ticket_type || "Ingresso promocional"}</span>
                  <strong>{ticket.name}</strong>
                  <span>Grátis</span>
                  <small>{ticket.expired ? "Prazo encerrado" : available ? `${remaining} restante${remaining === 1 ? "" : "s"}` : "Esgotado"}</small>
                  {ticket.limit_date && !ticket.expired && <small>Resgate até {formatDate(ticket.limit_date)}</small>}
                </div>
                <Button variant="outline-light" onClick={() => claim(ticket)} disabled={!available || claimingId === ticket.id}>
                  {available ? (user ? "Resgatar 1 cortesia" : "Entrar para resgatar") : ticket.expired ? "Prazo encerrado" : "Esgotado"}
                </Button>
              </div>;
            })}</div>
          </div>}
        </section>}

        <Row className="g-4"><Col lg={isOwner ? 8 : 12}>
          <Card className="cut-panel mb-4"><Card.Body className="p-4 p-lg-5"><span className="cut-eyebrow">Sobre o evento</span><h2 className="cut-section-title mt-2">Informações</h2>{eventDescription && <div className="mb-4"><p className="cut-body-copy mb-2">{visibleDescription}</p>{hasLongDescription && <Button variant="link" className="p-0 text-decoration-none" onClick={() => setDescriptionExpanded((current) => !current)} aria-expanded={descriptionExpanded}><i className={`fa-solid ${descriptionExpanded ? "fa-chevron-up" : "fa-chevron-down"} me-2`} aria-hidden="true" />{descriptionExpanded ? "Recolher descrição" : "Ver descrição completa"}</Button>}</div>}<div className="cut-event-details"><div><i className="fa-regular fa-calendar" /><span><strong>Início</strong>{formatDate(event.start_date)}</span></div><div><i className="fa-regular fa-clock" /><span><strong>Término</strong>{formatDate(event.end_date)}</span></div><div><i className="fa-solid fa-location-dot" /><span><strong>Local</strong>{event.venue || event.address}</span></div>{event.city && <div><i className="fa-solid fa-map" /><span><strong>Cidade</strong>{event.city}{event.uf ? ` - ${event.uf}` : ""}</span></div>}</div></Card.Body></Card>
          {event.production?.name && <Card className="cut-panel mb-4"><Card.Body className="p-4"><span className="cut-eyebrow">Responsável</span><div className="cut-production-inline"><div><h2>{event.production.name}</h2><p>Veja os próximos eventos e acompanhe esta produção.</p></div><div className="d-flex flex-wrap gap-2">{showPersistentBuyCta && <Button as="a" href="#ingressos" variant="success"><i className="fa-solid fa-cart-shopping me-2" />Comprar ingressos e itens</Button>}<Button variant="outline-light" onClick={() => navigate(`/production/${event.production.slug}/public`)}>Ver página da produção</Button></div></div></Card.Body></Card>}
          {mapEmbedUrl && <Card className="cut-panel"><Card.Body className="p-0 overflow-hidden"><iframe title={`Mapa de ${event.title}`} src={mapEmbedUrl} width="100%" height="360" style={{ border: 0, display: "block" }} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen /></Card.Body></Card>}
        </Col>
        {isOwner && <Col lg={4}><Card className="cut-panel"><Card.Body className="p-4"><span className="cut-eyebrow">Gestão</span><h2 className="cut-section-title mt-2">Ferramentas do evento</h2><div className="cut-owner-actions mt-4"><Button variant="outline-light" onClick={() => navigate(`/event/edit/${event.id}`)}><i className="fa-solid fa-pen-to-square me-2" />Editar evento</Button><Button variant="outline-light" onClick={() => navigate(`/event/${event.id}/lineup`)}>Line-up</Button><Button variant="outline-light" onClick={() => navigate(`/event/${event.id}/artist-claims`)}>Reivindicações</Button>{!isPastEvent && <Button variant="outline-light" onClick={() => navigate(`/checkin?eventId=${event.id}`)}>Portaria</Button>}{!isPastEvent && <Button variant="outline-light" onClick={() => navigate(`/ticket/create?eventId=${event.id}`)}>Criar cortesia</Button>}</div></Card.Body></Card></Col>}</Row>

        {!isOwner && <Card className="cut-panel mt-4 mb-4"><Card.Body className="p-4 p-lg-5"><div className="d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-4"><div><span className="cut-eyebrow">Você também produz eventos?</span><h2 className="cut-section-title mt-2 mb-2">Crie seu primeiro evento na Cutinapp</h2><p className="text-secondary mb-0">Comece pelo evento. Se ainda não tiver uma produção, você cria o nome dela no mesmo fluxo e segue direto para o primeiro lote e a publicação.</p></div><Button size="lg" onClick={startProducerActivation} className="flex-shrink-0"><i className="fa-solid fa-bolt me-2" />{user ? "Criar meu evento" : "Começar como produtor"}</Button></div></Card.Body></Card>}

        <EventCommunitySection event={event} isOwner={isOwner} />
      </Container>

      {showPersistentBuyCta && <a className="cut-event-buy-cta-fixed" href="#ingressos" aria-label={`Comprar ingresso para ${event.title}`}>
        <i className="fa-solid fa-ticket" aria-hidden="true" />
        <span><strong>Comprar ingresso</strong><small>Ver opções disponíveis</small></span>
        <i className="fa-solid fa-chevron-down" aria-hidden="true" />
      </a>}

      <WhatsAppFloatingButton
        phone={event.production?.phone || event.phone}
        label="Falar sobre o evento"
        message={`Olá! Vi o evento ${event.title} na Cutinapp e gostaria de mais informações.`}
      />

      <EventFlyerModal show={flyerOpen} onHide={() => setFlyerOpen(false)} event={event} flyerUrl={flyerUrl} />
    </>}
    {!loading && !event && <Container className="cut-page-container py-5"><Alert variant="danger">{error || "Evento não encontrado ou não está publicado."}</Alert><Button variant="outline-light" onClick={() => navigate("/event")}>Voltar aos eventos</Button></Container>}
  </div>;
}
