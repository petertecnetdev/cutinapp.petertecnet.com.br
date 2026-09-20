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
import "./HomeHubPage.css";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const mediaUrl = (value) => {
  if (!value) return "";
  const image = String(value);
  if (/^https?:\/\//i.test(image)) return image;
  return `${storageUrl}${image.replace(/^\/?storage\//, "").replace(/^\/+/, "")}`;
};

const initials = (value) => String(value || "C")
  .trim()
  .split(/\s+/)
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

function DiscoveryRail({ eyebrow, title, description, to, toLabel, children, empty }) {
  const railRef = useRef(null);
  const count = React.Children.count(children);

  const scroll = (direction) => {
    const node = railRef.current;
    if (!node) return;
    node.scrollBy({
      left: direction * Math.max(280, Math.round(node.clientWidth * 0.82)),
      behavior: "smooth",
    });
  };

  return (
    <section className="cut-home-hub__section">
      <div className="cut-home-hub__sectionHead">
        <div>
          <span>{eyebrow}</span>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        <div className="cut-home-hub__sectionActions">
          {count > 1 && (
            <div className="cut-home-hub__railControls" aria-label={`Navegar em ${title}`}>
              <button type="button" onClick={() => scroll(-1)} aria-label="Ver anteriores"><i className="fa-solid fa-chevron-left" /></button>
              <button type="button" onClick={() => scroll(1)} aria-label="Ver próximos"><i className="fa-solid fa-chevron-right" /></button>
            </div>
          )}
          {to && <Link to={to}>{toLabel || "Ver todos"} <i className="fa-solid fa-arrow-right" /></Link>}
        </div>
      </div>

      {count ? <div className="cut-home-hub__rail" ref={railRef}>{children}</div> : empty}
    </section>
  );
}

DiscoveryRail.propTypes = {
  eyebrow: PropTypes.node.isRequired,
  title: PropTypes.string.isRequired,
  description: PropTypes.node,
  to: PropTypes.string,
  toLabel: PropTypes.string,
  children: PropTypes.node,
  empty: PropTypes.node,
};

function LoadingRail() {
  return (
    <div className="cut-home-hub__rail" aria-label="Carregando">
      {[0, 1, 2, 3].map((item) => <div key={item} className="cut-home-hub__skeleton" />)}
    </div>
  );
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

      const eventList = eventResult.status === "fulfilled"
        ? (eventResult.value?.events?.data || [])
        : [];
      const productionList = productionResult.status === "fulfilled"
        ? (productionResult.value?.productions?.data || productionResult.value?.productions || [])
        : [];

      const eventProductions = eventList.map((event) => event?.production).filter(Boolean);
      const mergedProductions = uniqueBy(
        [...eventProductions, ...(Array.isArray(productionList) ? productionList : [])],
        (production) => String(production?.id || production?.slug || "")
      ).slice(0, 12);

      setEvents(eventList.slice(0, 12));
      setProductions(mergedProductions);
      setLoading(false);

      const catalogEvents = eventList.filter((event) => event?.slug).slice(0, 12);
      if (!catalogEvents.length) {
        setItems([]);
        setItemsLoading(false);
        return;
      }

      let discoveredItems = [];
      const catalogBatchSize = 4;

      for (let offset = 0; offset < catalogEvents.length && discoveredItems.length < 12; offset += catalogBatchSize) {
        const batchEvents = catalogEvents.slice(offset, offset + catalogBatchSize);
        const catalogResults = await Promise.allSettled(
          batchEvents.map((event) => commerceService.catalog(event.slug))
        );

        if (!active) return;

        const batchItems = catalogResults.flatMap((result, index) => {
          if (result.status !== "fulfilled") return [];

          const sourceEvent = batchEvents[index];
          const catalog = result.value || {};
          const catalogEvent = { ...sourceEvent, ...(catalog.event || {}) };
          const production = sourceEvent?.production || catalogEvent?.production || null;

          return (Array.isArray(catalog.items) ? catalog.items : [])
            .filter((item) => item?.available !== false && item?.is_active !== false)
            .map((item) => ({
              ...item,
              __event: catalogEvent,
              __production: production,
            }));
        });

        discoveredItems = uniqueBy(
          [...discoveredItems, ...batchItems],
          (item) => `${item?.__event?.id || item?.__event?.slug || "event"}:${item?.id || item?.name || ""}`
        ).slice(0, 12);
      }

      if (!active) return;
      setItems(discoveredItems);
      setItemsLoading(false);
    };

    load().catch(() => {
      if (!active) return;
      setEvents([]);
      setProductions([]);
      setItems([]);
      setLoading(false);
      setItemsLoading(false);
    });

    return () => { active = false; };
  }, []);

  const productionCountLabel = useMemo(
    () => productions.length === 1 ? "1 produção em destaque" : `${productions.length} produções em destaque`,
    [productions.length]
  );

  const empty = (icon, title, text) => (
    <div className="cut-home-hub__empty">
      <i className={icon} />
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );

  return (
    <div className="cut-app-page cut-home-hub">
      <NavlogComponent />

      <Container className="cut-page-container cut-home-hub__container">
        <header className="cut-home-hub__hero">
          <div>
            <span className="cut-home-hub__eyebrow"><i className="fa-solid fa-bolt" /> Sua Cutinapp</span>
            <h1>Descubra o que está acontecendo.</h1>
            <p>Eventos, produções e itens disponíveis reunidos em uma home rápida para você encontrar o que procura sem abrir várias telas.</p>
          </div>
          <Link to="/search" className="cut-home-hub__search">
            <i className="fa-solid fa-magnifying-glass" />
            <span><small>Busca rápida</small><strong>Pesquisar na Cutinapp</strong></span>
            <i className="fa-solid fa-arrow-right" />
          </Link>
        </header>

        {loading ? <LoadingRail /> : (
          <EventDiscoveryRail
            events={events}
            eyebrow="Próximos eventos"
            title="Eventos para descobrir"
            description="Os próximos eventos publicados, em uma navegação horizontal simples e rápida."
            allTo="/event"
            allLabel="Todos os eventos"
            emptyTitle="Nenhum evento por aqui ainda"
            emptyText="Quando novos eventos forem publicados, eles aparecerão nesta faixa."
          />
        )}

        {loading ? <LoadingRail /> : (
          <DiscoveryRail
            eyebrow={productionCountLabel}
            title="Produções para acompanhar"
            description="Conheça quem organiza experiências e entre direto na página da produção."
            to="/productions"
            toLabel="Todas as produções"
            empty={empty("fa-solid fa-users-gear", "Nenhuma produção disponível", "As produções públicas vão aparecer aqui assim que forem publicadas.")}
          >
            {productions.map((production) => {
              const cover = mediaUrl(production.background || production.cover || production.banner);
              const logo = mediaUrl(production.logo || production.photo || production.image);
              return (
                <Link to={`/production/${production.slug}/public`} className="cut-home-hub__productionCard" key={production.id || production.slug}>
                  <div className="cut-home-hub__productionCover">
                    {cover ? <img src={cover} alt="" loading="lazy" decoding="async" /> : <span />}
                  </div>
                  <div className="cut-home-hub__productionBody">
                    <div className="cut-home-hub__productionAvatar">
                      {logo ? <img src={logo} alt={production.name || "Produção"} loading="lazy" decoding="async" /> : initials(production.name)}
                    </div>
                    <div>
                      <h3>{production.name || "Produção Cutinapp"}</h3>
                      <p>{production.city ? `${production.city}${production.uf ? ` - ${production.uf}` : ""}` : "Produção Cutinapp"}</p>
                      <small>{Number(production.upcoming_events_count || 0)} próximo(s) evento(s)</small>
                    </div>
                  </div>
                </Link>
              );
            })}
          </DiscoveryRail>
        )}

        {itemsLoading ? <LoadingRail /> : (
          <DiscoveryRail
            eyebrow="Itens das produções"
            title="Alguns itens disponíveis"
            description="Produtos e adicionais liberados pelas produções nos próximos eventos."
            empty={empty("fa-solid fa-bag-shopping", "Nenhum item disponível agora", "Quando as produções liberarem itens nos eventos, alguns deles aparecerão nesta faixa.")}
          >
            {items.map((item) => {
              const event = item.__event || {};
              const production = item.__production || {};
              const image = mediaUrl(item.image || item.image_url || item.photo || item.cover);
              return (
                <Link to={event.slug ? `/event/${event.slug}/catalogo` : "/event"} className="cut-home-hub__itemCard" key={`${event.id || event.slug}-${item.id}`}>
                  <div className="cut-home-hub__itemMedia">
                    {image ? <img src={image} alt={item.name || "Item"} loading="lazy" decoding="async" /> : <i className="fa-solid fa-bag-shopping" />}
                    <strong>{money.format(Number(item.price || 0))}</strong>
                  </div>
                  <div className="cut-home-hub__itemBody">
                    <h3>{item.name || "Item da produção"}</h3>
                    {production.name && <p>{production.name}</p>}
                    <small>{event.title || "Disponível em evento Cutinapp"}</small>
                  </div>
                </Link>
              );
            })}
          </DiscoveryRail>
        )}
      </Container>
    </div>
  );
}
