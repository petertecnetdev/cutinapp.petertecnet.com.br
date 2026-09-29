import React, { useMemo, useState, useEffect } from "react";
import { Alert, Badge, Button, Container } from "react-bootstrap";
import { useNavigate, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import EventPosterThumbnail from "../../components/event/EventPosterThumbnail";
import SeoHead, { SITE_URL } from "../../components/SeoHead";
import cutinappService from "../../services/CutinappService";
import { storageUrl } from "../../config";
import "./production-agenda-public.css";

const SAO_PAULO_TZ = "America/Sao_Paulo";

const WEEK_DAYS = [
  { value: 1, label: "Segunda-feira", short: "SEG" },
  { value: 2, label: "Terça-feira", short: "TER" },
  { value: 3, label: "Quarta-feira", short: "QUA" },
  { value: 4, label: "Quinta-feira", short: "QUI" },
  { value: 5, label: "Sexta-feira", short: "SEX" },
  { value: 6, label: "Sábado", short: "SÁB" },
  { value: 0, label: "Domingo", short: "DOM" },
];

const mediaUrl = (value) => {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `${storageUrl}${String(value).replace(/^\/?storage\//, "").replace(/^\//, "")}`;
};

const formatDate = (value) => {
  if (!value) return "Data a definir";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data a definir";
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit", timeZone: SAO_PAULO_TZ,
  }).format(date);
};

const formatTime = (value) => {
  if (!value) return "Horário a definir";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Horário a definir";
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: SAO_PAULO_TZ }).format(date);
};

const dateKey = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: SAO_PAULO_TZ }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
};

const initials = (name) => String(name || "P").trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
const sortEvents = (events, direction = "asc") => [...events].sort((left, right) => {
  const a = new Date(left?.start_date || 0).getTime();
  const b = new Date(right?.start_date || 0).getTime();
  return direction === "desc" ? b - a : a - b;
});

const ticketAvailability = (event) => {
  switch (event?.ticket_availability_status) {
    case "free_available": return { bg: "success", label: "Gratuito disponível", sellable: true };
    case "available": return { bg: "primary", label: "Ingressos disponíveis", sellable: true };
    case "temporarily_reserved": return { bg: "warning", text: "dark", label: "Reservado no momento", sellable: false };
    case "sold_out": return { bg: "secondary", label: "Esgotado", sellable: false };
    case "sales_ended": return { bg: "secondary", label: "Vendas encerradas", sellable: false };
    case "tickets_pending":
    default: return { bg: "warning", text: "dark", label: "Ingressos em breve", sellable: false };
  }
};

