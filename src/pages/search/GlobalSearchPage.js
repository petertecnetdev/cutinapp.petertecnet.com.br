import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Button, Collapse, Container, Form, Spinner } from "react-bootstrap";
import { useNavigate, useSearchParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import { AuthContext } from "../../context/AuthContext";
import cutinappService from "../../services/CutinappService";
import { storageUrl } from "../../config";
import { trackTelemetry } from "../../utils/telemetry";
import "./GlobalSearchPage.css";

const RECENT_KEY = "cutinapp:global-search:recent:v2";
const ATTRIBUTION_KEY = "cutinapp:search-attribution:v1";
const SEARCH_CACHE = new Map();
const SEARCH_CACHE_TTL_MS = 20000;

const TABS = [
  ["all", "Tudo"],
  ["user", "Pessoas"],
  ["event", "Eventos"],
  ["production", "Produções"],
  ["artist", "Artistas"],
  ["post", "Publicações"],
  ["item", "Itens"],
  ["venue", "Locais"],
  ["promoter", "Promoters"],
];

const GROUPS = [
  ["people", "Pessoas", "user"],
  ["events", "Eventos", "event"],
  ["productions", "Produções", "production"],
  ["artists", "Artistas", "artist"],
  ["posts", "Publicações", "post"],
  ["items", "Itens", "item"],
  ["venues", "Locais", "venue"],
  ["promoters", "Promoters", "promoter"],
];

const TYPE_LABELS = {
  user: "Pessoa",
  event: "Evento",
  production: "Produção",
  artist: "Artista",
  post: "Publicação",
  item: "Item",
  venue: "Local",
  promoter: "Promoter",
};

const emptyResponse = () => ({ groups: {}, counts: {}, results: [], sponsored: [], has_more: false, page: 1, search_id: null });

const readJson = (key, fallback) => {
  if (typeof window === "undefined") return fallback;
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || "null");
    return value ?? fallback;
  } catch (_) {
    return fallback;
  }
};

const saveJson = (key, value) => {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* storage is optional */ }
};

const initials = (value) => String(value || "C")
  .trim()
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0])
  .join("")
  .toUpperCase();

const imageUrl = (value) => {
  if (!value) return "";
  const raw = String(value).trim();
  if (!raw) return "";
  return /^https?:\/\//i.test(raw) ? raw : `${storageUrl}${raw.replace(/^\/+/, "")}`;
};

const typeLabel = (type) => TYPE_LABELS[type] || "Resultado";
const formatRecentTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const delta = Date.now() - date.getTime();
  if (delta < 60 * 60 * 1000) return "Agora há pouco";
  if (delta < 24 * 60 * 60 * 1000) return "Hoje";
  if (delta < 48 * 60 * 60 * 1000) return "Ontem";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(date);
};

const normalizedFilters = (params) => ({
  city: params.get("city") || "",
  uf: params.get("uf") || "",
  period: params.get("period") || "",
  free: params.get("free") === "1",
  available: params.get("available") === "1",
  format: params.get("format") || "",
  genre: params.get("genre") || "",
  max_price: params.get("max_price") || "",
  radius_km: params.get("radius_km") || "50",
  sort: params.get("sort") || "relevance",
  lat: params.get("lat") || "",
  lng: params.get("lng") || "",
});

function SearchAvatar({ item }) {
  const [failed, setFailed] = useState(false);
  const src = !failed ? imageUrl(item.image) : "";

  return <span className={`cut-global-search__avatar cut-global-search__avatar--${item.type}`}>
    {src
      ? <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
      : <span>{initials(item.title)}</span>}
  </span>;
}

