import React, { useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { Container } from "react-bootstrap";
import { Link } from "react-router-dom";
import NavlogComponent from "../components/NavlogComponent";
import EventDiscoveryRail from "../components/event/EventDiscoveryRail";
import eventService from "../services/EventService";
import cutinappService from "../services/CutinappService";
import commerceService from "../services/CommerceService";
import { storageUrl } from "../config";
import { chronologicalBucketFor, parsePortableEventDate } from "../utils/chronologicalDiscovery";
import "./HomeHubPage.css";

const formatMoney = (value, currency) => {
  const amount = Number(value || 0);
  const locale = typeof navigator !== "undefined" && navigator.language ? navigator.language : undefined;
  const normalizedCurrency = typeof currency === "string" ? currency.trim().toUpperCase() : "";
  if (/^[A-Z]{3}$/.test(normalizedCurrency)) {
    try {
      return new Intl.NumberFormat(locale, { style: "currency", currency: normalizedCurrency }).format(amount);
    } catch (_) {
      // Invalid/unsupported currency metadata must not silently become a country-specific fallback.
    }
  }
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(amount);
};

const mediaUrl = (value) => {
  if (!value) return "";
  const image = String(value);
  if (/^https?:\/\//i.test(image)) return image;
  return `${storageUrl}${image.replace(/^\/?storage\//, "").replace(/^\/+/, "")}`;
};

const initials = (value) => String(value || "C")
  .trim()
  .split(/\s+/)
  .filter((part) => /^[A-Za-zÀ-ÖØ-öø-ÿ0-9]/.test(part))
  .filter((part) => !["de", "da", "do", "das", "dos", "e"].includes(part.toLowerCase()))
  .slice(0, 2)
  .map((part) => part[0])
  .join("")
  .toUpperCase();

const uniqueBy = (items, keyFor) => {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFor(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const eventStartValue = (event) => event?.starts_at || event?.start_at || event?.start_date || event?.date || event?.scheduled_at || null;
const eventDay = (event) => {
  const date = parsePortableEventDate(eventStartValue(event));
  if (!date) return null;
  date.setHours(0, 0, 0, 0);
  return date;
};
const todayStart = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};
const isTodayEvent = (event) => {
  const date = parsePortableEventDate(eventStartValue(event));
  return date ? chronologicalBucketFor(date).key === "today" : false;
};
const isUpcomingEvent = (event) => {
  const date = eventDay(event);
  return date ? date.getTime() > todayStart().getTime() : false;
};

function DiscoveryRail({ eyebrow, title, description, to, toLabel, children, empty, railClassName }) {
  const railRef = useRef(null);
  const count = React.Children.count(children);

  const scroll = (direction) => {
    const node = railRef.current;
    if (!node) return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    node.scrollBy({ left: direction * Math.max(280, Math.round(node.clientWidth * 0.82)), behavior: reduceMotion ? "auto" : "smooth" });
  };
  const onRailKeyDown = (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    scroll(event.key === "ArrowLeft" ? -1 : 1);
  };

  return (
    <section className="cut-home-hub__section">
      <div className="cut-home-hub__sectionHead">
        <div><span>{eyebrow}</span><h2>{title}</h2>{description && <p>{description}</p>}</div>
        <div className="cut-home-hub__sectionActions">
          {count > 1 && <div className="cut-home-hub__railControls" aria-label={`Navegar em ${title}`}><button type="button" onClick={() => scroll(-1)} aria-label="Ver anteriores"><i className="fa-solid fa-chevron-left" /></button><button type="button" onClick={() => scroll(1)} aria-label="Ver próximos"><i className="fa-solid fa-chevron-right" /></button></div>}
          {to && <Link to={to}>{toLabel || "Ver todos"} <i className="fa-solid fa-arrow-right" /></Link>}
        </div>
      </div>
      {count ? <div className={["cut-home-hub__rail", railClassName].filter(Boolean).join(" ")} ref={railRef} tabIndex={0} onKeyDown={onRailKeyDown} aria-label={`${title}. Use as setas esquerda e direita para navegar.`}>{children}</div> : empty}
    </section>
  );
}

DiscoveryRail.propTypes = { eyebrow: PropTypes.node.isRequired, title: PropTypes.string.isRequired, description: PropTypes.node, to: PropTypes.string, toLabel: PropTypes.string, children: PropTypes.node, empty: PropTypes.node, railClassName: PropTypes.string };

function LoadingRail() {
  return <div className="cut-home-hub__rail" aria-label="Carregando">{[0, 1, 2, 3].map((item) => <div key={item} className="cut-home-hub__skeleton" />)}</div>;
}

export default function HomeHubPage() {
  const [events, setEvents] = useState([]);
  const [productions, setProductions] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [itemsLoading, setItemsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setItemsLoading(true);
      const [eventResult, productionResult] = await Promise.allSettled([
        eventService.search({ per_page: 12, sort: "soonest" }),
        cutinappService.publicProductions({ per_page: 12 }),
      ]);
      if (!active) return;
      const eventList = eventResult.status === "fulfilled" ? (eventResult.value?.events?.data || []) : [];
      const productionList = productionResult.status === "fulfilled" ? (productionResult.value?.productions?.data || productionResult.value?.productions || []) : [];
      const eventProductions = eventList.map((event) => event?.production).filter(Boolean);
      const mergedProductions = uniqueBy([...eventProductions, ...(Array.isArray(productionList) ? productionList : [])], (production) => String(production?.id || production?.slug || "")).slice(0, 12);
      setEvents(eventList.slice(0, 12));
      setProductions(mergedProductions);
      setLoading(false);

      const catalogEvents = eventList.filter((event) => event?.slug && (isTodayEvent(event) || isUpcomingEvent(event))).slice(0, 12);
      if (!catalogEvents.length) { setItems([]); setItemsLoading(false); return; }
      let discoveredItems = [];
      const catalogBatchSize = 4;
      for (let offset = 0; offset < catalogEvents.length && discoveredItems.length < 12; offset += catalogBatchSize) {
        const batchEvents = catalogEvents.slice(offset, offset + catalogBatchSize);
        const catalogResults = await Promise.allSettled(batchEvents.map((event) => commerceService.catalog(event.slug)));
        if (!active) return;
        const batchItems = catalogResults.flatMap((result, index) => {
          if (result.status !== "fulfilled") return [];
          const sourceEvent = batchEvents[index];
          const catalog = result.value || {};
          const catalogEvent = { ...sourceEvent, ...(catalog.event || {}) };
          const production = sourceEvent?.production || catalogEvent?.production || null;
          return (Array.isArray(catalog.items) ? catalog.items : []).filter((item) => item?.available !== false && item?.is_active !== false).map((item) => ({ ...item, __event: catalogEvent, __production: production }));
        });
        discoveredItems = uniqueBy([...discoveredItems, ...batchItems], (item) => `${item?.__event?.id || item?.__event?.slug || "event"}:${item?.id || item?.name || ""}`).slice(0, 12);
      }
      if (!active) return;
      setItems(discoveredItems);
      setItemsLoading(false);
    };
    load().catch(() => { if (!active) return; setEvents([]); setProductions([]); setItems([]); setLoading(false); setItemsLoading(false); });
    return () => { active = false; };
  }, []);

  const todayEvents = useMemo(() => events.filter(isTodayEvent), [events]);
  const upcomingEvents = useMemo(() => events.filter(isUpcomingEvent), [events]);
  const productionCountLabel = useMemo(() => productions.length === 1 ? "1 produção em destaque" : `${productions.length} produções em destaque`, [productions.length]);
  const empty = (icon, title, text) => <div className="cut-home-hub__empty"><i className={icon} /><strong>{title}</strong><p>{text}</p></div>;

  return (
    <div className="cut-app-page cut-home-hub">
      <NavlogComponent />
      <Container className="cut-page-container cut-home-hub__container">
        <header className="cut-home-hub__hero">
          <div><span className="cut-home-hub__eyebrow"><i className="fa-solid fa-bolt" /> Sua Cutinapp</span><h1>Descubra o que está acontecendo.</h1><p>Eventos, produções e itens disponíveis reunidos em uma home rápida para você encontrar o que procura sem abrir várias telas.</p></div>
          <Link to="/search" className="cut-home-hub__search"><i className="fa-solid fa-magnifying-glass" /><span><small>Busca rápida</small><strong>Pesquisar na Cutinapp</strong></span><i className="fa-solid fa-arrow-right" /></Link>
        </header>

        {loading ? <LoadingRail /> : todayEvents.length > 0 && (
          <EventDiscoveryRail events={todayEvents} eyebrow="Hoje" title="Acontecendo hoje" description="Eventos de hoje primeiro, para decidir rápido o que fazer agora." allTo="/event" allLabel="Ver agenda" emptyTitle="Nada para hoje" emptyText="Os próximos eventos aparecem logo abaixo." className="cut-home-hub__eventsRail" />
        )}

        {loading ? <LoadingRail /> : (
          <EventDiscoveryRail events={upcomingEvents} eyebrow="Próximos eventos" title="Próximos para descobrir" description="Depois de hoje, veja o que vem pela frente em ordem cronológica." allTo="/event" allLabel="Todos os eventos" emptyTitle="Nenhum próximo evento por aqui ainda" emptyText="Quando novos eventos forem publicados, eles aparecerão nesta faixa." className="cut-home-hub__eventsRail" />
        )}

        {loading ? <LoadingRail /> : (
          <DiscoveryRail eyebrow={productionCountLabel} title="Produções para acompanhar" description="Conheça quem organiza experiências e entre direto na página da produção." to="/productions" toLabel="Todas as produções" empty={empty("fa-solid fa-users-gear", "Nenhuma produção disponível", "As produções públicas vão aparecer aqui assim que forem publicadas.")} railClassName="cut-home-hub__rail--productions">
            {productions.map((production) => {
              const cover = mediaUrl(production.background || production.cover || production.banner);
              const logo = mediaUrl(production.logo || production.photo || production.image);
              return <Link to={`/production/${production.slug}/public`} className="cut-home-hub__productionCard" key={production.id || production.slug}><div className="cut-home-hub__productionCover">{cover ? <img src={cover} alt="" loading="lazy" decoding="async" /> : <span />}</div><div className="cut-home-hub__productionBody"><div className="cut-home-hub__productionAvatar">{logo ? <img src={logo} alt={production.name || "Produção"} loading="lazy" decoding="async" /> : initials(production.name)}</div><div><h3>{production.name || "Produção Cutinapp"}</h3><p>{production.city ? `${production.city}${production.uf ? ` - ${production.uf}` : ""}` : "Produção Cutinapp"}</p><small>{Number(production.upcoming_events_count || 0)} próximo(s) evento(s)</small></div></div></Link>;
            })}
          </DiscoveryRail>
        )}

        {itemsLoading ? <LoadingRail /> : (
          <DiscoveryRail eyebrow="Itens das produções" title="Alguns itens disponíveis" description="Produtos e adicionais liberados pelas produções nos próximos eventos." empty={empty("fa-solid fa-bag-shopping", "Nenhum item disponível agora", "Quando as produções liberarem itens nos eventos, alguns deles aparecerão nesta faixa.")} railClassName="cut-home-hub__rail--items">
            {items.map((item) => {
              const event = item.__event || {};
              const production = item.__production || {};
              const image = mediaUrl(item.image || item.image_url || item.photo || item.cover);
              const currency = item.currency || item.currency_code || event.currency || event.currency_code || production.currency || production.currency_code;
              return <Link to={event.slug ? `/event/${event.slug}/catalogo` : "/event"} className="cut-home-hub__itemCard" key={`${event.id || event.slug}-${item.id}`}><div className="cut-home-hub__itemMedia">{image ? <img src={image} alt={item.name || "Item"} loading="lazy" decoding="async" /> : <span className="cut-home-hub__itemInitials" aria-hidden="true">{initials(item.name || "Item")}</span>}<strong>{formatMoney(item.price, currency)}</strong></div><div className="cut-home-hub__itemBody"><h3>{item.name || "Item da produção"}</h3>{production.name && <p>{production.name}</p>}<small>{event.title || "Disponível em evento Cutinapp"}</small></div></Link>;
            })}
          </DiscoveryRail>
        )}
      </Container>
    </div>
  );
}
