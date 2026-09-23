import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Container } from "react-bootstrap";
import { Link, useNavigate } from "react-router-dom";
import PeterTecnetSignature from "../components/PeterTecnetSignature";
import ProcessingIndicatorComponent from "../components/ProcessingIndicatorComponent";
import CommerceTrustRail from "../components/CommerceTrustRail";
import cutinappService from "../services/CutinappService";
import eventService from "../services/EventService";
import { storageUrl } from "../config";
import { readDiscoveryPreference, saveDiscoveryPreference } from "../utils/discoveryFilters";
import { clearHomeLocation, readHomeLocation, saveHomeLocation } from "../utils/homeLocationStorage";
import "./HomePage.css";
import "./LandingPageV2.css";

const dateLabel = (value) => value
  ? new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
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

const roles = [
  {
    key: "publico",
    icon: "fa-solid fa-compass",
    label: "Participante",
    title: "Quero descobrir e viver eventos",
    text: "Encontre o que acontece perto de você, acompanhe produções e artistas, participe da comunidade e mantenha seus ingressos no mesmo lugar.",
    benefits: ["Eventos por cidade e localização", "Ingressos e carteira digital", "Artistas, produções e comunidade"],
    cta: "Encontrar meu próximo evento",
    to: "/event",
  },
  {
    key: "produtor",
    icon: "fa-solid fa-bolt",
    label: "Produtor",
    title: "Quero público, operação e recorrência",
    text: "Publique eventos, construa sua audiência e acompanhe a operação com participantes, vendas, cortesias, line-up e check-in conectados.",
    benefits: ["Agenda e publicação de eventos", "Vendas, participantes e cortesias", "Check-in e visão operacional"],
    cta: "Cadastrar minha produção",
    to: "/register",
    state: { from: "/production/create" },
  },
  {
    key: "artista",
    icon: "fa-solid fa-microphone-lines",
    label: "Artista",
    title: "Quero ser encontrado pela cena",
    text: "Tenha uma presença pública conectada aos seus eventos, line-ups e produções para que o público descubra quem está por trás da experiência.",
    benefits: ["Perfil público", "Eventos e line-ups relacionados", "Mais contexto para descoberta"],
    cta: "Criar minha presença",
    to: "/register",
    state: { from: "/artist/manage" },
  },
  {
    key: "promoter",
    icon: "fa-solid fa-bullhorn",
    label: "Promoter",
    title: "Quero ampliar o alcance dos eventos",
    text: "Use a rede da Cutinapp para acompanhar eventos, produções e público e transformar divulgação em uma jornada conectada à experiência.",
    benefits: ["Rede da cena", "Descoberta contextual", "Compartilhamento e alcance"],
    cta: "Entrar para a rede",
    to: "/register",
    state: { from: "/feed" },
  },
];

const demoSteps = [
  { key: "descobrir", number: "01", icon: "fa-solid fa-location-crosshairs", title: "Descobrir", text: "A cidade e os filtros aproximam eventos relevantes de quem está procurando o próximo rolê." },
  { key: "entender", number: "02", icon: "fa-solid fa-users", title: "Entender", text: "O usuário vê produção, artistas, local, data e contexto antes de decidir participar." },
  { key: "participar", number: "03", icon: "fa-solid fa-ticket", title: "Participar", text: "Ingresso, carteira e informações do evento continuam dentro da mesma experiência." },
  { key: "conectar", number: "04", icon: "fa-solid fa-comments", title: "Conectar", text: "Feed, comunidade e relações com produções e artistas mantêm o evento vivo antes e depois." },
  { key: "voltar", number: "05", icon: "fa-solid fa-rotate", title: "Voltar", text: "A descoberta seguinte começa com mais contexto, afinidade e vínculo com a cena local." },
];

