import React, { useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { Link } from "react-router-dom";
import blogService from "../../services/BlogService";
import cutinappService from "../../services/CutinappService";
import eventService from "../../services/EventService";
import { storageUrl } from "../../config";
import { getImageFallbackInitials } from "../../utils/imageFallback";
import EventPosterThumbnail from "../event/EventPosterThumbnail";

const eventDate = new Intl.DateTimeFormat(undefined, {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const formatMoney = (value, currency = "BRL") => {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number(value) || 0);
  } catch {
    return String(value ?? "");
  }
};

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
  item?.image_url || item?.image || item?.cover_image || item?.photo || item?.thumbnail || firstFileUrl(item)
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
      : initials(production?.name || production?.fantasy)}
  </span>;
}

ProductionLogo.propTypes = {
  production: PropTypes.shape({
    logo: PropTypes.string,
    name: PropTypes.string,
    fantasy: PropTypes.string,
  }).isRequired,
};

export default function BlogDiscoveryCarousels({
  currentSlug = "",
  blogEntries = null,
  showBlogs = true,
  relatedEvents = null,
  relatedItems = null,
  relatedProductions = null,
  relatedArtists = null,
}) {
  const [remoteBlogs, setRemoteBlogs] = useState([]);
  const [fallbackEvents, setFallbackEvents] = useState([]);
  const [fallbackItems, setFallbackItems] = useState([]);

  useEffect(() => {
    if (Array.isArray(relatedEvents) && relatedEvents.length > 0 && Array.isArray(relatedItems) && relatedItems.length > 0) {
      return undefined;
    }

    let active = true;
    loadDiscovery().then((data) => {
      if (!active) return;
      if (!Array.isArray(relatedEvents) || relatedEvents.length === 0) setFallbackEvents(data.events || []);
      if (!Array.isArray(relatedItems) || relatedItems.length === 0) setFallbackItems(data.items || []);
    }).catch(() => {});
    return () => { active = false; };
  }, [relatedEvents, relatedItems]);

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

  const events = (Array.isArray(relatedEvents) && relatedEvents.length > 0 ? relatedEvents : fallbackEvents).slice(0, 12);
  const items = (Array.isArray(relatedItems) && relatedItems.length > 0 ? relatedItems : fallbackItems).slice(0, 16);
  const productions = (Array.isArray(relatedProductions) ? relatedProductions : []).slice(0, 10);
  const artists = (Array.isArray(relatedArtists) ? relatedArtists : []).slice(0, 10);

  return <div className="cut-blog-discovery-sections">
    {events.length > 0 && <Carousel
      eyebrow={Array.isArray(relatedEvents) && relatedEvents.length ? "Relacionado ao conteúdo" : "Acontece na Cutinapp"}
      title="Eventos para continuar descobrindo"
      action={<Link className="cut-blog-carousel-link" to="/event">Ver eventos</Link>}
    >
      {events.map((event) => <Link to={`/event/${event.slug}`} className="cut-blog-slide cut-blog-slide--event" key={`event-${event.id || event.slug}`}>
        <div className="cut-blog-slide-media cut-blog-slide-media--event">
          <EventPosterThumbnail image={event.image} title={event.title} alt={event.title} className="cut-blog-event-poster" loading="lazy" />
        </div>
        <div className="cut-blog-slide-body">
          {event.category && <span className="cut-blog-event-category">{event.category}</span>}
          <h3>{event.title}</h3>
          <p className="cut-blog-slide-meta"><i className="fa-regular fa-calendar" /> {event.start_date ? eventDate.format(new Date(event.start_date)) : "Data a definir"}</p>
          <p className="cut-blog-slide-meta"><i className="fa-solid fa-location-dot" /> {event.venue || event.city || "Local a definir"}</p>
          {event.production?.slug && <span className="cut-blog-context-caption">{event.production.name || event.production.fantasy}</span>}
        </div>
      </Link>)}
    </Carousel>}

    {productions.length > 0 && <Carousel
      eyebrow="Quem movimenta essa cena"
      title="Produções relacionadas"
      action={<Link className="cut-blog-carousel-link" to="/productions">Ver produções</Link>}
    >
      {productions.map((production) => {
        const name = production.name || production.fantasy || "Produção";
        return <Link to={`/production/${production.slug}/public`} className="cut-blog-slide cut-blog-slide--entity" key={`production-${production.id || production.slug}`}>
          <div className="cut-blog-slide-media cut-blog-slide-media--entity">
            <Media src={mediaUrl(production.background || production.logo)} alt={name} icon="fa-solid fa-bolt" fallbackText={name} />
            <span>Produção</span>
          </div>
          <div className="cut-blog-slide-body">
            <div className="cut-blog-entity-title"><ProductionLogo production={production} /><h3>{name}</h3></div>
            {production.description && <p>{production.description}</p>}
            {(production.city || production.uf) && <p className="cut-blog-slide-meta"><i className="fa-solid fa-location-dot" /> {[production.city, production.uf].filter(Boolean).join(" · ")}</p>}
            <strong>Conhecer produção <i className="fa-solid fa-arrow-right" /></strong>
          </div>
        </Link>;
      })}
    </Carousel>}

    {artists.length > 0 && <Carousel
      eyebrow="Line-up e identidade"
      title="Artistas para conhecer"
      action={<Link className="cut-blog-carousel-link" to="/artists">Ver artistas</Link>}
    >
      {artists.map((artist) => <Link to={`/artist/${artist.slug}`} className="cut-blog-slide cut-blog-slide--entity" key={`artist-${artist.id || artist.slug}`}>
        <div className="cut-blog-slide-media cut-blog-slide-media--artist">
          <Media src={mediaUrl(artist.cover || artist.photo)} alt={artist.stage_name || "Artista"} icon="fa-solid fa-music" fallbackText={artist.stage_name || "Artista"} />
          <span>Artista</span>
        </div>
        <div className="cut-blog-slide-body">
          <h3>{artist.stage_name || "Artista"}</h3>
          {artist.short_bio && <p>{artist.short_bio}</p>}
          {Array.isArray(artist.genres) && artist.genres.length > 0 && <span className="cut-blog-context-caption">{artist.genres.slice(0, 3).join(" · ")}</span>}
          {(artist.city || artist.uf) && <p className="cut-blog-slide-meta"><i className="fa-solid fa-location-dot" /> {[artist.city, artist.uf].filter(Boolean).join(" · ")}</p>}
          <strong>Ver perfil <i className="fa-solid fa-arrow-right" /></strong>
        </div>
      </Link>)}
    </Carousel>}

    {items.length > 0 && <Carousel
      eyebrow="Complete a experiência"
      title="Itens e experiências das produções"
      action={<Link className="cut-blog-carousel-link" to="/productions">Ver produções</Link>}
      className="cut-blog-carousel-section--items"
    >
      {items.map((item, index) => {
        const production = item.production || item.establishment || {};
        const productionPath = production.slug ? `/production/${production.slug}/public` : "/productions";
        return <article className="cut-blog-slide cut-blog-slide--item" key={`item-${item.id || index}-${production.id || "production"}`}>
          <Link to={productionPath} className="cut-blog-slide-media" aria-label={`Ver ${production.name || production.fantasy || "produção"}`}>
            <Media src={itemImage(item)} alt={item.name || "Item da produção"} icon="fa-solid fa-bag-shopping" fallbackText={item.name || "Item"} />
            {item.type && <span>{item.type}</span>}
          </Link>
          <div className="cut-blog-slide-body">
            <h3>{item.name || "Item da produção"}</h3>
            <Link to={productionPath} className="cut-blog-production-link">
              <ProductionLogo production={production} />
              <span><small>Produção</small><strong>{production.name || production.fantasy || "Ver produção"}</strong></span>
              <i className="fa-solid fa-arrow-up-right-from-square" />
            </Link>
            {item.price !== undefined && item.price !== null && <div className="cut-blog-item-price">{formatMoney(item.price, item.currency || "BRL")}</div>}
          </div>
        </article>;
      })}
    </Carousel>}

    {showBlogs && blogs.length > 0 && <Carousel
      eyebrow="Continue explorando"
      title="Mais conteúdos da Cutinapp"
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
  </div>;
}

BlogDiscoveryCarousels.propTypes = {
  currentSlug: PropTypes.string,
  blogEntries: PropTypes.arrayOf(PropTypes.object),
  showBlogs: PropTypes.bool,
  relatedEvents: PropTypes.arrayOf(PropTypes.object),
  relatedItems: PropTypes.arrayOf(PropTypes.object),
  relatedProductions: PropTypes.arrayOf(PropTypes.object),
  relatedArtists: PropTypes.arrayOf(PropTypes.object),
};
