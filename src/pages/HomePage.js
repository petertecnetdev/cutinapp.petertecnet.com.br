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
const formatEventLocation = (event) => {
  const cityState = event?.city ? `${event.city}${event.uf ? ` - ${event.uf}` : ""}` : "";
  const venue = event?.venue || event?.address || "";
  return venue && cityState ? `${venue} · ${cityState}` : venue || cityState || "Local a confirmar";
};

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

const audiences = [
  {
    key: "publico",
    icon: "fa-solid fa-compass",
    eyebrow: "Quero viver a cena",
    title: "Público",
    text: "Descubra o que acontece perto de você, acompanhe artistas e produções e mantenha seus ingressos no mesmo lugar.",
    benefits: ["Eventos por localização", "Artistas e produções", "Ingressos e comunidade"],
  },
  {
    key: "produtor",
    icon: "fa-solid fa-bolt",
    eyebrow: "Quero movimentar a cena",
    title: "Produtores",
    text: "Publique eventos, organize line-ups, acompanhe participantes, vendas, cortesias e check-in em uma operação conectada.",
    benefits: ["Gestão de eventos", "Ingressos e participantes", "Check-in e operação"],
  },
  {
    key: "artista",
    icon: "fa-solid fa-microphone-lines",
    eyebrow: "Quero ocupar meu espaço",
    title: "Artistas",
    text: "Tenha presença pública na Cutinapp, apareça nos line-ups, conecte seu nome aos eventos e facilite sua descoberta pelo público.",
    benefits: ["Perfil público", "Line-ups e eventos", "Mais descoberta"],
  },
  {
    key: "promoter",
    icon: "fa-solid fa-bullhorn",
    eyebrow: "Quero ampliar o alcance",
    title: "Promoters",
    text: "Encontre eventos, acompanhe a cena e fortaleça a divulgação conectando público, artistas e produções dentro do mesmo ecossistema.",
    benefits: ["Descoberta rápida", "Rede da cena", "Divulgação contextual"],
  },
];