const faqItems = [
  {
    category: "geral",
    question: "O que é a Cutinapp?",
    answer: "A Cutinapp é uma rede social de eventos que transforma descoberta, interação, compra, participação e pós-evento em uma experiência única, enquanto oferece ao produtor toda a infraestrutura necessária para organizar, divulgar, vender e administrar seus eventos."
  },
  {
    category: "participante",
    question: "Preciso pagar para usar a Cutinapp?",
    answer: "Não para descobrir eventos, produções, artistas e conteúdos públicos. Você só paga quando decide comprar um ingresso, item ou outra oferta disponibilizada por um evento."
  },
  {
    category: "participante",
    question: "Preciso criar uma conta para descobrir eventos?",
    answer: "Não. Você pode começar explorando eventos sem cadastro. A conta passa a fazer diferença quando quer comprar, acompanhar sua experiência, guardar ingressos e participar dos recursos sociais."
  },
  {
    category: "participante",
    question: "Como encontro eventos perto de mim?",
    answer: "A Cutinapp permite descobrir eventos pela sua localização ou cidade e combinar filtros de período, categoria, popularidade, gratuidade e disponibilidade."
  },
  {
    category: "participante",
    question: "Por que usar a Cutinapp em vez de procurar eventos em várias redes sociais?",
    answer: "Porque a Cutinapp concentra descoberta, detalhes do evento, produção, artistas, ingressos e participação em uma jornada conectada, reduzindo a necessidade de procurar cada informação em um lugar diferente."
  },
  {
    category: "participante",
    question: "Consigo comprar ingressos pela Cutinapp?",
    answer: "Sim. Quando o produtor disponibiliza ingressos, você pode acessar o evento e seguir o fluxo de compra dentro da experiência da Cutinapp."
  },
  {
    category: "participante",
    question: "Onde ficam meus ingressos depois da compra?",
    answer: "Seus ingressos ficam associados à sua conta e podem ser acessados pela área de ingressos, facilitando a consulta e a apresentação no evento."
  },
  {
    category: "participante",
    question: "A Cutinapp serve somente para comprar ingressos?",
    answer: "Não. O ingresso é apenas uma parte da jornada. A Cutinapp também conecta descoberta, comunidade, eventos, produções, artistas, conteúdo, interação e experiências antes e depois do evento."
  },
  {
    category: "participante",
    question: "A experiência termina quando o evento acaba?",
    answer: "Não precisa terminar. A proposta da Cutinapp é manter o evento vivo também no pós-evento, permitindo que a experiência, os registros e as interações continuem gerando conexão com a comunidade."
  },
  {
    category: "produtor",
    question: "O que a Cutinapp oferece para produtores de eventos?",
    answer: "O produtor pode criar sua presença, publicar eventos, organizar agenda, ingressos, participantes, cortesias, vendas, line-up e check-in, concentrando a operação em um único ecossistema."
  },
  {
    category: "produtor",
    question: "A Cutinapp ajuda meu evento a ser encontrado por novos participantes?",
    answer: "Sim. Eventos públicos entram na experiência de descoberta da plataforma e podem ser encontrados por cidade, localização, período, categoria e outros sinais relevantes para o público."
  },
  {
    category: "produtor",
    question: "Posso criar eventos recorrentes?",
    answer: "Sim. A Cutinapp possui recursos de agenda para facilitar a operação de produtores que trabalham com eventos recorrentes e reduzir retrabalho."
  },
  {
    category: "produtor",
    question: "Posso trabalhar com ingressos gratuitos e cortesias?",
    answer: "Sim. A operação de eventos pode incluir diferentes formas de acesso, incluindo lotes, opções gratuitas e gestão de cortesias conforme a configuração do produtor."
  },
  {
    category: "produtor",
    question: "Consigo acompanhar vendas e participantes?",
    answer: "Sim. O produtor possui áreas específicas para acompanhar vendas, participantes, ingressos e outras informações operacionais relacionadas aos seus eventos."
  },
  {
    category: "produtor",
    question: "Como funciona o check-in dos participantes?",
    answer: "A Cutinapp oferece fluxo de validação de ingressos para facilitar a conferência de acesso e o acompanhamento da entrada dos participantes no evento."
  },
  {
    category: "produtor",
    question: "A Cutinapp funciona apenas para grandes eventos?",
    answer: "Não. Festas independentes, casas, bares, coletivos, produtores e eventos de diferentes tamanhos podem utilizar a plataforma para construir presença, público e operação."
  },
  {
    category: "artista",
    question: "Artistas podem fazer parte da Cutinapp?",
    answer: "Sim. Artistas podem ter presença pública conectada aos eventos, produções e line-ups, ajudando o público a descobrir quem faz parte de cada experiência."
  },
  {
    category: "artista",
    question: "Promoters também podem usar a Cutinapp?",
    answer: "Sim. A Cutinapp conecta diferentes pessoas que movimentam a cena de eventos, incluindo promoters e outros perfis envolvidos na divulgação e relacionamento com o público."
  },
  {
    category: "seguranca",
    question: "Como a Cutinapp ajuda a proteger os ingressos?",
    answer: "Os fluxos de ingresso e check-in utilizam identificação digital e validação para facilitar a conferência e reduzir o uso indevido de acessos."
  },
  {
    category: "seguranca",
    question: "Posso denunciar problemas ou comportamentos inadequados?",
    answer: "Sim. A plataforma possui recursos de denúncia e moderação para que situações problemáticas possam ser encaminhadas e analisadas dentro do ecossistema."
  },
  {
    category: "geral",
    question: "Posso usar a Cutinapp pelo celular?",
    answer: "Sim. A experiência é preparada para dispositivos móveis e pode ser acessada pelo navegador. Quando a instalação estiver disponível no dispositivo, a Cutinapp também pode ser adicionada como aplicativo para acesso mais rápido."
  },
];

const faqCategories = [
  ["todos", "Todas"],
  ["participante", "Participantes"],
  ["produtor", "Produtores"],
  ["artista", "Artistas e promoters"],
  ["seguranca", "Segurança"],
  ["geral", "Geral"],
];