function SearchResultRow({ item, index, selected, onOpen, onPrefetch, onRemove }) {
  const body = <>
    <SearchAvatar item={item} />
    <span className="cut-global-search__result-copy">
      <span className="cut-global-search__result-title-line">
        <strong>{item.title}</strong>
        {item.sponsored && <span className="cut-global-search__sponsored">Patrocinado</span>}
      </span>
      <small>{item.subtitle || typeLabel(item.type)}</small>
      <span className="cut-global-search__badges">
        {(item.badges || []).slice(0, 3).map((badge) => <em key={badge}>{badge}</em>)}
        {!item.badges?.length && <em>{typeLabel(item.type)}</em>}
        {onRemove && item.searched_at && <em>{formatRecentTime(item.searched_at)}</em>}
      </span>
    </span>
  </>;

  if (onRemove) {
    return <div className={`cut-global-search__result cut-global-search__result--split ${selected ? "is-selected" : ""}`}>
      <button type="button" className="cut-global-search__result-open" onClick={() => onOpen(item, index)} onMouseEnter={() => onPrefetch?.(item)} onFocus={() => onPrefetch?.(item)}>
        {body}
      </button>
      <button type="button" className="cut-global-search__recent-remove" onClick={() => onRemove(item)} aria-label={`Remover ${item.title} dos recentes`}>
        <i className="fa-solid fa-xmark" />
      </button>
    </div>;
  }

  return <button
    type="button"
    className={`cut-global-search__result ${selected ? "is-selected" : ""}`}
    onClick={() => onOpen(item, index)}
    onMouseEnter={() => onPrefetch?.(item)}
    onFocus={() => onPrefetch?.(item)}
  >
    {body}
    <i className="fa-solid fa-chevron-right" aria-hidden="true" />
  </button>;
}

function SkeletonRows({ count = 5 }) {
  return <div className="cut-global-search__results cut-global-search__skeleton-list" aria-hidden="true">
    {Array.from({ length: count }).map((_, index) => <div className="cut-global-search__skeleton-row" key={index}>
      <span />
      <div><b /><b /><i /></div>
    </div>)}
  </div>;
}

function DiscoveryStrip({ title, items, onOpen, action }) {
  if (!items?.length) return null;
  return <section className="cut-global-search__discover-section">
    <div className="cut-global-search__section-heading">
      <h2>{title}</h2>
      {action}
    </div>
    <div className="cut-global-search__discover-grid">
      {items.map((item, index) => <button key={`${item.type}:${item.id}`} type="button" onClick={() => onOpen(item, index)}>
        <SearchAvatar item={item} />
        <span><strong>{item.title}</strong><small>{item.subtitle || typeLabel(item.type)}</small></span>
        {(item.badges || []).slice(0, 1).map((badge) => <em key={badge}>{badge}</em>)}
      </button>)}
    </div>
  </section>;
}

