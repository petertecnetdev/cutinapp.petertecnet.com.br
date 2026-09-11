import React, { useEffect, useMemo, useRef, useState } from "react";
import { Container, Spinner } from "react-bootstrap";
import { useNavigate, useSearchParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import cutinappService from "../../services/CutinappService";
import { storageUrl } from "../../config";
import { trackTelemetry } from "../../utils/telemetry";
import "./GlobalSearchPage.css";

const RECENT_KEY = "cutinapp:global-search:recent:v1";
const TABS = [
  ["all", "Tudo"],
  ["user", "Pessoas"],
  ["event", "Eventos"],
  ["production", "Produções"],
  ["artist", "Artistas"],
];

const GROUPS = [
  ["people", "Pessoas", "user"],
  ["events", "Eventos", "event"],
  ["productions", "Produções", "production"],
  ["artists", "Artistas", "artist"],
];

const typeLabel = (type) => ({
  user: "Pessoa",
  event: "Evento",
  production: "Produção",
  artist: "Artista",
}[type] || "Resultado");

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

const readRecent = () => {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.slice(0, 12) : [];
  } catch (_) {
    return [];
  }
};

const saveRecent = (items) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(items.slice(0, 12)));
  } catch (_) {
    // Recent searches are a progressive enhancement.
  }
};

function ResultAvatar({ item }) {
  const [failed, setFailed] = useState(false);
  const src = !failed ? imageUrl(item.image) : "";

  return <span className={`cut-global-search__avatar cut-global-search__avatar--${item.type}`}>
    {src
      ? <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
      : <span>{initials(item.title)}</span>}
  </span>;
}

function ResultRow({ item, onOpen, trailing = null }) {
  return <button type="button" className="cut-global-search__result" onClick={() => onOpen(item)}>
    <ResultAvatar item={item} />
    <span className="cut-global-search__result-copy">
      <strong>{item.title}</strong>
      <small>{item.subtitle || typeLabel(item.type)}</small>
      <em>{typeLabel(item.type)}</em>
    </span>
    {trailing || <i className="fa-solid fa-chevron-right" aria-hidden="true" />}
  </button>;
}