function urgencyLabel(value) {
  if (!value) return "Em breve";
  const eventDate = new Date(value);
  const now = new Date();
  const hours = (eventDate.getTime() - now.getTime()) / 3600000;
  if (hours >= -6 && hours <= 24) return "Hoje";
  if (hours > 24 && hours <= 72) return "Nos próximos dias";
  if (hours > 72 && hours <= 168) return "Nesta semana";
  return "Próximo evento";
}

export default function LandingPageV2() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [events, setEvents] = useState([]);
  const [productions, setProductions] = useState([]);
  const [artists, setArtists] = useState([]);
  const [cities, setCities] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [locationBusy, setLocationBusy] = useState(false);
  const [usingFallback, setUsingFallback] = useState(false);
  const [activeRole, setActiveRole] = useState("publico");
  const [activeDemo, setActiveDemo] = useState("descobrir");
  const [faqCategory, setFaqCategory] = useState("todos");
  const [faqQuery, setFaqQuery] = useState("");
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
        eventService.search({ ...params, available: 1, per_page: 12, sort: "soonest" }),
        cutinappService.publicProductions({ ...params, per_page: 10 }),
        cutinappService.artists({ ...(params.city ? { city: params.city, ...(params.uf ? { uf: params.uf } : {}) } : {}), per_page: 12 }),
        cutinappService.discoveryFacets(),
      ]);

      let localEvents = eventResult.status === "fulfilled" ? eventResult.value.events?.data || [] : [];
      let localProductions = productionResult.status === "fulfilled" ? productionResult.value.productions?.data || [] : [];
      let localArtists = artistResult.status === "fulfilled" ? artistResult.value.artists?.data || [] : [];
      const facetCities = facetResult.status === "fulfilled" ? facetResult.value.cities || [] : [];
      const facetCategories = facetResult.status === "fulfilled" ? facetResult.value.categories || [] : [];

      localProductions = uniqueById([
        ...localEvents.map((event) => event.production).filter(Boolean),
        ...localProductions,
      ]);
      localArtists = uniqueById([
        ...localEvents.flatMap((event) => event.artists || []),
        ...localArtists,
      ]);

      if (Object.keys(params).length > 0 && localEvents.length === 0) {
        const fallback = await Promise.allSettled([
          eventService.search({ available: 1, per_page: 12, sort: "soonest" }),
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
      setCities(facetCities.slice(0, 18));
      setCategories(facetCategories.slice(0, 14));
    } catch (_) {
      setEvents([]);
      setProductions([]);
      setArtists([]);
      setCities([]);
      setCategories([]);
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
    document.getElementById("descobrir")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const clearLocation = () => {
    clearHomeLocation();
    setLocation(null);
    saveDiscoveryPreference({ city: "", uf: "" });
  };

  const makeEventLink = useCallback((extra = {}) => {
    const params = new URLSearchParams();
    if (location?.lat && location?.lng) {
      params.set("lat", location.lat);
      params.set("lng", location.lng);
      params.set("radius_km", "80");
    } else if (location?.city) {
      params.set("city", location.city);
      if (location.uf) params.set("uf", location.uf);
    }
    Object.entries(extra).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
    });
    const query = params.toString();
    return query ? `/event?${query}` : "/event";
  }, [location]);

  const locationLabel = location?.city
    ? `${location.city}${location.uf ? ` - ${location.uf}` : ""}`
    : location?.lat
      ? "perto de você"
      : "na Cutinapp";

  const browseLink = makeEventLink();
  const submitDiscoverySearch = (event) => {
    event.preventDefault();
    const query = searchQuery.trim();
    navigate(query ? `/search?q=${encodeURIComponent(query)}` : browseLink);
  };
  const featuredEvent = events[0] || null;
  const featuredEventLink = featuredEvent?.slug ? `/event/${encodeURIComponent(featuredEvent.slug)}` : browseLink;
  const featuredProduction = productions[0] || null;
  const featuredProductionLink = featuredProduction?.slug ? `/production/${encodeURIComponent(featuredProduction.slug)}/public` : "/productions";
  const featuredArtists = artists.slice(0, 4);
  const activeRoleData = roles.find((role) => role.key === activeRole) || roles[0];
  const activeDemoData = demoSteps.find((step) => step.key === activeDemo) || demoSteps[0];
  const discoveredEventCount = cities.reduce((total, city) => total + Number(city.total || 0), 0) || events.length;

  const filteredFaq = faqItems.filter((item) => {
    const categoryOk = faqCategory === "todos" || item.category === faqCategory;
    const query = normalizeKey(faqQuery);
    const queryOk = !query || normalizeKey(`${item.question} ${item.answer}`).includes(query);
    return categoryOk && queryOk;
  });

  return (
    <div className="cut-landing">
      <header className="cut-landing__nav">
        <Container className="cut-landing__navInner">
          <Link to="/" className="cut-landing__brand" aria-label="Cutinapp - início">
            <span className="cut-landing__brandOrb"><img src="/images/logo.png" alt="" /></span>
            <span><strong>Cutinapp</strong><small>A CENA CONECTADA</small></span>
          </Link>
          <nav aria-label="Navegação pública">
            <a href="#descobrir">Eventos</a>
            <a href="#como-funciona">Como funciona</a>
            <Link to="/for-producers">Para produtores</Link>
            <a href="#faq">FAQ</a>
            <Link to="/help">Ajuda</Link>
            <Link to="/login">Entrar</Link>
            <Button as={Link} to="/register" className="cut-landing__navCta">Criar conta grátis</Button>
          </nav>
        </Container>
      </header>

      <main>
        <section className="cut-landing__hero" aria-labelledby="cutinapp-hero-title">
          <div className="cut-landing__glow cut-landing__glow--one" />
          <div className="cut-landing__glow cut-landing__glow--two" />
          <Container className="cut-landing__heroGrid">
            <div className="cut-landing__heroCopy">
              <span className="cut-landing__signal"><i /> Eventos, pessoas e experiências em movimento</span>
              <h1 id="cutinapp-hero-title">Sua cidade<br /><em>acontece aqui.</em></h1>
              <p>
                Descubra eventos, acompanhe produções e artistas, compre seus ingressos e participe da cena.
                Para quem produz, a Cutinapp conecta divulgação, público e operação no mesmo ecossistema.
              </p>
              <form className="cut-landing__heroSearch" onSubmit={submitDiscoverySearch} role="search">
                <label htmlFor="cut-landing-search">Encontre seu próximo evento</label>
                <div>
                  <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
                  <input
                    id="cut-landing-search"
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Evento, artista, produção ou local"
                    autoComplete="off"
                  />
                  <button type="submit">Pesquisar</button>
                </div>
              </form>
              <div className="cut-landing__heroSearchChips" aria-label="Filtros rápidos">
                <Link to={makeEventLink({ period: "today" })}>Hoje</Link>
                <Link to={makeEventLink({ period: "tomorrow" })}>Amanhã</Link>
                <Link to={makeEventLink({ period: "weekend" })}>Fim de semana</Link>
                <Link to={makeEventLink({ free: 1 })}>Grátis</Link>
                <Link to={makeEventLink({ available: 1 })}>Com ingressos</Link>
              </div>
              <CommerceTrustRail context="discovery" />
              <div className="cut-landing__heroActions">
                <Button as={Link} to="/register" className="cut-landing__primary">Criar minha conta grátis <i className="fa-solid fa-arrow-right" /></Button>
                <Link to={browseLink} className="cut-landing__secondary">Explorar eventos</Link>
              </div>
              <Link to="/for-producers" className="cut-landing__producerLink">
                <i className="fa-solid fa-bolt" /> Sou produtor de eventos <span>→</span>
              </Link>
              <div className="cut-landing__trustRow">
                <span><i className="fa-solid fa-location-dot" /> Descoberta local</span>
                <span><i className="fa-solid fa-ticket" /> Ingressos conectados</span>
                <span><i className="fa-solid fa-users" /> Rede da cena</span>
              </div>
            </div>

            <div className="cut-landing__heroStage" aria-label="Prévia da Cutinapp">
              <a
                href={featuredEventLink}
                className="cut-landing__phone"
                aria-label={featuredEvent?.title ? `Abrir evento ${featuredEvent.title}` : "Explorar eventos"}
                style={{ display: "block", color: "inherit", cursor: "pointer", pointerEvents: "auto", touchAction: "manipulation" }}
              >
                <div className="cut-landing__phoneTop"><span /><strong>Cutinapp</strong><i className="fa-solid fa-bell" /></div>
                <div className="cut-landing__phoneMedia">
                  {featuredEvent?.image
                    ? <img src={mediaUrl(featuredEvent.image)} alt={featuredEvent.title} />
                    : <div className="cut-landing__phonePlaceholder"><i className="fa-regular fa-calendar" /></div>}
                  <span className="cut-landing__liveBadge"><i /> {urgencyLabel(featuredEvent?.start_date)}</span>
                </div>
                <div className="cut-landing__phoneBody">
                  <small>{featuredEvent ? dateLabel(featuredEvent.start_date) : "Descubra seu próximo evento"}</small>
                  <h2>{featuredEvent?.title || "A cena perto de você"}</h2>
                  <p><i className="fa-solid fa-location-dot" /> {featuredEvent ? formatEventLocation(featuredEvent) : locationLabel}</p>
                  <div className="cut-landing__phoneActions"><span><i className="fa-regular fa-heart" /> Curtir</span><span><i className="fa-solid fa-share-nodes" /> Compartilhar</span></div>
                </div>
              </a>

              <Link
                to={featuredProductionLink}
                className="cut-landing__floatingCard cut-landing__floatingCard--people"
                aria-label="Abrir página da produção"
                style={{ color: "inherit", textDecoration: "none", cursor: "pointer", pointerEvents: "auto", touchAction: "manipulation" }}
              >
                <small>QUEM FAZ ACONTECER</small>
                <strong>{featuredProduction?.name || "Produções da sua cidade"}</strong>
                <span>{featuredProduction?.city || "Descubra e acompanhe"}</span>
              </Link>

              <div className="cut-landing__floatingCard cut-landing__floatingCard--artists" style={{ pointerEvents: "none" }}>
                <small>ARTISTAS NA CENA</small>
                <div>
                  {featuredArtists.length ? featuredArtists.map((artist) => (
                    <span key={artist.id} title={artist.stage_name}>
                      {artist.photo ? <img src={mediaUrl(artist.photo)} alt={artist.stage_name} /> : String(artist.stage_name || "A").slice(0, 1).toUpperCase()}
                    </span>
                  )) : ["DJ", "A", "B"].map((label) => <span key={label}>{label}</span>)}
                </div>
              </div>
            </div>
          </Container>
        </section>

        <section className="cut-landing__pulseBar" aria-label="Atalhos de descoberta">
          <Container>
            <Link to={makeEventLink({ period: "today" })}><i className="fa-regular fa-sun" /><span><small>AGORA</small>O que acontece hoje</span><b>→</b></Link>
            <Link to={makeEventLink({ period: "tomorrow" })}><i className="fa-regular fa-calendar-plus" /><span><small>AMANHÃ</small>Planeje o próximo rolê</span><b>→</b></Link>
            <Link to={makeEventLink({ period: "weekend" })}><i className="fa-regular fa-calendar" /><span><small>PLANEJE</small>Seu fim de semana</span><b>→</b></Link>
            <Link to={makeEventLink({ sort: "popular" })}><i className="fa-solid fa-fire" /><span><small>EM ALTA</small>Eventos populares</span><b>→</b></Link>
            <Link to={makeEventLink({ available: 1 })}><i className="fa-solid fa-ticket" /><span><small>GARANTA</small>Com ingressos disponíveis</span><b>→</b></Link>
          </Container>
        </section>

        <section id="descobrir" className="cut-landing__section cut-landing__discovery">
          <Container>
            <div className="cut-landing__discoveryTop">
              <div>
                <span className="cut-landing__eyebrow">Eventos na Cutinapp</span>
                <h2>Próximos eventos <em>{location?.city ? `em ${location.city}` : "na Cutinapp"}</em></h2>
                <p>Veja primeiro o que realmente importa: eventos publicados, com data, local e acesso direto aos detalhes e ingressos.</p>
              </div>
              <div className="cut-landing__locationBox">
                <small>SUA DESCOBERTA</small>
                <strong><i className="fa-solid fa-location-dot" /> {locationLabel}</strong>
                <Button variant="outline-light" onClick={useMyLocation} disabled={locationBusy}><i className="fa-solid fa-location-crosshairs me-2" />Usar minha localização</Button>
                {locationBusy && <ProcessingIndicatorComponent fullscreen={false} label="Obtendo localização" />}
                {location && <button type="button" onClick={clearLocation}>Remover localização</button>}
              </div>
            </div>

            <div className="cut-landing__proofGrid" aria-label="Sinais atuais da descoberta">
              <div><strong>{discoveredEventCount}</strong><span>eventos encontrados nas cidades disponíveis</span></div>
              <div><strong>{productions.length}</strong><span>produções em destaque nesta descoberta</span></div>
              <div><strong>{artists.length}</strong><span>artistas presentes na vitrine atual</span></div>
            </div>

            {cities.length > 0 && <div className="cut-landing__cityRail">
              {cities.map((city) => {
                const active = location?.city && normalizeKey(location.city) === normalizeKey(city.city) && (!location.uf || location.uf === city.uf);
                return <button key={`${city.city}-${city.uf}`} type="button" className={active ? "active" : ""} onClick={() => chooseCity(city)}>
                  <span>{city.city}{city.uf ? ` - ${city.uf}` : ""}</span><small>{city.total}</small>
                </button>;
              })}
            </div>}

            {loading ? <ProcessingIndicatorComponent fullscreen={false} label="Buscando eventos" /> : events.length ? (
              <div className="cut-landing__eventGrid">
                {events.slice(0, 8).map((event) => (
                  <Link key={event.id} to={`/event/${event.slug}`} className="cut-landing__eventCard">
                    <div className="cut-landing__eventMedia">
                      {event.image ? <img src={mediaUrl(event.image)} alt={event.title} loading="lazy" /> : <span><i className="fa-regular fa-calendar" /></span>}
                      <div className="cut-landing__eventBadges"><b>{urgencyLabel(event.start_date)}</b>{event.free_ticket_lots_count > 0 && <b className="free">Grátis</b>}</div>
                    </div>
                    <div className="cut-landing__eventInfo">
                      <small>{dateLabel(event.start_date)}</small>
                      <h3>{event.title}</h3>
                      <p><i className="fa-solid fa-location-dot" /> {formatEventLocation(event)}</p>
                      {event.production?.name && <span>{event.production.name}</span>}
                    </div>
                  </Link>
                ))}
              </div>
            ) : <div className="cut-landing__empty">Nenhum evento público disponível agora.</div>}

            <div className="cut-landing__centerAction"><Button as={Link} to={browseLink} className="cut-landing__primary">Ver todos os eventos <i className="fa-solid fa-arrow-right" /></Button></div>
            {usingFallback && <p className="cut-landing__fallbackNote">Não encontramos eventos na localização escolhida, então mostramos destaques da Cutinapp para você continuar explorando.</p>}
          </Container>
        </section>

        <section id="para-voce" className="cut-landing__section cut-landing__roles">
          <Container>
            <div className="cut-landing__sectionHead">
              <div><span className="cut-landing__eyebrow">Feita para toda a cena</span><h2>Como você vive os eventos?</h2></div>
              <p>A mesma plataforma entrega valor diferente para quem participa, produz, se apresenta ou ajuda a divulgar.</p>
            </div>

            <div className="cut-landing__roleTabs" role="tablist" aria-label="Perfis da Cutinapp">
              {roles.map((role) => (
                <button key={role.key} type="button" className={activeRole === role.key ? "active" : ""} onClick={() => setActiveRole(role.key)}>
                  <i className={role.icon} /><span>{role.label}</span>
                </button>
              ))}
            </div>

            <div className="cut-landing__rolePanel">
              <div className="cut-landing__rolePanelCopy">
                <span>{activeRoleData.label}</span>
                <h3>{activeRoleData.title}</h3>
                <p>{activeRoleData.text}</p>
                <ul>{activeRoleData.benefits.map((benefit) => <li key={benefit}><i className="fa-solid fa-check" /> {benefit}</li>)}</ul>
                <Button as={Link} to={activeRoleData.key === "publico" ? browseLink : activeRoleData.to} state={activeRoleData.state} className="cut-landing__primary">
                  {activeRoleData.cta} <i className="fa-solid fa-arrow-right" />
                </Button>
              </div>
              <div className={`cut-landing__roleVisual cut-landing__roleVisual--${activeRoleData.key}`}>
                <div className="cut-landing__roleVisualIcon"><i className={activeRoleData.icon} /></div>
                <div className="cut-landing__roleVisualStack">
                  {activeRoleData.benefits.map((benefit, index) => <span key={benefit}><b>0{index + 1}</b>{benefit}</span>)}
                </div>
              </div>
            </div>
          </Container>
        </section>

        <section id="como-funciona" className="cut-landing__section cut-landing__demo">
          <Container>
            <div className="cut-landing__sectionHead cut-landing__sectionHead--center">
              <div><span className="cut-landing__eyebrow">Veja a Cutinapp funcionando</span><h2>Do “o que tem hoje?” até o próximo evento.</h2></div>
              <p>Uma jornada única para descobrir, entender, participar, se conectar e voltar.</p>
            </div>

            <div className="cut-landing__demoLayout">
              <div className="cut-landing__demoSteps">
                {demoSteps.map((step) => <button key={step.key} type="button" className={activeDemo === step.key ? "active" : ""} onClick={() => setActiveDemo(step.key)}>
                  <b>{step.number}</b><i className={step.icon} /><span><strong>{step.title}</strong><small>{step.text}</small></span>
                </button>)}
              </div>
              <div className="cut-landing__demoScreen">
                <div className="cut-landing__demoScreenTop"><span /><span /><span /></div>
                <div className="cut-landing__demoScreenBody">
                  <div className="cut-landing__demoIcon"><i className={activeDemoData.icon} /></div>
                  <small>ETAPA {activeDemoData.number}</small>
                  <h3>{activeDemoData.title}</h3>
                  <p>{activeDemoData.text}</p>
                  <div className="cut-landing__demoMiniFlow">
                    {demoSteps.map((step) => <span key={step.key} className={step.key === activeDemo ? "active" : ""}>{step.number}</span>)}
                  </div>
                </div>
              </div>
            </div>
          </Container>
        </section>

        <section className="cut-landing__section cut-landing__social">
          <Container>
            <div className="cut-landing__socialGrid">
              <div className="cut-landing__socialCopy">
                <span className="cut-landing__eyebrow">Uma rede social de eventos</span>
                <h2>O evento começa antes da entrada.</h2>
                <p>Descobrir é só o começo. A experiência continua quando você acompanha a produção, conhece o line-up, compartilha, participa e mantém o vínculo depois do evento.</p>
                <div className="cut-landing__socialFlow">
                  <span>Descobrir</span><i className="fa-solid fa-arrow-right" />
                  <span>Seguir</span><i className="fa-solid fa-arrow-right" />
                  <span>Participar</span><i className="fa-solid fa-arrow-right" />
                  <span>Compartilhar</span><i className="fa-solid fa-arrow-right" />
                  <span>Voltar</span>
                </div>
              </div>
              <div className="cut-landing__activityCard">
                <div className="cut-landing__activityHead"><strong>Na cena agora</strong><span><i /> AO VIVO</span></div>
                <article><i className="fa-solid fa-calendar-plus" /><div><small>NOVO EVENTO</small><strong>{featuredEvent?.title || "Eventos entram na descoberta"}</strong><span>{featuredEvent?.city ? `${featuredEvent.city}${featuredEvent.uf ? ` - ${featuredEvent.uf}` : ""}` : locationLabel}</span></div></article>
                <article><i className="fa-solid fa-users" /><div><small>PRODUÇÃO</small><strong>{featuredProduction?.name || "Produções ganham presença pública"}</strong><span>Acompanhe quem faz acontecer</span></div></article>
                <article><i className="fa-solid fa-microphone-lines" /><div><small>LINE-UP</small><strong>{featuredArtists[0]?.stage_name || "Artistas conectados aos eventos"}</strong><span>Descubra além do flyer</span></div></article>
              </div>
            </div>
          </Container>
        </section>

        <section className="cut-landing__section cut-landing__comparison">
          <Container>
            <div className="cut-landing__sectionHead">
              <div><span className="cut-landing__eyebrow">Menos fragmentação</span><h2>Eventos não deveriam viver espalhados.</h2></div>
              <p>A Cutinapp concentra a jornada que normalmente fica dividida entre redes sociais, mensagens, plataformas e planilhas.</p>
            </div>
            <div className="cut-landing__compareGrid">
              <article className="cut-landing__compareOld"><small>DO JEITO ESPALHADO</small><h3>Cada etapa em um lugar.</h3><ul><li><i className="fa-brands fa-instagram" /> Divulgação em rede social</li><li><i className="fa-brands fa-whatsapp" /> Conversa por mensagem</li><li><i className="fa-solid fa-ticket" /> Ingresso em outra plataforma</li><li><i className="fa-solid fa-table" /> Participantes em planilhas</li><li><i className="fa-solid fa-qrcode" /> Check-in em outro fluxo</li></ul></article>
              <article className="cut-landing__compareNew"><small>COM CUTINAPP</small><h3>Uma jornada conectada.</h3><div className="cut-landing__ecosystem"><span>Descoberta</span><span>Comunidade</span><span>Ingresso</span><span>Produção</span><span>Artistas</span><span>Check-in</span></div><strong>Tudo conversa com o mesmo evento.</strong></article>
            </div>
          </Container>
        </section>

        <section id="produtores" className="cut-landing__section cut-landing__producer">
          <Container>
            <div className="cut-landing__producerGrid">
              <div className="cut-landing__producerCopy">
                <span className="cut-landing__eyebrow">Para quem faz acontecer</span>
                <h2>Você produz. A Cutinapp ajuda seu evento a crescer.</h2>
                <p>Crie presença, publique sua agenda, organize a operação e transforme cada evento em audiência para o próximo.</p>
                <div className="cut-landing__producerJourney">
                  {["Crie eventos", "Construa audiência", "Venda", "Faça check-in", "Analise", "Traga o público de volta"].map((item, index) => <span key={item}><b>{index + 1}</b>{item}</span>)}
                </div>
                <Button as={Link} to="/register" state={{ from: "/production/create" }} className="cut-landing__primary">Cadastrar minha produção <i className="fa-solid fa-arrow-right" /></Button>
              </div>

              <div className="cut-landing__producerDashboard">
                <div className="cut-landing__dashboardTop"><span><i /> PAINEL DO PRODUTOR</span><small>Prévia da experiência</small></div>
                <div className="cut-landing__dashboardHero"><small>PRÓXIMO EVENTO</small><strong>{featuredEvent?.title || "Seu evento em destaque"}</strong><span>{featuredEvent ? dateLabel(featuredEvent.start_date) : "Data, operação e público em um só lugar"}</span></div>
                <div className="cut-landing__metricGrid">
                  {["Visualizações", "Interesses", "Vendas", "Check-ins"].map((metric, index) => <div key={metric}><i className={["fa-solid fa-eye", "fa-solid fa-heart", "fa-solid fa-receipt", "fa-solid fa-qrcode"][index]} /><span><small>{metric}</small><strong>Disponível no painel</strong></span></div>)}
                </div>
                <div className="cut-landing__dashboardBars"><span><i style={{ width: "82%" }} /></span><span><i style={{ width: "64%" }} /></span><span><i style={{ width: "46%" }} /></span></div>
                <small className="cut-landing__dashboardDisclaimer">Representação visual das áreas de acompanhamento; os números aparecem conforme os dados reais de cada evento.</small>
              </div>
            </div>
          </Container>
        </section>

        <section className="cut-landing__section cut-landing__cityContent">
          <Container>
            <div className="cut-landing__sectionHead">
              <div><span className="cut-landing__eyebrow">Descubra sua cidade</span><h2>Entre pela experiência que você quer viver.</h2></div>
              <p>Esses atalhos usam os filtros públicos da própria Cutinapp e ajudam descoberta, compartilhamento e aquisição orgânica.</p>
            </div>

            <div className="cut-landing__editorialGrid">
              <Link to={makeEventLink({ period: "today" })}><i className="fa-regular fa-sun" /><strong>Eventos de hoje</strong><span>O que ainda dá tempo de viver</span></Link>
              <Link to={makeEventLink({ period: "weekend" })}><i className="fa-regular fa-calendar" /><strong>Fim de semana</strong><span>Planeje seu próximo rolê</span></Link>
              <Link to={makeEventLink({ free: 1 })}><i className="fa-solid fa-gift" /><strong>Eventos gratuitos</strong><span>Descubra sem pagar ingresso</span></Link>
              <Link to={makeEventLink({ sort: "popular" })}><i className="fa-solid fa-fire" /><strong>Mais populares</strong><span>Veja o que está chamando atenção</span></Link>
            </div>

            {categories.length > 0 && <div className="cut-landing__categoryCloud">
              {categories.map((category) => <Link key={category.category} to={makeEventLink({ category: category.category })}><span>{category.category}</span><small>{category.total}</small></Link>)}
            </div>}
          </Container>
        </section>

        <section className="cut-landing__section cut-landing__futureSocial">
          <Container>
            <div className="cut-landing__sectionHead cut-landing__sectionHead--center">
              <div><span className="cut-landing__eyebrow">Identidade social</span><h2>Sua vida de eventos pode contar uma história.</h2></div>
              <p>A landing também apresenta a direção social da Cutinapp sem fingir que dados inexistentes já estão disponíveis.</p>
            </div>
            <div className="cut-landing__identityGrid">
              <article><i className="fa-solid fa-calendar-check" /><small>SEU ANO NA CENA</small><h3>Eventos que você viveu</h3><p>Uma visão pessoal da sua trajetória quando houver dados suficientes para isso.</p></article>
              <article><i className="fa-solid fa-star" /><small>AFINIDADE</small><h3>Produções que você acompanha</h3><p>Relações reais podem se transformar em descoberta melhor para os próximos eventos.</p></article>
              <article><i className="fa-solid fa-compass" /><small>DESCOBERTA</small><h3>Novos artistas e experiências</h3><p>O objetivo é fazer cada participação abrir portas para a próxima descoberta.</p></article>
            </div>
          </Container>
        </section>

        <section id="faq" className="cut-landing__section cut-landing__faq">
          <Container>
            <div className="cut-landing__sectionHead">
              <div><span className="cut-landing__eyebrow">Perguntas frequentes</span><h2>Entenda a Cutinapp sem enrolação.</h2></div>
              <p>Busque sua dúvida ou filtre pelo seu papel na cena.</p>
            </div>

            <div className="cut-landing__faqTools">
              <label className="cut-landing__faqSearch"><i className="fa-solid fa-magnifying-glass" /><input value={faqQuery} onChange={(event) => setFaqQuery(event.target.value)} placeholder="Qual é a sua dúvida?" /></label>
              <div className="cut-landing__faqCategories">
                {faqCategories.map(([key, label]) => <button key={key} type="button" className={faqCategory === key ? "active" : ""} onClick={() => setFaqCategory(key)}>{label}</button>)}
              </div>
            </div>

            <div className="cut-landing__faqGrid">
              {filteredFaq.length ? filteredFaq.map((item) => <details key={`${item.category}-${item.question}`}>
                <summary>{item.question}</summary><p>{item.answer}</p>
              </details>) : <div className="cut-landing__empty">Não encontramos essa dúvida. Tente outra palavra ou escolha outra categoria.</div>}
            </div>
          </Container>
        </section>

        <section className="cut-landing__finalCta">
          <Container>
            <div className="cut-landing__finalCard">
              <div><span className="cut-landing__eyebrow">Seu próximo evento pode já estar acontecendo</span><h2>Descubra o que está rolando perto de você.</h2><p>Crie sua conta para transformar descoberta em uma experiência conectada à sua cidade e à sua cena.</p></div>
              <div><Button as={Link} to="/register" className="cut-landing__primary">Criar conta grátis</Button><Link to={browseLink}>Explorar sem cadastro</Link></div>
            </div>
          </Container>
        </section>
      </main>

      <div className="cut-landing__mobileCta" aria-label="Ação principal"><Button as={Link} to="/register">Criar conta grátis <i className="fa-solid fa-arrow-right" /></Button></div>
      <PeterTecnetSignature />
    </div>
  );
}
