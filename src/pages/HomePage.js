import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Container } from "react-bootstrap";
import { Link } from "react-router-dom";
import eventService from "../services/EventService";
import cutinappService from "../services/CutinappService";
import PeterTecnetSignature from "../components/PeterTecnetSignature";
import { storageUrl } from "../config";
import { readDiscoveryPreference, saveDiscoveryPreference } from "../utils/discoveryFilters";
import "./HomePage.css";
import "./HomeDiscovery.css";

const dateLabel = (value) => value
  ? new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value))
  : "Data a confirmar";

const mediaUrl = (path) => path ? `${storageUrl}${String(path).replace(/^\//, "")}` : "";
const normalizeKey = (value) => String(value || "").trim().toLocaleLowerCase("pt-BR");

const uniqueById = (items) => {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
};

const readHomeLocation = () => {
  try { return JSON.parse(window.localStorage.getItem("cutinapp.homeLocation") || "null"); }
  catch (_) { return null; }
};

const saveHomeLocation = (value) => {
  try { window.localStorage.setItem("cutinapp.homeLocation", JSON.stringify(value)); }
  catch (_) { /* localização local é apenas conveniência */ }
};

export default function HomePage() {
  const [events, setEvents] = useState([]);
  const [productions, setProductions] = useState([]);
  const [artists, setArtists] = useState([]);
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [locationBusy, setLocationBusy] = useState(false);
  const [usingFallback, setUsingFallback] = useState(false);
  const [location, setLocation] = useState(() => {
    const precise = readHomeLocation();
    if (precise?.lat && precise?.lng) return precise;
    const saved = readDiscoveryPreference();
    return saved?.city ? { city: saved.city, uf: saved.uf || "", mode: "city" } : null;
  });

  const discoveryParams = useMemo(() => {
    if (location?.lat && location?.lng) return { lat: location.lat, lng: location.lng, radius_km: 80 };
    if (location?.city) return { city: location.city, ...(location.uf ? { uf: location.uf } : {}) };
    return {};
  }, [location]);

  const loadDiscovery = useCallback(async (params = {}) => {
    setLoading(true);
    setUsingFallback(false);
    try {
      const [eventResult, productionResult, artistResult, facetResult] = await Promise.allSettled([
        eventService.search({ ...params, per_page: 12, sort: "soonest" }),
        cutinappService.publicProductions({ ...params, per_page: 10 }),
        cutinappService.artists({ ...(params.city ? { city: params.city, ...(params.uf ? { uf: params.uf } : {}) } : {}), per_page: 12 }),
        cutinappService.discoveryFacets(),
      ]);

      let localEvents = eventResult.status === "fulfilled" ? eventResult.value.events?.data || [] : [];
      let localProductions = productionResult.status === "fulfilled" ? productionResult.value.productions?.data || [] : [];
      let localArtists = artistResult.status === "fulfilled" ? artistResult.value.artists?.data || [] : [];
      const facetCities = facetResult.status === "fulfilled" ? facetResult.value.cities || [] : [];

      const eventProductions = localEvents.map((event) => event.production).filter(Boolean);
      const eventArtists = localEvents.flatMap((event) => event.artists || []);
      localProductions = uniqueById([...eventProductions, ...localProductions]);
      localArtists = uniqueById([...eventArtists, ...localArtists]);

      if (Object.keys(params).length > 0 && localEvents.length === 0) {
        const fallback = await Promise.allSettled([
          eventService.search({ per_page: 12, sort: "soonest" }),
          cutinappService.publicProductions({ per_page: 10 }),
          cutinappService.artists({ per_page: 12 }),
        ]);
        localEvents = fallback[0].status === "fulfilled" ? fallback[0].value.events?.data || [] : [];
        const fallbackProductions = fallback[1].status === "fulfilled" ? fallback[1].value.productions?.data || [] : [];
        const fallbackArtists = fallback[2].status === "fulfilled" ? fallback[2].value.artists?.data || [] : [];
        localProductions = uniqueById([...localEvents.map((event) => event.production).filter(Boolean), ...fallbackProductions]);
        localArtists = uniqueById([...localEvents.flatMap((event) => event.artists || []), ...fallbackArtists]);
        setUsingFallback(true);
      }

      setEvents(localEvents.slice(0, 12));
      setProductions(localProductions.slice(0, 10));
      setArtists(localArtists.slice(0, 12));
      setCities(facetCities.slice(0, 16));
    } catch (_) {
      setEvents([]);
      setProductions([]);
      setArtists([]);
      setCities([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDiscovery(discoveryParams); }, [discoveryParams, loadDiscovery]);

  useEffect(() => {
    if (location || !navigator.permissions || !navigator.geolocation) return;
    navigator.permissions.query({ name: "geolocation" }).then((permission) => {
      if (permission.state !== "granted") return;
      navigator.geolocation.getCurrentPosition(({ coords }) => {
        const next = { lat: coords.latitude.toFixed(6), lng: coords.longitude.toFixed(6), mode: "nearby" };
        saveHomeLocation(next);
        setLocation(next);
      }, () => undefined, { enableHighAccuracy: false, timeout: 7000, maximumAge: 600000 });
    }).catch(() => undefined);
  }, [location]);

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    setLocationBusy(true);
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      const next = { lat: coords.latitude.toFixed(6), lng: coords.longitude.toFixed(6), mode: "nearby" };
      saveHomeLocation(next);
      setLocation(next);
      setLocationBusy(false);
    }, () => setLocationBusy(false), { enableHighAccuracy: false, timeout: 9000, maximumAge: 300000 });
  };

  const chooseCity = (city) => {
    const next = { city: city.city, uf: city.uf || "", mode: "city" };
    saveHomeLocation(next);
    saveDiscoveryPreference({ city: city.city, uf: city.uf || "" });
    setLocation(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const clearLocation = () => {
    try { window.localStorage.removeItem("cutinapp.homeLocation"); }
    catch (_) { /* sem persistência a descoberta continua funcionando */ }
    setLocation(null);
    saveDiscoveryPreference({ city: "", uf: "" });
  };

  const locationLabel = location?.city
    ? `${location.city}${location.uf ? ` - ${location.uf}` : ""}`
    : location?.lat
      ? "perto de você"
      : "na Cutinapp";

  const browseLink = location?.city
    ? `/event?city=${encodeURIComponent(location.city)}${location.uf ? `&uf=${encodeURIComponent(location.uf)}` : ""}`
    : location?.lat
      ? `/event?lat=${location.lat}&lng=${location.lng}&radius_km=80`
      : "/event";

  return (
    <div className="cut-home cut-home-discovery">
      <header className="cut-home__nav cut-home-discovery__nav">
        <Container className="cut-home__navInner">
          <Link to="/" className="cut-home__brand"><span className="cut-home__brandOrb"><img src="/images/logo.png" alt="Cutinapp" /></span><span className="cut-home__brandText"><strong>Cutinapp</strong><small>REDE SOCIAL DE EVENTOS</small></span></Link>
          <nav aria-label="Navegação pública"><a href="#eventos">Eventos</a><a href="#producoes">Produções</a><a href="#artistas">Artistas</a><Link to="/login">Entrar</Link><Button as={Link} to="/register" className="cut-home__cta">Criar conta</Button></nav>
        </Container>
      </header>

      <main>
        <section className="cut-home-discovery__hero">
          <Container>
            <div className="cut-home-discovery__heroTop">
              <div>
                <span className="cut-home__eyebrow">Descoberta ao vivo</span>
                <h1>O que está acontecendo <em>{location?.city ? `em ${location.city}` : "perto de você"}</em></h1>
                <p>Eventos, artistas e produções para descobrir agora. Sem precisar entrar para começar.</p>
              </div>
              <div className="cut-home-discovery__locationBox">
                <span><i className="fa-solid fa-location-dot" /> {locationLabel}</span>
                <Button size="sm" variant="outline-light" onClick={useMyLocation} disabled={locationBusy}>{locationBusy ? "Localizando..." : "Usar localização"}</Button>
                {location && <button type="button" onClick={clearLocation}>Limpar</button>}
              </div>
            </div>

            <div className="cut-home-discovery__quickLinks">
              <Link to={`${browseLink}${browseLink.includes("?") ? "&" : "?"}period=today`}>Hoje</Link>
              <Link to={`${browseLink}${browseLink.includes("?") ? "&" : "?"}period=weekend`}>Fim de semana</Link>
              <Link to={`${browseLink}${browseLink.includes("?") ? "&" : "?"}free=1`}>Grátis</Link>
              <Link to="/artists">Artistas</Link>
              <Link to={browseLink}>Ver tudo <i className="fa-solid fa-arrow-right" /></Link>
            </div>

            {cities.length > 0 && <div className="cut-home-discovery__cities" aria-label="Cidades com eventos">
              {cities.map((city) => {
                const active = location?.city && normalizeKey(location.city) === normalizeKey(city.city) && (!location.uf || location.uf === city.uf);
                return <button key={`${city.city}-${city.uf}`} type="button" className={active ? "active" : ""} onClick={() => chooseCity(city)}><i className="fa-solid fa-location-dot" /><span>{city.city}{city.uf ? ` - ${city.uf}` : ""}</span><small>{city.total}</small></button>;
              })}
            </div>}
          </Container>
        </section>

        <section id="eventos" className="cut-home-discovery__section">
          <Container>
            <div className="cut-home-discovery__sectionHead"><div><span>Próximos</span><h2>{usingFallback ? "Eventos em destaque" : `Eventos ${locationLabel}`}</h2></div><Link to={browseLink}>Ver todos</Link></div>
            {loading ? <div className="cut-home-discovery__loading">Carregando eventos...</div> : events.length ? <div className="cut-home-discovery__events">
              {events.map((event) => <Link key={event.id} to={`/event/${event.slug}`} className="cut-home-discovery__eventCard">
                <div className="cut-home-discovery__eventImage">{event.image ? <img src={mediaUrl(event.image)} alt={event.title} loading="lazy" /> : <span><i className="fa-regular fa-calendar" /></span>}{event.free_ticket_lots_count > 0 && <b>GRÁTIS</b>}</div>
                <div className="cut-home-discovery__eventInfo"><small>{dateLabel(event.start_date)}</small><h3>{event.title}</h3><p><i className="fa-solid fa-location-dot" /> {event.venue || event.city || "Local a confirmar"}{event.city && event.venue ? ` · ${event.city}` : ""}</p>{event.production?.name && <span>{event.production.name}</span>}</div>
              </Link>)}
            </div> : <div className="cut-home-discovery__empty">Nenhum evento público disponível agora.</div>}
          </Container>
        </section>

        <section id="producoes" className="cut-home-discovery__section cut-home-discovery__section--alt">
          <Container>
            <div className="cut-home-discovery__sectionHead"><div><span>Quem movimenta a cena</span><h2>Produções</h2></div></div>
            {loading ? <div className="cut-home-discovery__loading">Carregando produções...</div> : productions.length ? <div className="cut-home-discovery__profiles">
              {productions.map((production) => <Link key={production.id} to={`/production/${production.slug}/public`} className="cut-home-discovery__profileCard">
                <div className="cut-home-discovery__profileAvatar">{production.logo ? <img src={mediaUrl(production.logo)} alt={production.name} loading="lazy" /> : <span>{String(production.name || "P").slice(0, 2).toUpperCase()}</span>}</div>
                <h3>{production.name}</h3><p>{production.city ? `${production.city}${production.uf ? ` · ${production.uf}` : ""}` : "Produção Cutinapp"}</p><small>{production.upcoming_events_count || 0} evento(s)</small>
              </Link>)}
            </div> : <div className="cut-home-discovery__empty">As produções públicas vão aparecer aqui.</div>}
          </Container>
        </section>

        <section id="artistas" className="cut-home-discovery__section">
          <Container>
            <div className="cut-home-discovery__sectionHead"><div><span>Line-ups e perfis</span><h2>Artistas para acompanhar</h2></div><Link to="/artists">Ver artistas</Link></div>
            {loading ? <div className="cut-home-discovery__loading">Carregando artistas...</div> : artists.length ? <div className="cut-home-discovery__artists">
              {artists.map((artist) => <Link key={artist.id} to={`/artist/${artist.slug}`} className="cut-home-discovery__artistCard">
                <div>{artist.photo ? <img src={mediaUrl(artist.photo)} alt={artist.stage_name} loading="lazy" /> : <span>{String(artist.stage_name || "A").slice(0, 2).toUpperCase()}</span>}</div>
                <h3>{artist.stage_name}</h3><p>{Array.isArray(artist.genres) && artist.genres.length ? artist.genres.slice(0, 2).join(" · ") : artist.city || "Artista Cutinapp"}</p><small>{artist.upcoming_events_count || 0} próximo(s)</small>
              </Link>)}
            </div> : <div className="cut-home-discovery__empty">Os artistas publicados vão aparecer aqui.</div>}
          </Container>
        </section>

        <section className="cut-home-discovery__ctaBand">
          <Container><div><div><span className="cut-home__eyebrow">Faça parte da cena</span><h2>Descubra. Siga. Participe.</h2><p>Crie sua conta para salvar eventos, seguir artistas e produções, conversar na comunidade e manter seus ingressos.</p></div><Button as={Link} to="/register">Criar minha conta</Button></div></Container>
        </section>
      </main>
      <PeterTecnetSignature />
    </div>
  );
}
