import React, { useEffect, useMemo, useState } from "react";
import { Alert, Button, Container } from "react-bootstrap";
import { useNavigate, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import cutinappService from "../../services/CutinappService";
import { storageUrl } from "../../config";
import "./production-agenda-public.css";

const SAO_PAULO_TZ = "America/Sao_Paulo";

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
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: SAO_PAULO_TZ,
  }).format(date);
};

const dateKey = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: SAO_PAULO_TZ,
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
};

const initials = (name) => String(name || "P")
  .trim()
  .split(/\s+/)
  .slice(0, 2)
  .map((part) => part[0])
  .join("")
  .toUpperCase();

const sortEvents = (events, direction = "asc") => [...events].sort((left, right) => {
  const a = new Date(left?.start_date || 0).getTime();
  const b = new Date(right?.start_date || 0).getTime();
  return direction === "desc" ? b - a : a - b;
});

const setMeta = (selector, attributes) => {
  let element = document.head.querySelector(selector);
  if (!element) {
    element = document.createElement("meta");
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
    element.dataset.cutinappAgendaMeta = "true";
    document.head.appendChild(element);
    return;
  }
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
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
    setLoading(true);
    setError("");

    cutinappService.publicProduction(slug)
      .then((response) => {
        if (active) setData(response);
      })
      .catch((err) => {
        if (active) setError(err?.response?.data?.message || err?.message || "Não foi possível carregar esta agenda.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [slug]);

  const production = data?.production || null;
  const upcoming = useMemo(() => sortEvents(Array.isArray(data?.upcoming) ? data.upcoming : []), [data]);
  const past = useMemo(() => sortEvents(Array.isArray(data?.past) ? data.past : [], "desc"), [data]);
  const todayKey = dateKey(new Date());

  const filteredEvents = useMemo(() => {
    if (filter === "past") return past;
    if (filter === "today") return upcoming.filter((event) => dateKey(event.start_date) === todayKey);
    if (filter === "week") {
      const now = Date.now();
      const limit = now + (7 * 24 * 60 * 60 * 1000);
      return upcoming.filter((event) => {
        const time = new Date(event?.start_date || 0).getTime();
        return Number.isFinite(time) && time >= now && time <= limit;
      });
    }
    return upcoming;
  }, [filter, past, todayKey, upcoming]);

  const nextEvent = upcoming[0] || null;
  const agendaUrl = typeof window !== "undefined" ? `${window.location.origin}/agenda/${encodeURIComponent(slug)}` : "";

  useEffect(() => {
    if (!production || typeof document === "undefined") return undefined;

    const previousTitle = document.title;
    const title = `Agenda de ${production.name} | Cutinapp`;
    const description = nextEvent
      ? `Veja a agenda de ${production.name}. Próximo evento: ${nextEvent.title}, ${formatDate(nextEvent.start_date)}.`
      : `Veja a agenda pública de ${production.name} na Cutinapp.`;
    const image = mediaUrl(nextEvent?.image || production.background || production.logo);

    document.title = title;
    setMeta('meta[name="description"]', { name: "description", content: description });
    setMeta('meta[property="og:title"]', { property: "og:title", content: title });
    setMeta('meta[property="og:description"]', { property: "og:description", content: description });
    setMeta('meta[property="og:type"]', { property: "og:type", content: "website" });
    setMeta('meta[property="og:url"]', { property: "og:url", content: agendaUrl });
    if (image) setMeta('meta[property="og:image"]', { property: "og:image", content: image });

    return () => {
      document.title = previousTitle;
      document.head.querySelectorAll('[data-cutinapp-agenda-meta="true"]').forEach((element) => element.remove());
    };
  }, [agendaUrl, nextEvent, production]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(agendaUrl);
    } catch {
      const input = document.createElement("textarea");
      input.value = agendaUrl;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const shareAgenda = async () => {
    const payload = {
      title: production ? `Agenda de ${production.name}` : "Agenda Cutinapp",
      text: nextEvent ? `Confira a agenda de ${production.name}. Próximo evento: ${nextEvent.title}.` : `Confira a agenda de ${production?.name || "esta produção"}.`,
      url: agendaUrl,
    };

    if (navigator.share) {
      try {
        await navigator.share(payload);
        return;
      } catch (err) {
        if (err?.name === "AbortError") return;
      }
    }

    await copyLink();
  };

  if (loading) {
    return <div className="cut-app-page"><NavlogComponent /><ProcessingIndicatorComponent label="Carregando agenda" /></div>;
  }

  if (!production) {
    return (
      <div className="cut-app-page">
        <NavlogComponent />
        <Container className="cut-page-container py-5">
          <Alert variant="danger">{error || "Agenda não encontrada."}</Alert>
        </Container>
      </div>
    );
  }

  const locationText = production.city
    ? `${production.city}${production.uf ? ` - ${production.uf}` : ""}`
    : "Agenda pública";

  return (
    <div className="cut-app-page cut-public-agenda-page">
      <NavlogComponent />

      <header className="cut-public-agenda-hero">
        {production.background && (
          <div
            className="cut-public-agenda-hero__background"
            style={{ backgroundImage: `url(${mediaUrl(production.background)})` }}
            aria-hidden="true"
          />
        )}
        <Container className="cut-page-container cut-public-agenda-hero__content">
          <div className="cut-public-agenda-brand">
            <div className="cut-public-agenda-brand__logo">
              {production.logo
                ? <img src={mediaUrl(production.logo)} alt={production.name} />
                : <span>{initials(production.name)}</span>}
            </div>
            <div>
              <span className="cut-eyebrow">Agenda pública</span>
              <h1>{production.name}</h1>
              <p>{locationText}</p>
            </div>
          </div>

          <div className="cut-public-agenda-hero__actions">
            <Button variant="outline-light" onClick={() => navigate(`/production/${slug}/public`)}>
              <i className="fa-regular fa-building me-2" />Ver produção
            </Button>
            <Button variant="outline-light" onClick={copyLink}>
              <i className={`fa-regular ${copied ? "fa-circle-check" : "fa-copy"} me-2`} />
              {copied ? "Link copiado" : "Copiar link"}
            </Button>
            <Button onClick={shareAgenda}>
              <i className="fa-solid fa-share-nodes me-2" />Compartilhar agenda
            </Button>
          </div>
        </Container>
      </header>

      <main>
        <Container className="cut-page-container py-4 py-lg-5">
          {error && <Alert variant="danger">{error}</Alert>}

          {nextEvent && (
            <section className="cut-public-agenda-next" aria-label="Próximo evento">
              <div className="cut-public-agenda-next__media">
                {nextEvent.image
                  ? <img src={mediaUrl(nextEvent.image)} alt={nextEvent.title} />
                  : <div className="cut-public-agenda-event__fallback"><i className="fa-regular fa-calendar" /></div>}
              </div>
              <div className="cut-public-agenda-next__body">
                <span className="cut-eyebrow">Próximo evento</span>
                <h2>{nextEvent.title}</h2>
                <p><i className="fa-regular fa-calendar me-2" />{formatDate(nextEvent.start_date)}</p>
                <p><i className="fa-solid fa-location-dot me-2" />{nextEvent.venue || nextEvent.city || "Local a definir"}</p>
                <Button onClick={() => navigate(`/event/${nextEvent.slug}`)}>
                  Ver evento e ingressos <i className="fa-solid fa-arrow-right ms-2" />
                </Button>
              </div>
            </section>
          )}

          <section className="cut-public-agenda-list-section">
            <div className="cut-public-agenda-heading">
              <div>
                <span className="cut-eyebrow">Programação</span>
                <h2>Eventos de {production.name}</h2>
              </div>
              <div className="cut-public-agenda-filters" role="tablist" aria-label="Filtrar agenda">
                <button type="button" className={filter === "upcoming" ? "is-active" : ""} onClick={() => setFilter("upcoming")}>Próximos</button>
                <button type="button" className={filter === "today" ? "is-active" : ""} onClick={() => setFilter("today")}>Hoje</button>
                <button type="button" className={filter === "week" ? "is-active" : ""} onClick={() => setFilter("week")}>7 dias</button>
                <button type="button" className={filter === "past" ? "is-active" : ""} onClick={() => setFilter("past")}>Anteriores</button>
              </div>
            </div>

            {filteredEvents.length === 0 ? (
              <div className="cut-public-agenda-empty">
                <i className="fa-regular fa-calendar-xmark" />
                <h3>Nenhum evento neste período</h3>
                <p>{filter === "upcoming" ? "A produção ainda não anunciou novos eventos." : "Escolha outro período para continuar navegando pela agenda."}</p>
              </div>
            ) : (
              <div className="cut-public-agenda-grid">
                {filteredEvents.map((event) => (
                  <article className="cut-public-agenda-event" key={event.id}>
                    <div className="cut-public-agenda-event__media">
                      {event.image
                        ? <img src={mediaUrl(event.image)} alt={event.title} loading="lazy" decoding="async" />
                        : <div className="cut-public-agenda-event__fallback"><i className="fa-regular fa-calendar" /></div>}
                    </div>
                    <div className="cut-public-agenda-event__body">
                      <div className="cut-public-agenda-event__date">
                        <i className="fa-regular fa-calendar" />
                        <span>{formatDate(event.start_date)}</span>
                      </div>
                      <h3>{event.title}</h3>
                      <p><i className="fa-solid fa-location-dot" />{event.venue || event.city || "Local a definir"}</p>
                      <Button onClick={() => navigate(`/event/${event.slug}`)}>
                        {filter === "past" ? "Ver evento" : "Ver evento e ingressos"}
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </Container>
      </main>

      {nextEvent && (
        <div className="cut-public-agenda-sticky-cta">
          <div>
            <small>Próximo evento</small>
            <strong>{nextEvent.title}</strong>
          </div>
          <Button onClick={() => navigate(`/event/${nextEvent.slug}`)}>Ver ingressos</Button>
        </div>
      )}
    </div>
  );
}