export default function GlobalSearchPage() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const initialType = TABS.some(([value]) => value === params.get("type")) ? params.get("type") : "all";
  const [query, setQuery] = useState(params.get("q") || "");
  const [activeType, setActiveType] = useState(initialType);
  const [filters, setFilters] = useState(() => normalizedFilters(params));
  const [response, setResponse] = useState(emptyResponse);
  const [recent, setRecent] = useState(() => readJson(RECENT_KEY, []).slice(0, 20));
  const [saved, setSaved] = useState([]);
  const [suggestions, setSuggestions] = useState({ entities: [], terms: [], did_you_mean: null });
  const [discover, setDiscover] = useState(null);
  const [loading, setLoading] = useState(false);
  const [moreLoading, setMoreLoading] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [error, setError] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [voiceActive, setVoiceActive] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const inputRef = useRef(null);
  const searchAbortRef = useRef(null);
  const suggestionAbortRef = useRef(null);
  const discoverAbortRef = useRef(null);
  const loadMoreRef = useRef(null);
  const prefetchRef = useRef(new Set());

  const searchParamsPayload = useCallback((page = 1) => {
    const payload = {
      q: query.trim(),
      type: activeType,
      per_type: activeType === "all" ? 8 : 20,
      page,
      source: "global_search_page",
    };
    Object.entries(filters).forEach(([key, value]) => {
      if (value === "" || value === false || value === null || value === undefined) return;
      payload[key] = value === true ? 1 : value;
    });
    return payload;
  }, [query, activeType, filters]);

  useEffect(() => {
    const next = new URLSearchParams();
    const normalized = query.trim();
    if (normalized) next.set("q", normalized);
    if (activeType !== "all") next.set("type", activeType);
    Object.entries(filters).forEach(([key, value]) => {
      if (value === "" || value === false || value === null || value === undefined || (key === "sort" && value === "relevance") || (key === "radius_km" && value === "50")) return;
      next.set(key, value === true ? "1" : String(value));
    });
    setParams(next, { replace: true });
  }, [query, activeType, filters, setParams]);

  useEffect(() => {
    if (!user) return undefined;
    let active = true;
    Promise.allSettled([cutinappService.globalSearchRecent({ limit: 20 }), cutinappService.globalSearchSaved()])
      .then(([recentResult, savedResult]) => {
        if (!active) return;
        if (recentResult.status === "fulfilled") {
          const serverRecent = recentResult.value?.recent || [];
          const merged = [...serverRecent, ...recent].filter((item, index, list) => list.findIndex((candidate) => candidate.type === item.type && String(candidate.id) === String(item.id)) === index).slice(0, 20);
          setRecent(merged);
          saveJson(RECENT_KEY, merged);
        }
        if (savedResult.status === "fulfilled") setSaved(savedResult.value?.saved || []);
      });
    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    const term = query.trim();
    if (!term) {
      searchAbortRef.current?.abort();
      setResponse(emptyResponse());
      setLoading(false);
      setError("");
      setSelectedIndex(-1);
      return undefined;
    }

    const controller = new AbortController();
    searchAbortRef.current?.abort();
    searchAbortRef.current = controller;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const payload = searchParamsPayload(1);
        const cacheKey = JSON.stringify(payload);
        const cached = SEARCH_CACHE.get(cacheKey);
        const data = cached && cached.expiresAt > Date.now()
          ? cached.data
          : await cutinappService.globalSearch(payload, controller.signal);
        if (!cached || cached.expiresAt <= Date.now()) SEARCH_CACHE.set(cacheKey, { data, expiresAt: Date.now() + SEARCH_CACHE_TTL_MS });
        setResponse(data || emptyResponse());
        setSelectedIndex(-1);
        trackTelemetry("global_search_performed", {
          query_length: term.length,
          type: activeType,
          result_count: Number(data?.counts?.total || 0),
          zero_result: Number(data?.counts?.total || 0) === 0,
        });
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err?.response?.data?.message || err?.message || "Não foi possível pesquisar agora.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 220);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, activeType, filters, searchParamsPayload]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      suggestionAbortRef.current?.abort();
      setSuggestions({ entities: [], terms: [], did_you_mean: null });
      setSuggestionsLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    suggestionAbortRef.current?.abort();
    suggestionAbortRef.current = controller;
    const timer = window.setTimeout(async () => {
      setSuggestionsLoading(true);
      try {
        const data = await cutinappService.globalSearchSuggestions({ ...searchParamsPayload(1), limit: 8 }, controller.signal);
        if (!controller.signal.aborted) setSuggestions(data || { entities: [], terms: [], did_you_mean: null });
      } catch (_) {
        if (!controller.signal.aborted) setSuggestions({ entities: [], terms: [], did_you_mean: null });
      } finally {
        if (!controller.signal.aborted) setSuggestionsLoading(false);
      }
    }, 120);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, filters, searchParamsPayload]);

  useEffect(() => {
    if (query.trim()) return undefined;
    const controller = new AbortController();
    discoverAbortRef.current?.abort();
    discoverAbortRef.current = controller;

    cutinappService.globalSearchDiscover({
      city: filters.city || undefined,
      uf: filters.uf || undefined,
      lat: filters.lat || undefined,
      lng: filters.lng || undefined,
    }, controller.signal)
      .then((data) => !controller.signal.aborted && setDiscover(data))
      .catch(() => !controller.signal.aborted && setDiscover(null));

    return () => controller.abort();
  }, [query, filters.city, filters.uf, filters.lat, filters.lng]);

  const flatResults = useMemo(() => {
    if (!query.trim()) return [];
    const sponsored = response?.sponsored || [];
    const groups = activeType === "all"
      ? GROUPS.flatMap(([key]) => response?.groups?.[key] || [])
      : GROUPS.filter(([, , type]) => type === activeType).flatMap(([key]) => response?.groups?.[key] || []);
    return [...sponsored, ...groups].filter((item, index, list) => list.findIndex((candidate) => candidate.type === item.type && String(candidate.id) === String(item.id)) === index);
  }, [query, response, activeType]);

  useEffect(() => {
    if (!loadMoreRef.current || activeType === "all" || !response?.has_more || loading || moreLoading) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadMore();
    }, { rootMargin: "260px" });
    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  });

  const rememberLocal = (item) => {
    const normalized = { type: item.type, id: item.id, title: item.title, subtitle: item.subtitle || "", image: item.image || "", url: item.url };
    const next = [normalized, ...recent.filter((entry) => !(entry.type === normalized.type && String(entry.id) === String(normalized.id)))].slice(0, 20);
    setRecent(next);
    saveJson(RECENT_KEY, next);
  };

  const openResult = async (item, index = 0) => {
    rememberLocal(item);
    const attribution = {
      search_id: response?.search_id || null,
      target_type: item.type,
      target_id: item.id,
      searched_at: Date.now(),
    };
    try { window.sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(attribution)); } catch (_) { /* optional */ }

    if (user) {
      cutinappService.trackGlobalSearchClick({
        search_id: response?.search_id || undefined,
        target_type: item.type,
        target_id: Number(item.id),
        position: Number(index) + 1,
        sponsored: Boolean(item.sponsored),
        item: {
          type: item.type,
          id: item.id,
          title: item.title,
          subtitle: item.subtitle || "",
          image: item.image || "",
          url: item.url,
        },
      }).catch(() => {});
    }

    trackTelemetry("global_search_result_selected", {
      type: item.type,
      target_id: item.id,
      sponsored: Boolean(item.sponsored),
      position: Number(index) + 1,
    });
    navigate(item.url);
  };

  const prefetchResult = (item) => {
    const key = `${item.type}:${item.id}`;
    if (prefetchRef.current.has(key)) return;
    prefetchRef.current.add(key);
    if (item.type === "event" && item.url?.startsWith("/event/")) {
      const slug = item.url.split("/").filter(Boolean)[1];
      if (slug) cutinappService.publicEvent?.(slug).catch?.(() => {});
    } else if ((item.type === "production" || item.type === "venue") && item.url?.includes("/production/")) {
      const slug = item.url.split("/").filter(Boolean)[1];
      if (slug) cutinappService.publicProduction(slug).catch(() => {});
    } else if (item.type === "artist" && item.url?.startsWith("/artist/")) {
      const slug = item.url.split("/").filter(Boolean)[1];
      if (slug) cutinappService.publicArtist(slug).catch(() => {});
    } else if ((item.type === "user" || item.type === "promoter") && Number(item.id)) {
      cutinappService.publicProfile(Number(item.id)).catch(() => {});
    }
  };

  const removeRecent = (item) => {
    const next = recent.filter((entry) => !(entry.type === item.type && String(entry.id) === String(item.id)));
    setRecent(next);
    saveJson(RECENT_KEY, next);
    if (user) cutinappService.clearGlobalSearchRecent({ type: item.type, target_id: item.id }).catch(() => {});
  };

  const clearRecent = () => {
    setRecent([]);
    saveJson(RECENT_KEY, []);
    if (user) cutinappService.clearGlobalSearchRecent().catch(() => {});
  };

  const updateFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));

  const resetFilters = () => setFilters({
    city: "", uf: "", period: "", free: false, available: false, format: "", genre: "",
    max_price: "", radius_km: "50", sort: "relevance", lat: "", lng: "",
  });

  const activeFilterCount = useMemo(() => Object.entries(filters).filter(([key, value]) => {
    if (key === "sort") return value && value !== "relevance";
    if (key === "radius_km") return value && value !== "50";
    return value !== "" && value !== false && value !== null && value !== undefined;
  }).length, [filters]);

  const selectType = (type) => {
    setActiveType(type);
    setSelectedIndex(-1);
    inputRef.current?.focus();
  };

  const applyQuickPeriod = (period) => updateFilter("period", filters.period === period ? "" : period);

  const locateMe = () => {
    if (!navigator.geolocation) {
      setError("Seu navegador não oferece localização.");
      return;
    }
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setFilters((current) => ({
          ...current,
          lat: String(position.coords.latitude),
          lng: String(position.coords.longitude),
          sort: "nearby",
        }));
        setLocationLoading(false);
      },
      () => {
        setError("Não foi possível obter sua localização. Verifique a permissão do navegador.");
        setLocationLoading(false);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 10 * 60 * 1000 }
    );
  };

  const startVoice = () => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setError("A pesquisa por voz não é suportada neste navegador.");
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "pt-BR";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    setVoiceActive(true);
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || "";
      if (transcript) setQuery(transcript);
    };
    recognition.onerror = () => setVoiceActive(false);
    recognition.onend = () => setVoiceActive(false);
    recognition.start();
  };

  const saveCurrentSearch = async () => {
    if (!user || !query.trim()) return;
    try {
      const result = await cutinappService.saveGlobalSearch({
        ...searchParamsPayload(1),
        notifications_enabled: false,
      });
      const item = result?.saved;
      if (item) setSaved((current) => [item, ...current.filter((entry) => entry.id !== item.id)]);
      trackTelemetry("global_search_saved", { query_length: query.trim().length });
    } catch (err) {
      setError(err?.response?.data?.message || "Não foi possível salvar esta pesquisa.");
    }
  };

  const loadSaved = (item) => {
    setQuery(item.query || "");
    setFilters((current) => ({ ...current, ...(item.filters || {}) }));
    inputRef.current?.focus();
  };

  const deleteSaved = async (id) => {
    setSaved((current) => current.filter((item) => item.id !== id));
    try { await cutinappService.deleteSavedGlobalSearch(id); } catch (_) { /* optimistic UI */ }
  };

  const loadMore = useCallback(async () => {
    if (activeType === "all" || !response?.has_more || moreLoading) return;
    const nextCursor = response?.next_cursor;
    if (!nextCursor) return;
    setMoreLoading(true);
    try {
      const data = await cutinappService.globalSearch({ ...searchParamsPayload(1), cursor: nextCursor });
      const groupKey = GROUPS.find(([, , type]) => type === activeType)?.[0];
      if (!groupKey) return;
      setResponse((current) => ({
        ...data,
        groups: {
          ...(data.groups || {}),
          [groupKey]: [
            ...(current.groups?.[groupKey] || []),
            ...((data.groups?.[groupKey] || []).filter((item) => !(current.groups?.[groupKey] || []).some((old) => old.type === item.type && String(old.id) === String(item.id)))),
          ],
        },
      }));
    } catch (_) {
      // Infinite scrolling is progressive; keep the current results.
    } finally {
      setMoreLoading(false);
    }
  }, [activeType, response, moreLoading, searchParamsPayload]);

  const handleInputKeyDown = (event) => {
    if (!flatResults.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((current) => Math.min(flatResults.length - 1, current + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((current) => Math.max(-1, current - 1));
    } else if (event.key === "Enter") {
      const index = selectedIndex >= 0 ? selectedIndex : 0;
      const item = flatResults[index];
      if (item) {
        event.preventDefault();
        openResult(item, index);
      }
    } else if (event.key === "Escape") {
      setSelectedIndex(-1);
    }
  };

  const useSuggestion = (value) => {
    setQuery(value);
    setSuggestions({ entities: [], terms: [], did_you_mean: null });
    inputRef.current?.focus();
  };

  const noResults = query.trim() && !loading && !error && Number(response?.counts?.total || 0) === 0;
  const currentSearchSaved = saved.some((item) => item.query?.trim().toLowerCase() === query.trim().toLowerCase());
  const showSuggestionPanel = query.trim().length >= 2 && (suggestionsLoading || suggestions.entities?.length || suggestions.terms?.length || suggestions.did_you_mean);

  return <div className="cut-app-page cut-global-search-page">
    <NavlogComponent />
    <Container className="cut-global-search">
      <header className="cut-global-search__header">
        <div className="cut-global-search__title-row">
          <div><span className="cut-eyebrow">Descobrir</span><h1>Pesquisar na Cutinapp</h1></div>
          {user && query.trim() && <Button variant="outline-light" size="sm" onClick={saveCurrentSearch} disabled={currentSearchSaved}>
            <i className={currentSearchSaved ? "fa-solid fa-bookmark" : "fa-regular fa-bookmark"} /> {currentSearchSaved ? "Salva" : "Salvar"}
          </Button>}
        </div>

        <div className="cut-global-search__input-shell">
          <label className="cut-global-search__input-wrap">
            <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
            <input
              ref={inputRef}
              autoFocus
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Pesquisar pessoas, eventos, produções, artistas, posts e itens"
              aria-label="Pesquisar na Cutinapp"
              autoComplete="off"
              spellCheck="false"
            />
            {loading && <Spinner animation="border" size="sm" />}
            {!loading && <button type="button" className={voiceActive ? "is-active" : ""} onClick={startVoice} aria-label="Pesquisar por voz"><i className="fa-solid fa-microphone" /></button>}
            {!loading && query && <button type="button" onClick={() => { setQuery(""); inputRef.current?.focus(); }} aria-label="Limpar pesquisa"><i className="fa-solid fa-circle-xmark" /></button>}
          </label>

          {showSuggestionPanel && <div className="cut-global-search__suggestions">
            {suggestionsLoading && <div className="cut-global-search__suggestion-loading"><Spinner size="sm" /> Buscando sugestões…</div>}
            {suggestions.did_you_mean && <button type="button" onClick={() => useSuggestion(suggestions.did_you_mean)}>
              <i className="fa-solid fa-wand-magic-sparkles" /><span>Você quis dizer <strong>{suggestions.did_you_mean}</strong>?</span>
            </button>}
            {(suggestions.terms || []).slice(0, 5).map((term) => <button type="button" key={term.normalized_query} onClick={() => useSuggestion(term.query)}>
              <i className="fa-solid fa-arrow-trend-up" /><span><strong>{term.query}</strong><small>{term.searches} pesquisas recentes</small></span>
            </button>)}
            {(suggestions.entities || []).slice(0, 6).map((item) => <button type="button" key={`${item.type}:${item.id}`} onClick={() => openResult(item, 0)}>
              <SearchAvatar item={item} /><span><strong>{item.title}</strong><small>{item.subtitle || typeLabel(item.type)}</small></span>
            </button>)}
          </div>}
        </div>

        <div className="cut-global-search__quick-chips">
          <button type="button" className={filters.period === "today" ? "is-active" : ""} onClick={() => applyQuickPeriod("today")}><i className="fa-regular fa-clock" /> Hoje</button>
          <button type="button" className={filters.period === "tomorrow" ? "is-active" : ""} onClick={() => applyQuickPeriod("tomorrow")}>Amanhã</button>
          <button type="button" className={filters.period === "weekend" ? "is-active" : ""} onClick={() => applyQuickPeriod("weekend")}>Fim de semana</button>
          <button type="button" className={filters.free ? "is-active" : ""} onClick={() => updateFilter("free", !filters.free)}><i className="fa-solid fa-gift" /> Gratuitos</button>
          <button type="button" className={filters.available ? "is-active" : ""} onClick={() => updateFilter("available", !filters.available)}><i className="fa-solid fa-ticket" /> Com ingresso</button>
          <button type="button" className={filters.lat ? "is-active" : ""} onClick={locateMe} disabled={locationLoading}><i className="fa-solid fa-location-crosshairs" /> {locationLoading ? "Localizando…" : "Perto de mim"}</button>
          <button type="button" className={filtersOpen ? "is-active" : ""} onClick={() => setFiltersOpen((value) => !value)}><i className="fa-solid fa-sliders" /> Filtros{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}</button>
        </div>

        <Collapse in={filtersOpen}>
          <div className="cut-global-search__filters">
            <Form.Group><Form.Label>Cidade</Form.Label><Form.Control value={filters.city} onChange={(event) => updateFilter("city", event.target.value)} placeholder="Ex.: Goiânia" /></Form.Group>
            <Form.Group><Form.Label>UF</Form.Label><Form.Control value={filters.uf} maxLength={2} onChange={(event) => updateFilter("uf", event.target.value.toUpperCase())} placeholder="GO" /></Form.Group>
            <Form.Group><Form.Label>Até</Form.Label><Form.Control type="number" min="0" step="1" value={filters.max_price} onChange={(event) => updateFilter("max_price", event.target.value)} placeholder="R$" /></Form.Group>
            <Form.Group><Form.Label>Raio</Form.Label><Form.Select value={filters.radius_km} onChange={(event) => updateFilter("radius_km", event.target.value)}><option value="5">5 km</option><option value="10">10 km</option><option value="25">25 km</option><option value="50">50 km</option><option value="100">100 km</option></Form.Select></Form.Group>
            <Form.Group><Form.Label>Formato</Form.Label><Form.Select value={filters.format} onChange={(event) => updateFilter("format", event.target.value)}><option value="">Todos</option><option value="in_person">Presencial</option><option value="online">Online</option><option value="hybrid">Híbrido</option></Form.Select></Form.Group>
            <Form.Group><Form.Label>Gênero</Form.Label><Form.Control value={filters.genre} onChange={(event) => updateFilter("genre", event.target.value)} placeholder="Ex.: sertanejo" /></Form.Group>
            <Form.Group><Form.Label>Ordenar</Form.Label><Form.Select value={filters.sort} onChange={(event) => updateFilter("sort", event.target.value)}><option value="relevance">Relevância</option><option value="nearby">Perto de mim</option><option value="popular">Mais populares</option><option value="newest">Mais novos</option><option value="soonest">Mais próximos</option></Form.Select></Form.Group>
            <button type="button" onClick={resetFilters}>Limpar filtros</button>
          </div>
        </Collapse>

        <nav className="cut-global-search__tabs" aria-label="Tipos de resultado">
          {TABS.map(([type, label]) => <button type="button" key={type} className={activeType === type ? "is-active" : ""} onClick={() => selectType(type)}>{label}</button>)}
        </nav>
      </header>

      <main className="cut-global-search__content">
        {!query.trim() && <>
          {discover?.trending_terms?.length > 0 && <section className="cut-global-search__trend-terms">
            <div className="cut-global-search__section-heading"><h2>Em alta agora</h2><small>{discover?.context?.city ? `Em ${discover.context.city}` : "Na Cutinapp"}</small></div>
            <div>{discover.trending_terms.slice(0, 12).map((term, index) => <button type="button" key={term.normalized_query} onClick={() => useSuggestion(term.query)}><span>{index + 1}</span><strong>{term.query}</strong><small>{term.searches} buscas</small></button>)}</div>
          </section>}

          <DiscoveryStrip title="Para você" items={discover?.for_you} onOpen={openResult} />
          <DiscoveryStrip title="Perto de você" items={discover?.nearby} onOpen={openResult} action={!filters.lat ? <button type="button" className="cut-link-button" onClick={locateMe}>Usar localização</button> : null} />
          <DiscoveryStrip title="Eventos em alta" items={discover?.trending_events} onOpen={openResult} />
          <DiscoveryStrip title="Novidades" items={discover?.new_events} onOpen={openResult} />
          <DiscoveryStrip title="Produções para descobrir" items={discover?.productions} onOpen={openResult} />
          <DiscoveryStrip title="Artistas para descobrir" items={discover?.artists} onOpen={openResult} />

          <section className="cut-global-search__recent">
            <div className="cut-global-search__section-heading"><h2>Recentes</h2>{recent.length > 0 && <button type="button" onClick={clearRecent}>Limpar tudo</button>}</div>
            {recent.length === 0
              ? <div className="cut-global-search__empty"><i className="fa-solid fa-magnifying-glass" /><strong>Encontre qualquer coisa na Cutinapp</strong><p>Busque nome, @usuário, evento, produção, artista, publicação, item, cidade, data ou gênero.</p></div>
              : <div className="cut-global-search__results">{recent.map((item, index) => <SearchResultRow key={`${item.type}:${item.id}`} item={item} index={index} onOpen={openResult} onPrefetch={prefetchResult} onRemove={removeRecent} />)}</div>}
          </section>

          {user && saved.length > 0 && <section className="cut-global-search__saved">
            <div className="cut-global-search__section-heading"><h2>Pesquisas salvas</h2></div>
            <div className="cut-global-search__saved-list">{saved.map((item) => <div key={item.id}><button type="button" onClick={() => loadSaved(item)}><i className="fa-regular fa-bookmark" /><span><strong>{item.label || item.query}</strong><small>{item.notifications_enabled ? "Alertas ativados" : "Pesquisa salva"}</small></span></button><button type="button" onClick={() => deleteSaved(item.id)} aria-label="Excluir pesquisa salva"><i className="fa-solid fa-xmark" /></button></div>)}</div>
          </section>}
        </>}

        {error && <div className="cut-global-search__error" role="alert"><i className="fa-solid fa-triangle-exclamation" /><span>{error}</span></div>}

        {loading && query.trim() && <SkeletonRows count={activeType === "all" ? 7 : 10} />}

        {!loading && query.trim() && response?.did_you_mean && <div className="cut-global-search__did-you-mean">Você quis dizer <button type="button" onClick={() => useSuggestion(response.did_you_mean)}>{response.did_you_mean}</button>?</div>}

        {!loading && query.trim() && (response?.sponsored || []).length > 0 && <section className="cut-global-search__section">
          <div className="cut-global-search__section-heading"><h2>Em destaque</h2><small>Conteúdo patrocinado identificado</small></div>
          <div className="cut-global-search__results">{response.sponsored.map((item, index) => <SearchResultRow key={`sponsored:${item.type}:${item.id}`} item={item} index={index} selected={flatResults[selectedIndex] === item} onOpen={openResult} onPrefetch={prefetchResult} />)}</div>
        </section>}

        {!loading && query.trim() && GROUPS.filter(([, , type]) => activeType === "all" || activeType === type).map(([groupKey, label, type]) => {
          const items = response?.groups?.[groupKey] || [];
          if (!items.length) return null;
          return <section className="cut-global-search__section" key={groupKey}>
            <div className="cut-global-search__section-heading"><h2>{label}</h2>{activeType === "all" && items.length >= 5 && <button type="button" onClick={() => selectType(type)}>Ver todos</button>}</div>
            <div className="cut-global-search__results">
              {items.map((item, index) => {
                const globalIndex = flatResults.findIndex((candidate) => candidate.type === item.type && String(candidate.id) === String(item.id));
                return <SearchResultRow key={`${item.type}:${item.id}`} item={item} index={globalIndex >= 0 ? globalIndex : index} selected={globalIndex === selectedIndex} onOpen={openResult} onPrefetch={prefetchResult} />;
              })}
            </div>
          </section>;
        })}

        {moreLoading && <SkeletonRows count={4} />}
        {activeType !== "all" && response?.has_more && <div ref={loadMoreRef} className="cut-global-search__load-more" aria-hidden="true" />}

        {noResults && <div className="cut-global-search__empty">
          <i className="fa-regular fa-face-meh" />
          <strong>Nenhum resultado para “{query.trim()}”</strong>
          <p>Tente outro nome, @usuário, cidade, gênero, data ou remova alguns filtros.</p>
          <div>{suggestions.did_you_mean && <button type="button" onClick={() => useSuggestion(suggestions.did_you_mean)}>Pesquisar “{suggestions.did_you_mean}”</button>}<button type="button" onClick={resetFilters}>Limpar filtros</button></div>
        </div>}
      </main>
    </Container>
  </div>;
}
