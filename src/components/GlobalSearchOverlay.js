import React, { useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import cutinappService from "../services/CutinappService";

const EVENT_NAME = "cutinapp:open-global-search";

const initials = (value) => String(value || "C").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

export const openGlobalSearchOverlay = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENT_NAME));
};

export default function GlobalSearchOverlay() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [data, setData] = useState({ entities: [], terms: [], did_you_mean: null });
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    const openOverlay = () => setOpen(true);
    const onKey = (event) => {
      const target = event.target;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
        return;
      }
      if (!typing && event.key === "/") {
        event.preventDefault();
        setOpen(true);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener(EVENT_NAME, openOverlay);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(EVENT_NAME, openOverlay);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  useEffect(() => {
    const term = query.trim();
    if (!open || term.length < 2) {
      abortRef.current?.abort();
      setData({ entities: [], terms: [], did_you_mean: null });
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const result = await cutinappService.globalSearchSuggestions({ q: term, limit: 8 }, controller.signal);
        if (!controller.signal.aborted) setData(result || { entities: [], terms: [], did_you_mean: null });
      } catch (_) {
        if (!controller.signal.aborted) setData({ entities: [], terms: [], did_you_mean: null });
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 100);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);

  if (!open || typeof document === "undefined") return null;

  const go = (url) => {
    setOpen(false);
    setQuery("");
    navigate(url);
  };

  const goFull = () => {
    const value = query.trim();
    setOpen(false);
    navigate(value ? `/search?q=${encodeURIComponent(value)}` : "/search");
  };

  return createPortal(
    <div className="cut-search-overlay" role="dialog" aria-modal="true" aria-label="Pesquisa global">
      <button type="button" className="cut-search-overlay__backdrop" onClick={() => setOpen(false)} aria-label="Fechar pesquisa" />
      <section className="cut-search-overlay__panel">
        <header>
          <i className="fa-solid fa-magnifying-glass" />
          <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && goFull()} placeholder="Pesquisar na Cutinapp" aria-label="Pesquisar na Cutinapp" />
          {loading && <i className="fa-solid fa-circle-notch fa-spin" />}
          <button type="button" onClick={() => setOpen(false)} aria-label="Fechar"><i className="fa-solid fa-xmark" /></button>
        </header>
        <div className="cut-search-overlay__body">
          {!query.trim() && <div className="cut-search-overlay__hint">
            <i className="fa-solid fa-wand-magic-sparkles" />
            <strong>Encontre qualquer coisa</strong>
            <span>Pessoas, eventos, produções, artistas, publicações e itens.</span>
            <small><kbd>Ctrl</kbd> + <kbd>K</kbd> ou <kbd>/</kbd> abre esta busca.</small>
          </div>}

          {data.did_you_mean && <button type="button" className="cut-search-overlay__correction" onClick={() => setQuery(data.did_you_mean)}>Você quis dizer <strong>{data.did_you_mean}</strong>?</button>}

          {(data.terms || []).slice(0, 4).map((term) => <button type="button" className="cut-search-overlay__term" key={term.normalized_query} onClick={() => setQuery(term.query)}>
            <i className="fa-solid fa-arrow-trend-up" /><span><strong>{term.query}</strong><small>{term.searches} buscas</small></span>
          </button>)}

          {(data.entities || []).map((item) => <button type="button" className="cut-search-overlay__entity" key={`${item.type}:${item.id}`} onClick={() => go(item.url)}>
            <span className="cut-search-overlay__avatar">{item.image ? <img src={item.image} alt="" /> : initials(item.title)}</span>
            <span><strong>{item.title}</strong><small>{item.subtitle || item.type}</small></span>
            <i className="fa-solid fa-arrow-right" />
          </button>)}
        </div>
        <footer><button type="button" onClick={goFull}><span>Ver busca completa</span><i className="fa-solid fa-arrow-right" /></button>{user && <small>Seu histórico e suas preferências entram no ranking.</small>}</footer>
      </section>
    </div>,
    document.body
  );
}