const journey = [
  {
    number: "01",
    icon: "fa-solid fa-location-crosshairs",
    title: "Descubra o que faz sentido para você",
    text: "A Cutinapp usa cidade e localização para aproximar eventos, artistas e produções relevantes.",
  },
  {
    number: "02",
    icon: "fa-solid fa-users",
    title: "Entenda quem está por trás de cada evento",
    text: "Veja produções, artistas e line-ups para escolher experiências por afinidade, não só por uma imagem de divulgação.",
  },
  {
    number: "03",
    icon: "fa-solid fa-ticket",
    title: "Participe e continue conectado",
    text: "A experiência continua com ingresso, comunidade, acompanhamento e novas descobertas dentro da mesma plataforma.",
  },
];

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
    window.scrollTo({ top: document.getElementById("descobrir")?.offsetTop || 0, behavior: "smooth" });
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

  const featuredEvent = events[0] || null;
  const featuredProduction = productions[0] || null;
  const featuredArtists = artists.slice(0, 4);

  return (
    <div className="cut-home cut-home-discovery">
      <header className="cut-home__nav cut-home-discovery__nav">
        <Container className="cut-home__navInner">
          <Link to="/" className="cut-home__brand">
            <span className="cut-home__brandOrb"><img src="/images/logo.png" alt="Cutinapp" /></span>
            <span className="cut-home__brandText"><strong>Cutinapp</strong><small>A CENA CONECTADA</small></span>
          </Link>
          <nav aria-label="Navegação pública">
            <a href="#descobrir">Descobrir</a>
            <a href="#para-voce">Para você</a>
            <a href="#artistas">Artistas</a>
            <Link to="/productions">Produções</Link>
            <Link to="/login">Entrar</Link>
            <Button as={Link} to="/register" className="cut-home__cta">Criar conta</Button>
          </nav>
        </Container>
      </header>

      <main>
        <section className="cut-home-discovery__brandHero" aria-labelledby="cutinapp-hero-title">
          <div className="cut-home-discovery__ambient cut-home-discovery__ambient--one" />
          <div className="cut-home-discovery__ambient cut-home-discovery__ambient--two" />
          <div className="cut-home-discovery__heroGrid" aria-hidden="true" />
          <Container className="cut-home-discovery__brandHeroInner">
            <div className="cut-home-discovery__brandCopy">
              <span className="cut-home-discovery__signal">
                <i />
                Eventos, artistas, produções e público no mesmo lugar
              </span>
              <h1 id="cutinapp-hero-title">
                Viva a cena.<br />
                <em>Descubra quem faz acontecer.</em>
              </h1>
              <p>
                A Cutinapp conecta quem procura o próximo rolê com quem cria a experiência.
                Descubra eventos, acompanhe artistas, conheça produções e participe de uma rede feita para a cena acontecer.
              </p>

              <div className="cut-home-discovery__brandActions">
                <Button as={Link} to={browseLink} className="cut-home-discovery__primaryCta">
                  Explorar eventos <i className="fa-solid fa-arrow-right" />
                </Button>
                <a className="cut-home-discovery__secondaryCta" href="#para-voce">
                  O que a Cutinapp faz <i className="fa-solid fa-chevron-down" />
                </a>
              </div>

              <div className="cut-home-discovery__heroProof" aria-label="Principais possibilidades">
                <span><i className="fa-solid fa-location-dot" /> Descubra perto de você</span>
                <span><i className="fa-solid fa-microphone-lines" /> Acompanhe artistas</span>
                <span><i className="fa-solid fa-ticket" /> Participe de eventos</span>
              </div>
            </div>

            <div className="cut-home-discovery__scene" aria-label="Uma visão da cena dentro da Cutinapp">
              <div className="cut-home-discovery__sceneHalo" />
              <article className="cut-home-discovery__sceneCard cut-home-discovery__sceneCard--event">
                <div className="cut-home-discovery__sceneLabel">
                  <span><i className="fa-solid fa-bolt" /> EM DESTAQUE</span>
                  <small>{locationLabel}</small>
                </div>
                <div className="cut-home-discovery__sceneEventMedia">
                  {featuredEvent?.image
                    ? <img src={mediaUrl(featuredEvent.image)} alt="" />
                    : <span><i className="fa-regular fa-calendar-days" /></span>}
                </div>
                <div className="cut-home-discovery__sceneEventCopy">
                  <small>{featuredEvent ? dateLabel(featuredEvent.start_date) : "O próximo evento começa aqui"}</small>
                  <strong>{featuredEvent?.title || "Descubra experiências que combinam com você"}</strong>
                  <span><i className="fa-solid fa-location-dot" /> {featuredEvent ? formatEventLocation(featuredEvent) : "Eventos por localização"}</span>
                </div>
              </article>

              <article className="cut-home-discovery__sceneCard cut-home-discovery__sceneCard--artists">
                <small>ARTISTAS NA CENA</small>
                <div className="cut-home-discovery__sceneFaces">
                  {featuredArtists.length
                    ? featuredArtists.map((artist) => (
                      <span key={artist.id} title={artist.stage_name}>
                        {artist.photo
                          ? <img src={mediaUrl(artist.photo)} alt={artist.stage_name} />
                          : String(artist.stage_name || "A").slice(0, 1).toUpperCase()}
                      </span>
                    ))
                    : ["A", "DJ", "B"].map((label) => <span key={label}>{label}</span>)}
                </div>
                <strong>Line-ups que viram descoberta</strong>
              </article>

              <article className="cut-home-discovery__sceneCard cut-home-discovery__sceneCard--production">
                <i className="fa-solid fa-users-gear" />
                <div>
                  <small>QUEM FAZ ACONTECER</small>
                  <strong>{featuredProduction?.name || "Produções conectadas"}</strong>
                  <span>{featuredProduction?.city || "Casas, coletivos e produtoras"}</span>
                </div>
              </article>

              <div className="cut-home-discovery__scenePulse">
                <i />
                <span>A cena está acontecendo agora</span>
              </div>
            </div>
          </Container>

          <div className="cut-home-discovery__roleRail" aria-label="Cutinapp para toda a cena">
            <div>
              <span>PÚBLICO</span><i />
              <span>PRODUTORES</span><i />
              <span>ARTISTAS</span><i />
              <span>PROMOTERS</span><i />
              <span>EVENTOS</span><i />
              <span>INGRESSOS</span><i />
              <span>COMUNIDADE</span>
            </div>
          </div>
        </section>

        <section id="para-voce" className="cut-home-discovery__audienceSection">
          <Container>
            <div className="cut-home-discovery__introHead">
              <div>
                <span className="cut-home__eyebrow">Uma plataforma. Vários jeitos de fazer parte.</span>
                <h2>Qual é o seu lugar na cena?</h2>
              </div>
              <p>
                A Cutinapp não foi criada só para vender ingresso. Ela organiza relações reais entre público,
                eventos, artistas e quem trabalha para tudo acontecer.
              </p>
            </div>

            <div className="cut-home-discovery__audienceGrid">
              {audiences.map((audience) => (
                <article key={audience.key} className={`cut-home-discovery__audienceCard cut-home-discovery__audienceCard--${audience.key}`}>
                  <div className="cut-home-discovery__audienceIcon"><i className={audience.icon} /></div>
                  <small>{audience.eyebrow}</small>
                  <h3>{audience.title}</h3>
                  <p>{audience.text}</p>
                  <ul>
                    {audience.benefits.map((benefit) => <li key={benefit}><i className="fa-solid fa-check" /> {benefit}</li>)}
                  </ul>
                  {audience.key === "publico" && <Link to={browseLink}>Encontrar eventos <i className="fa-solid fa-arrow-right" /></Link>}
                  {audience.key === "produtor" && <Link to="/register" state={{ from: "/event/create" }}>Criar meu primeiro evento <i className="fa-solid fa-arrow-right" /></Link>}
                  {audience.key === "artista" && <Link to="/register" state={{ from: "/artist/manage" }}>Criar presença na Cutinapp <i className="fa-solid fa-arrow-right" /></Link>}
                  {audience.key === "promoter" && <Link to="/register" state={{ from: "/feed" }}>Entrar para a rede <i className="fa-solid fa-arrow-right" /></Link>}
                </article>
              ))}
            </div>
          </Container>
        </section>

        <section className="cut-home-discovery__journeySection">
          <Container>
            <div className="cut-home-discovery__introHead cut-home-discovery__introHead--compact">
              <div>
                <span className="cut-home__eyebrow">Do interesse à experiência</span>
                <h2>A cena deixa de ser espalhada.</h2>
              </div>
              <p>Em vez de procurar informação em vários lugares, você entende o evento e continua conectado dentro da mesma jornada.</p>
            </div>
            <div className="cut-home-discovery__journeyGrid">
              {journey.map((step) => (
                <article key={step.number}>
                  <span className="cut-home-discovery__journeyNumber">{step.number}</span>
                  <i className={step.icon} />
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </article>
              ))}
            </div>
          </Container>
        </section>

        <section id="descobrir" className="cut-home-discovery__hero">
          <Container>
            <div className="cut-home-discovery__heroTop">
              <div>
                <span className="cut-home__eyebrow">Descoberta ao vivo</span>
                <h2>Veja o que está acontecendo <em>{location?.city ? `em ${location.city}` : "perto de você"}</em></h2>
                <p>Eventos reais publicados na Cutinapp, com artistas e produções que você pode conhecer antes de decidir.</p>
              </div>
              <div className="cut-home-discovery__locationBox">
                <small>SUA DESCOBERTA</small>
                <span><i className="fa-solid fa-location-dot" /> {locationLabel}</span>
                <Button size="sm" variant="outline-light" onClick={useMyLocation} disabled={locationBusy}>
                  {locationBusy ? "Localizando..." : "Usar minha localização"}
                </Button>
                {location && <button type="button" onClick={clearLocation}>Remover localização</button>}
              </div>
            </div>

            <div className="cut-home-discovery__quickLinks">
              <Link to={`${browseLink}${browseLink.includes("?") ? "&" : "?"}period=today`}><i className="fa-regular fa-sun" /> Hoje</Link>
              <Link to={`${browseLink}${browseLink.includes("?") ? "&" : "?"}period=weekend`}><i className="fa-regular fa-calendar" /> Fim de semana</Link>
              <Link to={`${browseLink}${browseLink.includes("?") ? "&" : "?"}free=1`}><i className="fa-solid fa-gift" /> Grátis</Link>
              <Link to="/artists"><i className="fa-solid fa-microphone-lines" /> Artistas</Link>
              <Link to="/productions"><i className="fa-solid fa-users" /> Produções</Link>
              <Link to={browseLink}>Ver tudo <i className="fa-solid fa-arrow-right" /></Link>
            </div>

            {cities.length > 0 && (
              <div className="cut-home-discovery__cities" aria-label="Cidades com eventos">
                {cities.map((city) => {
                  const active = location?.city && normalizeKey(location.city) === normalizeKey(city.city) && (!location.uf || location.uf === city.uf);
                  return (
                    <button key={`${city.city}-${city.uf}`} type="button" className={active ? "active" : ""} onClick={() => chooseCity(city)}>
                      <i className="fa-solid fa-location-dot" />
                      <span>{city.city}{city.uf ? ` - ${city.uf}` : ""}</span>
                      <small>{city.total}</small>
                    </button>
                  );
                })}
              </div>
            )}
          </Container>
        </section>

        <section id="eventos" className="cut-home-discovery__section">
          <Container>
            <div className="cut-home-discovery__sectionHead">
              <div><span>Próximos</span><h2>{usingFallback ? "Eventos em destaque" : `Eventos ${locationLabel}`}</h2></div>
              <Link to={browseLink}>Ver todos <i className="fa-solid fa-arrow-right" /></Link>
            </div>
            {loading
              ? <div className="cut-home-discovery__loading">Carregando eventos...</div>
              : events.length
                ? (
                  <div className="cut-home-discovery__events">
                    {events.map((event) => (
                      <Link key={event.id} to={`/event/${event.slug}`} className="cut-home-discovery__eventCard">
                        <div className="cut-home-discovery__eventImage">
                          {event.image ? <img src={mediaUrl(event.image)} alt={event.title} loading="lazy" /> : <span><i className="fa-regular fa-calendar" /></span>}
                          {event.free_ticket_lots_count > 0 && <b>GRÁTIS</b>}
                        </div>
                        <div className="cut-home-discovery__eventInfo">
                          <small>{dateLabel(event.start_date)}</small>
                          <h3>{event.title}</h3>
                          <p><i className="fa-solid fa-location-dot" /> {formatEventLocation(event)}</p>
                          {event.production?.name && <span>{event.production.name}</span>}
                        </div>
                      </Link>
                    ))}
                  </div>
                )
                : <div className="cut-home-discovery__empty">Nenhum evento público disponível agora.</div>}
          </Container>
        </section>

        <section id="artistas" className="cut-home-discovery__artistSpotlight">
          <Container>
            <div className="cut-home-discovery__artistSpotlightGrid">
              <div className="cut-home-discovery__artistSpotlightCopy">
                <span className="cut-home__eyebrow">Para quem sobe ao palco</span>
                <h2>Artista não é só uma atração no cartaz.</h2>
                <p>
                  Na Cutinapp, o artista pode ser descoberto como parte da cena: perfil, eventos relacionados,
                  line-ups e presença pública reunidos para o público entender quem está por trás da experiência.
                </p>
                <div className="cut-home-discovery__artistBenefits">
                  <span><i className="fa-solid fa-id-badge" /> Perfil público</span>
                  <span><i className="fa-solid fa-calendar-check" /> Eventos relacionados</span>
                  <span><i className="fa-solid fa-eye" /> Descoberta pelo público</span>
                </div>
                <div className="cut-home-discovery__artistActions">
                  <Button as={Link} to="/artists" className="cut-home-discovery__primaryCta">Conhecer artistas</Button>
                  <Link to="/register" state={{ from: "/artist/manage" }}>Sou artista <i className="fa-solid fa-arrow-right" /></Link>
                </div>
              </div>

              <div className="cut-home-discovery__artistMosaic">
                {loading
                  ? <div className="cut-home-discovery__loading">Carregando artistas...</div>
                  : featuredArtists.length
                    ? featuredArtists.map((artist, index) => (
                      <Link key={artist.id} to={`/artist/${artist.slug}`} className={`cut-home-discovery__artistTile cut-home-discovery__artistTile--${index + 1}`}>
                        <div>
                          {artist.photo
                            ? <img src={mediaUrl(artist.photo)} alt={artist.stage_name} loading="lazy" />
                            : <span>{String(artist.stage_name || "A").slice(0, 2).toUpperCase()}</span>}
                        </div>
                        <small>{Array.isArray(artist.genres) && artist.genres.length ? artist.genres.slice(0, 2).join(" · ") : artist.city || "Artista Cutinapp"}</small>
                        <strong>{artist.stage_name}</strong>
                        <span>{artist.upcoming_events_count || 0} próximo(s) evento(s)</span>
                      </Link>
                    ))
                    : <div className="cut-home-discovery__empty">Os artistas publicados vão aparecer aqui.</div>}
              </div>
            </div>
          </Container>
        </section>

        <section id="producoes" className="cut-home-discovery__section cut-home-discovery__section--alt">
          <Container>
            <div className="cut-home-discovery__sectionHead">
              <div><span>Quem movimenta a cena</span><h2>Produções para acompanhar</h2></div>
              <Link to="/productions">Ver produções <i className="fa-solid fa-arrow-right" /></Link>
            </div>
            {loading
              ? <div className="cut-home-discovery__loading">Carregando produções...</div>
              : productions.length
                ? (
                  <div className="cut-home-discovery__profiles">
                    {productions.map((production) => (
                      <Link key={production.id} to={`/production/${production.slug}/public`} className="cut-home-discovery__profileCard">
                        <div className="cut-home-discovery__profileAvatar">
                          {production.logo
                            ? <img src={mediaUrl(production.logo)} alt={production.name} loading="lazy" />
                            : <span>{String(production.name || "P").slice(0, 2).toUpperCase()}</span>}
                        </div>
                        <h3>{production.name}</h3>
                        <p>{production.city ? `${production.city}${production.uf ? ` · ${production.uf}` : ""}` : "Produção Cutinapp"}</p>
                        <small>{production.upcoming_events_count || 0} evento(s)</small>
                      </Link>
                    ))}
                  </div>
                )
                : <div className="cut-home-discovery__empty">As produções públicas vão aparecer aqui.</div>}
          </Container>
        </section>

        <section className="cut-home-discovery__faqSection">
          <Container>
            <div className="cut-home-discovery__introHead cut-home-discovery__introHead--compact">
              <div>
                <span className="cut-home__eyebrow">Entenda em segundos</span>
                <h2>Cutinapp é mais do que ingresso.</h2>
              </div>
              <p>É uma rede para descobrir, organizar e acompanhar a vida de um evento a partir das pessoas que fazem parte dele.</p>
            </div>
            <div className="cut-home-discovery__faqGrid">
              <details>
                <summary>Preciso criar conta para descobrir eventos?</summary>
                <p>Não. A descoberta de eventos, artistas e produções públicas começa antes do login. A conta entra quando você quer participar e manter sua experiência conectada.</p>
              </details>
              <details>
                <summary>Artistas podem usar a Cutinapp?</summary>
                <p>Sim. Artistas têm presença pública, podem aparecer em line-ups e eventos e passam a ser parte navegável da experiência do público dentro da plataforma.</p>
              </details>
              <details>
                <summary>O que produtores conseguem fazer?</summary>
                <p>Produtores podem estruturar sua produção, publicar eventos e trabalhar com recursos de operação como ingressos, participantes, cortesias, vendas e check-in.</p>
              </details>
              <details>
                <summary>A Cutinapp funciona só para grandes eventos?</summary>
                <p>Não. A proposta é conectar a cena independentemente do tamanho: produtores, casas, coletivos, artistas e público podem construir presença e descoberta no mesmo ecossistema.</p>
              </details>
            </div>
          </Container>
        </section>

        <section className="cut-home-discovery__ctaBand">
          <Container>
            <div>
              <div>
                <span className="cut-home__eyebrow">Seu próximo passo está aqui</span>
                <h2>Entre na cena do seu jeito.</h2>
                <p>Descubra o próximo evento, crie sua presença como artista ou comece a organizar experiências pela Cutinapp.</p>
              </div>
              <div className="cut-home-discovery__finalActions">
                <Button as={Link} to={browseLink}>Explorar eventos</Button>
                <Link to="/register">Criar conta</Link>
              </div>
            </div>
          </Container>
        </section>
      </main>

      <PeterTecnetSignature />
    </div>
  );
}
