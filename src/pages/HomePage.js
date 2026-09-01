import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Container } from "react-bootstrap";
import { Link } from "react-router-dom";
import eventService from "../services/EventService";
import cutinappService from "../services/CutinappService";
import PeterTecnetSignature from "../components/PeterTecnetSignature";
import SkeletonCard from "../components/SkeletonCard";
import { readDiscoveryPreference, saveDiscoveryPreference } from "../utils/discoveryFilters";
import "./HomePage.css";

const dateLabel = (value) => value
  ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value))
  : "Data a confirmar";

const readHomeLocation = () => {
  try { return JSON.parse(window.localStorage.getItem("cutinapp.homeLocation") || "null"); }
  catch (_) { return null; }
};

const saveHomeLocation = (value) => {
  try { window.localStorage.setItem("cutinapp.homeLocation", JSON.stringify(value)); }
  catch (_) { /* localização continua funcionando sem persistência */ }
};

export default function HomePage() {
  const [events, setEvents] = useState([]);
  const [productions, setProductions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [locationBusy, setLocationBusy] = useState(false);
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
    try {
      const [eventResponse, productionResponse] = await Promise.all([
        eventService.search({ ...params, per_page: 6, sort: "soonest" }),
        cutinappService.publicProductions({ ...params, per_page: 6 }),
      ]);
      setEvents(eventResponse.events?.data || []);
      setProductions(productionResponse.productions?.data || []);
    } catch (_) {
      setEvents([]);
      setProductions([]);
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
      }, () => {}, { enableHighAccuracy: false, timeout: 7000, maximumAge: 600000 });
    }).catch(() => {});
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

  const clearLocation = () => {
    try { window.localStorage.removeItem("cutinapp.homeLocation"); } catch (_) {}
    setLocation(null);
    saveDiscoveryPreference({ city: "", uf: "" });
  };

  const locationTitle = location?.city
    ? `Em ${location.city}${location.uf ? ` - ${location.uf}` : ""}`
    : location?.lat
      ? "Perto de você"
      : "Na Cutinapp";

  const eventBrowseLink = location?.city
    ? `/event?city=${encodeURIComponent(location.city)}${location.uf ? `&uf=${encodeURIComponent(location.uf)}` : ""}`
    : location?.lat
      ? `/event?lat=${location.lat}&lng=${location.lng}&radius_km=80`
      : "/event";

  return (
    <div className="cut-home">
      <header className="cut-home__nav">
        <Container className="cut-home__navInner">
          <Link to="/" className="cut-home__brand"><span className="cut-home__brandOrb"><img src="/images/logo.png" alt="Cutinapp" /></span><span className="cut-home__brandText"><strong>Cutinapp</strong><small>REDE SOCIAL DE EVENTOS</small></span></Link>
          <nav aria-label="Navegação pública"><a href="#eventos">Eventos</a><a href="#producoes">Produções</a><Link to="/login">Entrar</Link><Button as={Link} to="/register" className="cut-home__cta">Criar conta</Button></nav>
        </Container>
      </header>

      <main>
        <section className="cut-home__hero">
          <div className="cut-home__glow" /><div className="cut-home__beam cut-home__beam--a" /><div className="cut-home__beam cut-home__beam--b" />
          <Container className="cut-home__heroInner">
            <div className="cut-home__copy">
              <div className="cut-home__statusline"><span className="cut-home__liveDot" /><span>EVENTOS, ARTISTAS E PRODUÇÕES CONECTADOS</span><b>ONLINE</b></div>
              <span className="cut-home__eyebrow">Descubra o que acontece perto</span>
              <h1>Seu próximo evento <br /><em>pode estar ao lado.</em></h1>
              <p>Descubra eventos da sua cidade, acompanhe produções e artistas, participe da comunidade e mantenha seus ingressos no mesmo lugar.</p>
              <div className="cut-home__actions"><Button as={Link} to={eventBrowseLink} className="cut-home__primary"><span>Explorar eventos</span><i className="fa-solid fa-arrow-right" /></Button><Button variant="outline-light" onClick={useMyLocation} disabled={locationBusy}><i className="fa-solid fa-location-crosshairs me-2" />{locationBusy ? "Localizando..." : "Usar minha localização"}</Button></div>
              <div className="cut-home__locationState"><i className="fa-solid fa-location-dot" /><span>{locationTitle}</span>{location && <button type="button" onClick={clearLocation}>Ver tudo</button>}</div>
            </div>
            <div className="cut-home__visual" aria-hidden="true"><div className="cut-home__techFrame"><span className="cut-home__corner cut-home__corner--tl" /><span className="cut-home__corner cut-home__corner--tr" /><span className="cut-home__corner cut-home__corner--bl" /><span className="cut-home__corner cut-home__corner--br" /><div className="cut-home__visualHeader"><span><i className="fa-solid fa-wave-square" /> CUTINAPP RADAR</span><b>LIVE</b></div><div className="cut-home__orbital"><div className="cut-home__orbit cut-home__orbit--outer"><span /></div><div className="cut-home__orbit cut-home__orbit--middle"><span /></div><div className="cut-home__orbit cut-home__orbit--inner" /><div className="cut-home__core"><img src="/images/logo.png" alt="" /></div></div><div className="cut-home__telemetry"><article><small>DESCOBERTA</small><strong>LOCAL</strong><span><i /></span></article><article><small>COMUNIDADE</small><strong>LIVE</strong><span><i /></span></article><article><small>ACESSO</small><strong>QR</strong><span><i /></span></article></div><div className="cut-home__signal">{Array.from({ length: 26 }).map((_, index) => <i key={index} style={{ "--i": index }} />)}</div></div></div>
          </Container>
          <div className="cut-home__ticker" aria-hidden="true"><div><span>EVENTOS</span><i /><span>INGRESSOS</span><i /><span>ARTISTAS</span><i /><span>PRODUÇÕES</span><i /><span>COMUNIDADE</span><i /><span>CHECK-IN</span><i /><span>EVENTOS</span><i /><span>INGRESSOS</span><i /><span>ARTISTAS</span><i /><span>PRODUÇÕES</span><i /><span>COMUNIDADE</span><i /><span>CHECK-IN</span><i /></div></div>
        </section>

        <section id="eventos" className="cut-home__section">
          <Container>
            <div className="cut-home__sectionHead"><div><span className="cut-home__eyebrow">Radar local</span><h2>Eventos {locationTitle.toLowerCase()}</h2><p>{location ? "Priorizamos experiências ligadas à sua localização, sem exigir login." : "Veja os próximos eventos públicos da rede."}</p></div><Button as={Link} to={eventBrowseLink} variant="outline-light">Ver todos</Button></div>
            <div className="cut-home__eventGrid" aria-busy={loading}>{loading ? Array.from({ length: 3 }).map((_, index) => <SkeletonCard key={index} />) : events.length ? events.map((event, index) => <Link key={event.id} to={`/event/${event.slug}`} className="cut-home__eventCard"><div className="cut-home__eventIndex">0{index + 1}</div><div className="cut-home__eventMedia">{event.image ? <img src={`https://api.petertecnet.com.br/storage/${String(event.image).replace(/^\//, "")}`} alt={`Capa de ${event.title}`} loading="lazy" /> : <i className="fa-regular fa-calendar-days" />}</div><div><span>{event.production?.name || "Cutinapp"}</span><h3>{event.title}</h3><p>{dateLabel(event.start_date)} · {event.city || event.venue || "Local a confirmar"}{event.distance_km != null ? ` · ${Number(event.distance_km).toFixed(1)} km` : ""}</p><b className="cut-home__eventLink">ABRIR EVENTO <i className="fa-solid fa-arrow-up-right-from-square" /></b></div></Link>) : <div className="cut-home__empty"><i className="fa-regular fa-calendar-plus" /><h3>Nenhum evento encontrado nesta região agora</h3><p>Amplie o radar para ver tudo que está acontecendo na Cutinapp.</p><Button as={Link} to="/event" variant="outline-light" className="mt-3">Ver todos os eventos</Button></div>}</div>
          </Container>
        </section>

        <section id="producoes" className="cut-home__section cut-home__section--soft">
          <Container>
            <div className="cut-home__sectionHead"><div><span className="cut-home__eyebrow">Quem faz acontecer</span><h2>Produções {locationTitle.toLowerCase()}</h2><p>Conheça e acompanhe quem movimenta os eventos da sua região.</p></div></div>
            <div className="cut-home__productionGrid" aria-busy={loading}>{loading ? Array.from({ length: 3 }).map((_, index) => <SkeletonCard key={index} />) : productions.length ? productions.map((production) => <Link key={production.id} to={`/production/${production.slug}/public`} className="cut-home__productionCard"><div className="cut-home__productionLogo">{production.logo ? <img src={`https://api.petertecnet.com.br/storage/${String(production.logo).replace(/^\//, "")}`} alt={production.name} /> : <span>{String(production.name || "P").slice(0, 2).toUpperCase()}</span>}</div><div><span>{production.city ? `${production.city}${production.uf ? ` - ${production.uf}` : ""}` : "Produção Cutinapp"}</span><h3>{production.name}</h3><p>{production.description || "Acompanhe os próximos eventos desta produção."}</p><b>{production.upcoming_events_count || 0} evento(s) ativo(s)</b></div></Link>) : <div className="cut-home__empty"><i className="fa-solid fa-bullhorn" /><h3>Produções de outras regiões estão chegando</h3><p>Você ainda pode explorar todas as produções através dos eventos públicos.</p></div>}</div>
          </Container>
        </section>
      </main>
      <PeterTecnetSignature />
    </div>
  );
}
