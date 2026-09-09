import React, { useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { Link } from "react-router-dom";
import blogService from "../../services/BlogService";
import cutinappService from "../../services/CutinappService";
import eventService from "../../services/EventService";
import { storageUrl } from "../../config";
import { getImageFallbackInitials } from "../../utils/imageFallback";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const eventDate = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

let discoveryCache = null;
let discoveryPromise = null;

const mediaUrl = (value) => {
  if (!value) return "";
  const raw = String(value).trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw) || raw.startsWith("data:") || raw.startsWith("blob:")) return raw;
  return `${storageUrl}${raw.replace(/^\/?storage\//, "").replace(/^\//, "")}`;
};

const firstFileUrl = (item) => {
  const file = Array.isArray(item?.files) ? item.files.find(Boolean) : null;
  return file?.public_url || file?.url || file?.path || file?.file_path || file?.storage_path || file?.name || "";
};

const itemImage = (item) => mediaUrl(
  item?.image || item?.cover_image || item?.photo || item?.thumbnail || firstFileUrl(item)
);

const initials = (value) => getImageFallbackInitials(value);

const extractBlogs = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

const extractProductions = (payload) => {
  const source = payload?.productions;
  if (Array.isArray(source)) return source;
  if (Array.isArray(source?.data)) return source.data;
  return [];
};

async function loadDiscovery() {
  if (discoveryCache) return discoveryCache;
  if (discoveryPromise) return discoveryPromise;

  discoveryPromise = (async () => {
    const [eventResult, productionResult] = await Promise.allSettled([
      eventService.list({ per_page: 12, sort: "soonest" }),
      cutinappService.publicProductions({ per_page: 8 }),
    ]);

    const events = eventResult.status === "fulfilled"
      ? (Array.isArray(eventResult.value) ? eventResult.value : []).slice(0, 12)
      : [];

    const productions = productionResult.status === "fulfilled"
      ? extractProductions(productionResult.value)
      : [];

    const itemSources = productions
      .filter((production) => Number(production?.items_count ?? 1) > 0)
      .slice(0, 6);

    const itemResponses = await Promise.allSettled(
      itemSources.map(async (production) => ({
        production,
        items: await cutinappService.productionItems(production.id),
      }))
    );

    const items = [];
    itemResponses.forEach((result) => {
      if (result.status !== "fulfilled") return;
      const { production, items: productionItems } = result.value;
      (Array.isArray(productionItems) ? productionItems : []).slice(0, 4).forEach((item) => {
        items.push({ ...item, production });
      });
    });

    discoveryCache = { events, items: items.slice(0, 16) };
    return discoveryCache;
  })().finally(() => { discoveryPromise = null; });

  return discoveryPromise;
}

function Carousel({ eyebrow, title, action, children, className = "" }) {
  const trackRef = useRef(null);

  const move = (direction) => {
    const track = trackRef.current;
    if (!track) return;
    const amount = Math.max(280, Math.min(track.clientWidth * 0.84, 900));
    track.scrollBy({ left: direction * amount, behavior: "smooth" });
  };

  return <section className={`cut-blog-carousel-section ${className}`}>
    <div className="cut-blog-carousel-heading">
      <div>
        <span className="cut-eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      <div className="cut-blog-carousel-actions">
        {action}
        <button type="button" onClick={() => move(-1)} aria-label={`Voltar no carrossel ${title}`}><i className="fa-solid fa-chevron-left" /></button>
        <button type="button" onClick={() => move(1)} aria-label={`Avançar no carrossel ${title}`}><i className="fa-solid fa-chevron-right" /></button>
      </div>
    </div>
    <div className="cut-blog-carousel-track" ref={trackRef}>{children}</div>
  </section>;
}

Carousel.propTypes = {
  eyebrow: PropTypes.string.isRequired,
  title: PropTypes.string.isRequired,
  action: PropTypes.node,
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
};

function Media({ src, alt, icon, className = "", fallbackText = "" }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <div className={`cut-blog-discovery-fallback ${className}`} role="img" aria-label={alt}>
      {fallbackText ? <strong>{initials(fallbackText)}</strong> : <i className={icon} aria-hidden="true" />}
    </div>;
  }
  return <img className={className} src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}

Media.propTypes = {
  src: PropTypes.string,
  alt: PropTypes.string.isRequired,
  icon: PropTypes.string.isRequired,
  className: PropTypes.string,
  fallbackText: PropTypes.string,
};

function ProductionLogo({ production }) {
  const [failed, setFailed] = useState(false);
  const src = mediaUrl(production?.logo);
  return <span className="cut-blog-production-logo">
    {src && !failed
      ? <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
      : initials(production?.name)}
  </span>;
}

ProductionLogo.propTypes = {
  production: PropTypes.shape({
    logo: PropTypes.string,
    name: PropTypes.string,
  }).isRequired,
};