export default function GlobalSearchPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const initialQuery = params.get("q") || "";
  const initialType = TABS.some(([value]) => value === params.get("type")) ? params.get("type") : "all";
  const [query, setQuery] = useState(initialQuery);
  const [activeType, setActiveType] = useState(initialType);
  const [response, setResponse] = useState({ groups: {}, counts: {}, results: [] });
  const [recent, setRecent] = useState(readRecent);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestRef = useRef(0);
  const inputRef = useRef(null);

  useEffect(() => {
    const next = new URLSearchParams(params);
    const normalized = query.trim();
    normalized ? next.set("q", normalized) : next.delete("q");
    activeType !== "all" ? next.set("type", activeType) : next.delete("type");
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
  }, [query, activeType, params, setParams]);

  useEffect(() => {
    const term = query.trim();
    if (!term) {
      requestRef.current += 1;
      setLoading(false);
      setError("");
      setResponse({ groups: {}, counts: {}, results: [] });
      return undefined;
    }

    const requestId = ++requestRef.current;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const data = await cutinappService.globalSearch({
          q: term,
          type: activeType,
          per_type: activeType === "all" ? 8 : 20,
        });
        if (requestId !== requestRef.current) return;
        setResponse(data || { groups: {}, counts: {}, results: [] });
        trackTelemetry("global_search_performed", {
          query_length: term.length,
          type: activeType,
          result_count: Number(data?.counts?.total || 0),
        });
      } catch (err) {
        if (requestId !== requestRef.current) return;
        setError(err?.response?.data?.message || err?.message || "Não foi possível pesquisar agora.");
      } finally {
        if (requestId === requestRef.current) setLoading(false);
      }
    }, 240);

    return () => window.clearTimeout(timer);
  }, [query, activeType]);

  const visibleGroups = useMemo(() => {
    if (activeType === "all") return GROUPS;
    return GROUPS.filter(([, , type]) => type === activeType);
  }, [activeType]);

  const remember = (item) => {
    const normalized = {
      type: item.type,
      id: item.id,
      title: item.title,
      subtitle: item.subtitle || "",
      image: item.image || "",
      url: item.url,
    };
    const next = [normalized, ...recent.filter((entry) => !(entry.type === normalized.type && String(entry.id) === String(normalized.id)))].slice(0, 12);
    setRecent(next);
    saveRecent(next);
  };

  const openResult = (item) => {
    remember(item);
    trackTelemetry("global_search_result_selected", {
      type: item.type,
      target_id: item.id,
      query_length: query.trim().length,
    });
    navigate(item.url);
  };

  const removeRecent = (item) => {
    const next = recent.filter((entry) => !(entry.type === item.type && String(entry.id) === String(item.id)));
    setRecent(next);
    saveRecent(next);
  };

  const clearRecent = () => {
    setRecent([]);
    saveRecent([]);
  };

  const selectType = (type) => {
    setActiveType(type);
    inputRef.current?.focus();
  };

  const noResults = query.trim() && !loading && !error && Number(response?.counts?.total || 0) === 0;

  return <div className="cut-app-page cut-global-search-page">
    <NavlogComponent />
    <Container className="cut-global-search">
      <header className="cut-global-search__header">
        <div className="cut-global-search__title-row">
          <div>
            <span className="cut-eyebrow">Descobrir</span>
            <h1>Pesquisar na Cutinapp</h1>
          </div>
        </div>

        <label className="cut-global-search__input-wrap">
          <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
          <input
            ref={inputRef}
            autoFocus
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Pesquisar pessoas, eventos, produções e artistas"
            aria-label="Pesquisar na Cutinapp"
            autoComplete="off"
            spellCheck="false"
          />
          {loading && <Spinner animation="border" size="sm" />}
          {!loading && query && <button type="button" onClick={() => { setQuery(""); inputRef.current?.focus(); }} aria-label="Limpar pesquisa"><i className="fa-solid fa-circle-xmark" /></button>}
        </label>

        <nav className="cut-global-search__tabs" aria-label="Tipos de resultado">
          {TABS.map(([type, label]) => <button
            type="button"
            key={type}
            className={activeType === type ? "is-active" : ""}
            onClick={() => selectType(type)}
          >{label}</button>)}
        </nav>
      </header>

      <main className="cut-global-search__content">
        {!query.trim() && <section className="cut-global-search__recent">
          <div className="cut-global-search__section-heading">
            <h2>Recentes</h2>
            {recent.length > 0 && <button type="button" onClick={clearRecent}>Limpar tudo</button>}
          </div>
          {recent.length === 0
            ? <div className="cut-global-search__empty">
                <i className="fa-solid fa-magnifying-glass" />
                <strong>Encontre qualquer coisa na Cutinapp</strong>
                <p>Busque pelo nome de uma pessoa, evento, produção ou artista.</p>
              </div>
            : <div className="cut-global-search__results">
                {recent.map((item) => <ResultRow
                  key={`${item.type}:${item.id}`}
                  item={item}
                  onOpen={openResult}
                  trailing={<span className="cut-global-search__recent-actions"><button type="button" onClick={(event) => { event.stopPropagation(); removeRecent(item); }} aria-label={`Remover ${item.title} dos recentes`}><i className="fa-solid fa-xmark" /></button></span>}
                />)}
              </div>}
        </section>}

        {error && <div className="cut-global-search__error" role="alert"><i className="fa-solid fa-triangle-exclamation" /><span>{error}</span></div>}

        {query.trim() && visibleGroups.map(([groupKey, label, type]) => {
          const items = response?.groups?.[groupKey] || [];
          if (!items.length) return null;
          return <section className="cut-global-search__section" key={groupKey}>
            <div className="cut-global-search__section-heading">
              <h2>{label}</h2>
              {activeType === "all" && items.length >= 8 && <button type="button" onClick={() => selectType(type)}>Ver todos</button>}
            </div>
            <div className="cut-global-search__results">
              {items.map((item) => <ResultRow key={`${item.type}:${item.id}`} item={item} onOpen={openResult} />)}
            </div>
          </section>;
        })}

        {noResults && <div className="cut-global-search__empty">
          <i className="fa-regular fa-face-meh" />
          <strong>Nenhum resultado para “{query.trim()}”</strong>
          <p>Tente pesquisar por outro nome, @usuário, cidade, local ou categoria.</p>
        </div>}
      </main>
    </Container>
  </div>;
}