export default function ProductionAgendaPublicPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("upcoming");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    cutinappService.publicProduction(slug)
      .then((response) => { if (active) setData(response); })
      .catch((err) => { if (active) setError(err?.response?.data?.message || err?.message || "Não foi possível carregar esta agenda."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [slug]);

  const production = data?.production || null;
  const weeklyAgenda = useMemo(() => Array.isArray(data?.weekly_agenda) ? data.weekly_agenda : (Array.isArray(data?.weeklyAgenda) ? data.weeklyAgenda : []), [data]);
  const weeklyByDay = useMemo(() => {
    const map = {};
    weeklyAgenda.forEach((slot) => { if (slot?.event && map[Number(slot.day_of_week)] === undefined) map[Number(slot.day_of_week)] = slot.event; });
    return map;
  }, [weeklyAgenda]);
  const upcoming = useMemo(() => sortEvents(Array.isArray(data?.upcoming) ? data.upcoming : []), [data]);
  const past = useMemo(() => sortEvents(Array.isArray(data?.past) ? data.past : [], "desc"), [data]);
  const todayKey = dateKey(new Date());
  const filteredEvents = useMemo(() => {
    if (filter === "past") return past;
    if (filter === "today") return upcoming.filter((event) => dateKey(event.start_date) === todayKey);
    if (filter === "week") {
      const now = Date.now(); const limit = now + (7 * 24 * 60 * 60 * 1000);
      return upcoming.filter((event) => { const time = new Date(event?.start_date || 0).getTime(); return Number.isFinite(time) && time >= now && time <= limit; });
    }
    return upcoming;
  }, [filter, past, todayKey, upcoming]);

  const nextEvent = upcoming[0] || null;
  const nextEventAvailability = nextEvent ? ticketAvailability(nextEvent) : null;
  const agendaUrl = `${SITE_URL}/agenda/${encodeURIComponent(slug)}`;
  const seo = useMemo(() => {
    if (!production) return null;
    const title = `Agenda de ${production.name} | Cutinapp`;
    const description = nextEvent
      ? `Veja a agenda de ${production.name}. Próximo evento: ${nextEvent.title}, ${formatDate(nextEvent.start_date)}.`
      : `Veja a agenda pública de ${production.name} na Cutinapp.`;
    return {
      title,
      description,
      canonical: agendaUrl,
      image: mediaUrl(nextEvent?.image || production.background || production.logo) || undefined,
      type: "website",
      robots: "index, follow, max-image-preview:large",
      scriptId: "production-agenda",
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "@id": `${agendaUrl}#agenda`,
        name: title,
        description,
        url: agendaUrl,
        mainEntity: { "@type": "Organization", name: production.name, url: `${SITE_URL}/production/${encodeURIComponent(slug)}/public` },
        isPartOf: { "@type": "WebSite", name: "Cutinapp", url: SITE_URL },
      },
    };
  }, [agendaUrl, nextEvent, production, slug]);

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(agendaUrl); } catch {
      const input = document.createElement("textarea"); input.value = agendaUrl; input.setAttribute("readonly", ""); input.style.position = "fixed"; input.style.opacity = "0";
      document.body.appendChild(input); input.select(); document.execCommand("copy"); input.remove();
    }
    setCopied(true); window.setTimeout(() => setCopied(false), 1800);
  };

  const shareAgenda = async () => {
    const payload = { title: production ? `Agenda de ${production.name}` : "Agenda Cutinapp", text: nextEvent ? `Confira a agenda de ${production.name}. Próximo evento: ${nextEvent.title}.` : `Confira a agenda de ${production?.name || "esta produção"}.`, url: agendaUrl };
    if (navigator.share) { try { await navigator.share(payload); return; } catch (err) { if (err?.name === "AbortError") return; } }
    await copyLink();
  };

  if (loading) return <div className="cut-app-page"><NavlogComponent /><ProcessingIndicatorComponent label="Carregando agenda" /></div>;
  if (!production) return <div className="cut-app-page"><NavlogComponent /><Container className="cut-page-container py-5"><Alert variant="danger">{error || "Agenda não encontrada."}</Alert></Container></div>;

  const locationText = production.city ? `${production.city}${production.uf ? ` - ${production.uf}` : ""}` : "Agenda pública";

  return (
    <div className="cut-app-page cut-public-agenda-page">
      {seo && <SeoHead {...seo} />}
      <NavlogComponent />
      <header className="cut-public-agenda-hero">
        {production.background && <div className="cut-public-agenda-hero__background" style={{ backgroundImage: `url(${mediaUrl(production.background)})` }} aria-hidden="true" />}
        <Container className="cut-page-container cut-public-agenda-hero__content">
          <div className="cut-public-agenda-brand">
            <div className="cut-public-agenda-brand__logo">{production.logo ? <img src={mediaUrl(production.logo)} alt={production.name} /> : <span>{initials(production.name)}</span>}</div>
            <div><span className="cut-eyebrow">Agenda pública</span><h1>{production.name}</h1><p>{locationText}</p></div>
          </div>
          <div className="cut-public-agenda-hero__actions">
            <Button variant="outline-light" onClick={() => navigate(`/production/${slug}/public`)}><i className="fa-regular fa-building me-2" />Ver produção</Button>
            <Button variant="outline-light" onClick={copyLink}><i className={`fa-regular ${copied ? "fa-circle-check" : "fa-copy"} me-2`} />{copied ? "Link copiado" : "Copiar link"}</Button>
            <Button onClick={shareAgenda}><i className="fa-solid fa-share-nodes me-2" />Compartilhar agenda</Button>
          </div>
        </Container>
      </header>

      <main className="cut-public-agenda-main"><Container className="cut-page-container">
        {nextEvent && <section className="cut-public-agenda-next"><div><span className="cut-eyebrow">Próximo evento</span><h2>{nextEvent.title}</h2><p>{formatDate(nextEvent.start_date)}</p>{nextEventAvailability && <Badge bg={nextEventAvailability.bg} text={nextEventAvailability.text}>{nextEventAvailability.label}</Badge>}</div><Button onClick={() => navigate(`/event/${nextEvent.slug}`)}>Ver evento</Button></section>}
        <section className="cut-public-agenda-week"><div className="cut-section-heading"><span className="cut-eyebrow">Programação semanal</span><h2>Agenda da semana</h2></div><div className="cut-public-agenda-week__grid">{WEEK_DAYS.map((day) => { const event = weeklyByDay[day.value]; return <article key={day.value} className={`cut-public-agenda-day ${event ? "is-active" : ""}`}><span>{day.short}</span>{event ? <button type="button" onClick={() => navigate(`/event/${event.slug}`)}><EventPosterThumbnail event={event} /><strong>{event.title}</strong><small>{formatTime(event.start_date)}</small></button> : <p>Sem evento</p>}</article>; })}</div></section>
        <section className="cut-public-agenda-events"><div className="cut-section-heading"><span className="cut-eyebrow">Eventos</span><h2>Explore a programação</h2></div><div className="cut-public-agenda-filters" role="group" aria-label="Filtrar eventos"><Button size="sm" variant={filter === "upcoming" ? "primary" : "outline-light"} onClick={() => setFilter("upcoming")}>Próximos</Button><Button size="sm" variant={filter === "today" ? "primary" : "outline-light"} onClick={() => setFilter("today")}>Hoje</Button><Button size="sm" variant={filter === "week" ? "primary" : "outline-light"} onClick={() => setFilter("week")}>7 dias</Button><Button size="sm" variant={filter === "past" ? "primary" : "outline-light"} onClick={() => setFilter("past")}>Anteriores</Button></div><div className="cut-public-agenda-events__grid">{filteredEvents.length ? filteredEvents.map((event) => <article key={event.id || event.slug} className="cut-public-agenda-event"><button type="button" onClick={() => navigate(`/event/${event.slug}`)}><EventPosterThumbnail event={event} /><div><h3>{event.title}</h3><p>{formatDate(event.start_date)}</p><Badge bg={ticketAvailability(event).bg} text={ticketAvailability(event).text}>{ticketAvailability(event).label}</Badge></div></button></article>) : <p className="cut-public-agenda-empty">Nenhum evento neste período.</p>}</div></section>
      </Container></main>
    </div>
  );
}