export default function BlogDiscoveryCarousels({ currentSlug = "", blogEntries = null, showBlogs = true }) {
  const [remoteBlogs, setRemoteBlogs] = useState([]);
  const [events, setEvents] = useState([]);
  const [items, setItems] = useState([]);

  useEffect(() => {
    let active = true;
    loadDiscovery().then((data) => {
      if (!active) return;
      setEvents(data.events || []);
      setItems(data.items || []);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!showBlogs || Array.isArray(blogEntries)) return undefined;
    let active = true;
    blogService.list({ per_page: 12 }).then((payload) => {
      if (active) setRemoteBlogs(extractBlogs(payload));
    }).catch(() => active && setRemoteBlogs([]));
    return () => { active = false; };
  }, [blogEntries, showBlogs]);

  const blogs = useMemo(() => {
    const source = Array.isArray(blogEntries) ? blogEntries : remoteBlogs;
    return source.filter((entry) => entry?.slug && entry.slug !== currentSlug).slice(0, 12);
  }, [blogEntries, currentSlug, remoteBlogs]);

  return <div className="cut-blog-discovery-sections">
    {showBlogs && blogs.length > 0 && <Carousel
      eyebrow="Continue explorando"
      title="Outros conteúdos da Cutinapp"
      action={<Link className="cut-blog-carousel-link" to="/blog">Ver todo o blog</Link>}
    >
      {blogs.map((entry) => <Link to={`/blog/${entry.slug}`} className="cut-blog-slide cut-blog-slide--article" key={`blog-${entry.id || entry.slug}`}>
        <div className="cut-blog-slide-media">
          <Media src={mediaUrl(entry.cover_image)} alt={entry.title} icon="fa-regular fa-newspaper" />
          <span>{entry.category || "Cutinapp"}</span>
        </div>
        <div className="cut-blog-slide-body">
          <h3>{entry.title}</h3>
          {entry.excerpt && <p>{entry.excerpt}</p>}
          <strong>Ler conteúdo <i className="fa-solid fa-arrow-right" /></strong>
        </div>
      </Link>)}
    </Carousel>}

    {events.length > 0 && <Carousel
      eyebrow="Acontece na Cutinapp"
      title="Próximos eventos"
      action={<Link className="cut-blog-carousel-link" to="/event">Ver eventos</Link>}
    >
      {events.map((event) => <Link to={`/event/${event.slug}`} className="cut-blog-slide cut-blog-slide--event" key={`event-${event.id || event.slug}`}>
        <div className="cut-blog-slide-media">
          <Media src={mediaUrl(event.image)} alt={event.title} icon="fa-regular fa-calendar" />
          {event.category && <span>{event.category}</span>}
        </div>
        <div className="cut-blog-slide-body">
          <h3>{event.title}</h3>
          <p className="cut-blog-slide-meta"><i className="fa-regular fa-calendar" /> {event.start_date ? eventDate.format(new Date(event.start_date)) : "Data a definir"}</p>
          <p className="cut-blog-slide-meta"><i className="fa-solid fa-location-dot" /> {event.venue || event.city || "Local a definir"}</p>
        </div>
      </Link>)}
    </Carousel>}

    {items.length > 0 && <Carousel
      eyebrow="Descubra nas produções"
      title="Itens das produções"
      action={<Link className="cut-blog-carousel-link" to="/productions">Ver produções</Link>}
      className="cut-blog-carousel-section--items"
    >
      {items.map((item, index) => {
        const production = item.production || {};
        const productionPath = production.slug ? `/production/${production.slug}/public` : "/productions";
        return <article className="cut-blog-slide cut-blog-slide--item" key={`item-${item.id || index}-${production.id || "production"}`}>
          <Link to={productionPath} className="cut-blog-slide-media" aria-label={`Ver ${production.name || "produção"}`}>
            <Media src={itemImage(item)} alt={item.name || "Item da produção"} icon="fa-solid fa-bag-shopping" fallbackText={item.name || "Item"} />
            {item.type && <span>{item.type}</span>}
          </Link>
          <div className="cut-blog-slide-body">
            <h3>{item.name || "Item da produção"}</h3>
            <Link to={productionPath} className="cut-blog-production-link">
              <ProductionLogo production={production} />
              <span><small>Produção</small><strong>{production.name || "Ver produção"}</strong></span>
              <i className="fa-solid fa-arrow-up-right-from-square" />
            </Link>
            {item.price !== undefined && item.price !== null && <div className="cut-blog-item-price">{money.format(Number(item.price) || 0)}</div>}
          </div>
        </article>;
      })}
    </Carousel>}
  </div>;
}

BlogDiscoveryCarousels.propTypes = {
  currentSlug: PropTypes.string,
  blogEntries: PropTypes.arrayOf(PropTypes.object),
  showBlogs: PropTypes.bool,
};
