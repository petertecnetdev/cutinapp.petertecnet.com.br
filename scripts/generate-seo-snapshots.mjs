import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const SITE_URL = "https://cutinapp.petertecnet.com.br";
const API_BASE = process.env.CUTINAPP_PUBLIC_API || "https://api.petertecnet.com.br/api/v1/apps/cutinapp";
const CONTENT_API = process.env.CUTINAPP_CONTENT_API || "https://api.petertecnet.com.br/api/v1/content";
const BUILD_DIR = path.resolve(process.env.CUTINAPP_BUILD_DIR || process.argv[2] || "build");
const TIME_ZONE = process.env.CUTINAPP_SEO_TIME_ZONE || "UTC";
const MAX_EVENTS = Math.max(1, Number(process.env.CUTINAPP_SEO_MAX_EVENTS || 5000));
const MAX_PROFILES = Math.max(0, Number(process.env.CUTINAPP_SEO_MAX_PROFILES || 5000));
const MAX_ITEM_EVENT_FETCHES = Math.max(0, Number(process.env.CUTINAPP_SEO_MAX_ITEM_EVENTS || 500));
const PAGE_SIZE = 50;
const PROFILE_PAGE_SIZE = 100;
const GENERATED_MARKER = ".cutinapp-seo-snapshots";
const DEFAULT_SOCIAL_IMAGE = `${SITE_URL}/images/cutinapp.png`;

const escapeHtml = (value = "") => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");

const stripText = (value = "") => String(value)
  .replace(/<[^>]*>/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const stripMarkdownText = (value = "") => stripText(String(value)
  .replace(/^\s{0,3}#{1,6}\s+[^\r\n]+[\r\n]+/, "")
  .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
  .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
  .replace(/[\*_`>#~]+/g, " "));

const truncate = (value = "", limit = 165) => {
  const text = stripText(value);
  return text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`;
};

const slugify = (value = "") => String(value)
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");

const absoluteImage = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return DEFAULT_SOCIAL_IMAGE;
  if (/^https?:\/\//i.test(raw)) return raw;
  const normalized = raw.replace(/^\/+/, "").replace(/^storage\//i, "");
  return `https://api.petertecnet.com.br/storage/${normalized}`;
};

const dateKey = (date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts
    .filter(({ type }) => ["year", "month", "day"].includes(type))
    .map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const addDays = (date, days) => new Date(date.getTime() + days * 86400000);

const weekdayIndex = (date) => {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, weekday: "short" }).format(date);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
};

const eventRangeKeys = (event) => {
  if (!event?.start_date) return { start: "", end: "" };
  const start = dateKey(new Date(event.start_date));
  const end = event.end_date ? dateKey(new Date(event.end_date)) : start;
  return { start, end };
};

const overlapsDate = (event, targetKey) => {
  const { start, end } = eventRangeKeys(event);
  return Boolean(start && start <= targetKey && end >= targetKey);
};

const upcomingWeekendKeys = (now) => {
  const current = weekdayIndex(now);
  let fridayOffset = (5 - current + 7) % 7;
  if (current === 6 || current === 0) fridayOffset = current === 6 ? -1 : -2;
  const friday = addDays(now, fridayOffset);
  return [dateKey(friday), dateKey(addDays(friday, 1)), dateKey(addDays(friday, 2))];
};

const eventMatchesPeriod = (event, period, now) => {
  const today = dateKey(now);
  if (period === "hoje") return overlapsDate(event, today);
  if (period === "amanha") return overlapsDate(event, dateKey(addDays(now, 1)));
  if (period === "fim-de-semana") return upcomingWeekendKeys(now).some((key) => overlapsDate(event, key));
  if (period === "proximos-7-dias") {
    const start = new Date(event.start_date || 0).getTime();
    return start >= now.getTime() && start <= addDays(now, 7).getTime();
  }
  return true;
};

const formatDate = (value) => value ? new Intl.DateTimeFormat("pt-BR", {
  timeZone: TIME_ZONE,
  weekday: "long",
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
}).format(new Date(value)) : "Data a confirmar";

const longToday = (now) => new Intl.DateTimeFormat("pt-BR", {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "long",
  year: "numeric",
}).format(now);

const fetchJson = async (url) => {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "CutinappSeoSnapshot/1.0" },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} ao consultar ${url}`);
  return response.json();
};

const fetchAllEvents = async () => {
  const events = [];
  for (let page = 1; page <= 100 && events.length < MAX_EVENTS; page += 1) {
    const url = new URL(`${API_BASE}/events`);
    url.searchParams.set("per_page", String(PAGE_SIZE));
    url.searchParams.set("view", "full");
    url.searchParams.set("sort", "newest");
    url.searchParams.set("page", String(page));
    const payload = await fetchJson(url);
    const paginator = payload?.events || {};
    const rows = Array.isArray(paginator?.data) ? paginator.data : [];
    events.push(...rows);
    if (rows.length === 0 || page >= Number(paginator.last_page || page)) break;
  }
  return events.slice(0, MAX_EVENTS);
};

const fetchAllProductions = async () => {
  const productions = [];
  for (let page = 1; page <= 100; page += 1) {
    const url = new URL(`${API_BASE}/organizations/public`);
    url.searchParams.set("per_page", String(PAGE_SIZE));
    url.searchParams.set("page", String(page));
    const payload = await fetchJson(url);
    const paginator = payload?.organizations || {};
    const rows = Array.isArray(paginator?.data) ? paginator.data : [];
    productions.push(...rows);
    if (rows.length === 0 || page >= Number(paginator.last_page || page)) break;
  }
  return productions;
};

const fetchAllArtists = async () => {
  const artists = [];
  for (let page = 1; page <= 100; page += 1) {
    const url = new URL(`${API_BASE}/artists`);
    url.searchParams.set("per_page", String(PAGE_SIZE));
    url.searchParams.set("page", String(page));
    const payload = await fetchJson(url);
    const paginator = payload?.artists || {};
    const rows = Array.isArray(paginator?.data) ? paginator.data : [];
    artists.push(...rows);
    if (rows.length === 0 || page >= Number(paginator.last_page || page)) break;
  }
  return artists;
};

const fetchAllBlogEntries = async () => {
  const entries = [];
  for (let page = 1; page <= 100; page += 1) {
    const url = new URL(CONTENT_API);
    url.searchParams.set("application", "cutinapp");
    url.searchParams.set("type", "article");
    url.searchParams.set("per_page", String(PAGE_SIZE));
    url.searchParams.set("page", String(page));
    const payload = await fetchJson(url);
    const paginator = payload?.data || {};
    const rows = Array.isArray(paginator?.data) ? paginator.data : [];
    entries.push(...rows);
    if (rows.length === 0 || page >= Number(paginator.last_page || page)) break;
  }
  return entries;
};

const fetchAllPublicProfileIds = async () => {
  if (MAX_PROFILES < 1) return [];
  const ids = [];
  try {
    for (let page = 1; page <= 100 && ids.length < MAX_PROFILES; page += 1) {
      const url = new URL(`${API_BASE}/profiles/preview-index`);
      url.searchParams.set("per_page", String(PROFILE_PAGE_SIZE));
      url.searchParams.set("page", String(page));
      const payload = await fetchJson(url);
      const paginator = payload?.profiles || {};
      const rows = Array.isArray(paginator?.data) ? paginator.data : [];
      ids.push(...rows.map((row) => Number(row?.id)).filter((id) => Number.isInteger(id) && id > 0));
      if (rows.length === 0 || page >= Number(paginator.last_page || page)) break;
    }
  } catch (error) {
    console.warn(`Profile preview index unavailable; profile snapshots skipped: ${error.message}`);
  }
  return [...new Set(ids)].slice(0, MAX_PROFILES);
};

const fetchProfiles = async (ids) => {
  const profiles = [];
  const concurrency = 8;
  for (let offset = 0; offset < ids.length; offset += concurrency) {
    const batch = ids.slice(offset, offset + concurrency);
    const rows = await Promise.all(batch.map(async (id) => {
      try {
        return await fetchJson(`${API_BASE}/profiles/${id}`);
      } catch (error) {
        console.warn(`Profile ${id} snapshot skipped: ${error.message}`);
        return null;
      }
    }));
    profiles.push(...rows.filter(Boolean));
  }
  return profiles;
};

const fetchPublicEventItems = async (events) => {
  if (MAX_ITEM_EVENT_FETCHES < 1) return [];
  const now = Date.now();
  const recentThreshold = now - 30 * 86400000;
  const eligible = events
    .filter((event) => {
      const end = new Date(event?.end_date || event?.start_date || 0).getTime();
      return Number.isFinite(end) && end >= recentThreshold;
    })
    .sort((a, b) => new Date(a.start_date || 0).getTime() - new Date(b.start_date || 0).getTime())
    .slice(0, MAX_ITEM_EVENT_FETCHES);

  const results = [];
  const concurrency = 8;
  for (let offset = 0; offset < eligible.length; offset += concurrency) {
    const batch = eligible.slice(offset, offset + concurrency);
    const payloads = await Promise.all(batch.map(async (event) => {
      try {
        const commerce = await fetchJson(`${API_BASE}/events/public/${encodeURIComponent(event.slug)}/commerce`);
        return (Array.isArray(commerce?.items) ? commerce.items : []).map((item) => ({
          event: commerce?.event || event,
          production: commerce?.event?.production || event?.production || null,
          item,
        }));
      } catch (error) {
        console.warn(`Commerce snapshot skipped for ${event.slug}: ${error.message}`);
        return [];
      }
    }));
    results.push(...payloads.flat());
  }
  return results;
};

const replaceTagContent = (html, tag, value) => html.replace(
  new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, "i"),
  `<${tag}>${escapeHtml(value)}</${tag}>`,
);

const replaceMeta = (html, selector, value) => {
  const escaped = escapeHtml(value);
  const attribute = selector.startsWith("og:") ? "property" : "name";
  const pattern = new RegExp(`<meta\\s+${attribute}=["']${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>`, "i");
  const tag = `<meta ${attribute}="${selector}" content="${escaped}" />`;
  return pattern.test(html) ? html.replace(pattern, tag) : html.replace("</head>", `  ${tag}\n</head>`);
};

const replaceCanonical = (html, canonical) => {
  const tag = `<link rel="canonical" href="${escapeHtml(canonical)}" />`;
  const pattern = /<link\s+rel=["']canonical["'][^>]*>/i;
  return pattern.test(html) ? html.replace(pattern, tag) : html.replace("</head>", `  ${tag}\n</head>`);
};

const replaceJsonLd = (html, jsonLd) => {
  const json = JSON.stringify(jsonLd).replace(/</g, "\\u003c");
  const tag = `<script type="application/ld+json" data-cutinapp-prerender="true">${json}</script>`;
  return html.replace("</head>", `  ${tag}\n</head>`);
};

const injectRootSnapshot = (html, body) => {
  const root = `<div id="root"><main data-cutinapp-seo-snapshot="true">${body}</main></div>`;
  return html.replace(/<div\s+id=["']root["']\s*><\/div>/i, root);
};

const applySeo = (baseHtml, {
  title,
  description,
  canonical,
  image,
  imageAlt = "Cutinapp",
  jsonLd,
  body,
  robots = "index, follow, max-image-preview:large",
  type = "website",
}) => {
  const socialImage = image || DEFAULT_SOCIAL_IMAGE;
  let html = replaceTagContent(baseHtml, "title", title);
  html = replaceMeta(html, "description", description);
  html = replaceMeta(html, "robots", robots);
  html = replaceMeta(html, "og:title", title);
  html = replaceMeta(html, "og:description", description);
  html = replaceMeta(html, "og:url", canonical);
  html = replaceMeta(html, "og:type", type);
  html = replaceMeta(html, "og:image", socialImage);
  html = replaceMeta(html, "og:image:alt", imageAlt);
  html = replaceMeta(html, "twitter:card", "summary_large_image");
  html = replaceMeta(html, "twitter:title", title);
  html = replaceMeta(html, "twitter:description", description);
  html = replaceMeta(html, "twitter:image", socialImage);
  html = replaceMeta(html, "twitter:image:alt", imageAlt);
  html = replaceCanonical(html, canonical);
  html = replaceJsonLd(html, jsonLd);
  html = injectRootSnapshot(html, body);
  return html;
};

const writeSnapshot = async (relativeRoute, html) => {
  const clean = relativeRoute.replace(/^\/+|\/+$/g, "");
  const directory = clean ? path.join(BUILD_DIR, clean) : BUILD_DIR;
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, "index.html"), html, "utf8");
};

const eventSchema = (event) => {
  const canonical = `${SITE_URL}/event/${encodeURIComponent(event.slug)}`;
  const production = event.production || event.organization || null;
  const artists = Array.isArray(event.artists) ? event.artists : [];
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    "@id": `${canonical}#event`,
    name: event.title,
    description: stripText(event.description || ""),
    image: [absoluteImage(event.image)],
    url: canonical,
    startDate: event.start_date || undefined,
    endDate: event.end_date || undefined,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: event.event_format === "online"
      ? "https://schema.org/OnlineEventAttendanceMode"
      : event.event_format === "hybrid"
        ? "https://schema.org/MixedEventAttendanceMode"
        : "https://schema.org/OfflineEventAttendanceMode",
    location: event.event_format === "online" ? {
      "@type": "VirtualLocation",
      url: event.online_url || canonical,
    } : {
      "@type": "Place",
      name: event.venue || event.address || event.city || "Local do evento",
      address: {
        "@type": "PostalAddress",
        streetAddress: event.formatted_address || event.address || undefined,
        addressLocality: event.city || undefined,
        addressRegion: event.uf || event.state || undefined,
        postalCode: event.cep || undefined,
        addressCountry: event.country || undefined,
      },
      ...(event.latitude !== null && event.latitude !== undefined && event.longitude !== null && event.longitude !== undefined ? {
        geo: { "@type": "GeoCoordinates", latitude: Number(event.latitude), longitude: Number(event.longitude) },
      } : {}),
    },
    organizer: {
      "@type": "Organization",
      name: event.organizer_name || production?.name || "Cutinapp",
      url: production?.slug ? `${SITE_URL}/production/${encodeURIComponent(production.slug)}/public` : SITE_URL,
    },
    performer: artists.filter((artist) => artist?.stage_name || artist?.name).map((artist) => ({
      "@type": "MusicGroup",
      name: artist.stage_name || artist.name,
      url: artist.slug ? `${SITE_URL}/artist/${encodeURIComponent(artist.slug)}` : undefined,
    })),
  };
};

const eventBody = (event) => {
  const production = event.production || event.organization || null;
  const citySlug = slugify(event.city || "");
  const description = stripText(event.description || "");
  return `<article style="max-width:900px;margin:0 auto;padding:32px 20px;font-family:system-ui,sans-serif">
    <p><a href="${SITE_URL}/eventos">Eventos na Cutinapp</a>${event.city ? ` · <a href="${SITE_URL}/eventos/${citySlug}">Eventos em ${escapeHtml(event.city)}</a>` : ""}</p>
    <h1>${escapeHtml(event.title || "Evento")}</h1>
    ${event.image ? `<img src="${escapeHtml(absoluteImage(event.image))}" alt="Flyer de ${escapeHtml(event.title || "evento")}" style="max-width:100%;height:auto" />` : ""}
    <p><strong>Data:</strong> ${escapeHtml(formatDate(event.start_date))}</p>
    <p><strong>Local:</strong> ${escapeHtml([event.venue, event.address, event.city, event.uf].filter(Boolean).join(" · ") || "Local a confirmar")}</p>
    ${production?.name ? `<p><strong>Produção:</strong> ${production.slug ? `<a href="${SITE_URL}/production/${encodeURIComponent(production.slug)}/public">${escapeHtml(production.name)}</a>` : escapeHtml(production.name)}</p>` : ""}
    ${description ? `<p>${escapeHtml(description)}</p>` : ""}
    <p><a href="${SITE_URL}/event/${encodeURIComponent(event.slug)}#ingressos">Ver ingressos e detalhes do evento</a></p>
  </article>`;
};

const buildEventSnapshot = (baseHtml, event) => {
  const canonical = `${SITE_URL}/event/${encodeURIComponent(event.slug)}`;
  const location = [event.city, event.uf].filter(Boolean).join(" - ");
  const title = `${event.title || "Evento"}${location ? ` em ${location}` : ""} | Cutinapp`;
  const description = truncate(event.description || `Confira data, local, atrações e ingressos para ${event.title || "este evento"} na Cutinapp.`);
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Cutinapp", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "Eventos", item: `${SITE_URL}/eventos` },
      ...(event.city ? [{ "@type": "ListItem", position: 3, name: `Eventos em ${event.city}`, item: `${SITE_URL}/eventos/${slugify(event.city)}` }] : []),
      { "@type": "ListItem", position: event.city ? 4 : 3, name: event.title || "Evento", item: canonical },
    ],
  };
  return applySeo(baseHtml, {
    title,
    description,
    canonical,
    image: absoluteImage(event.image),
    imageAlt: `Flyer de ${event.title || "evento"}`,
    jsonLd: [eventSchema(event), breadcrumb],
    body: eventBody(event),
  });
};

const productionSchema = (production) => {
  const canonical = `${SITE_URL}/production/${encodeURIComponent(production.slug)}/public`;
  const address = production.location_public === false ? undefined : {
    "@type": "PostalAddress",
    streetAddress: [production.address, production.address_number, production.neighborhood].filter(Boolean).join(", ") || undefined,
    addressLocality: production.city || undefined,
    addressRegion: production.uf || undefined,
    postalCode: production.cep || undefined,
    addressCountry: production.country || "BR",
  };
  return {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    "@id": `${canonical}#profile`,
    url: canonical,
    mainEntity: {
      "@type": "Organization",
      "@id": `${canonical}#organization`,
      name: production.name,
      description: stripMarkdownText(production.description || production.bio || ""),
      url: canonical,
      logo: production.logo || production.image ? absoluteImage(production.logo || production.image) : undefined,
      image: absoluteImage(production.background || production.cover || production.logo || production.image),
      address,
      sameAs: [production.website_url, production.instagram_url, production.facebook_url, production.twitter_url, production.youtube_url].filter(Boolean),
    },
  };
};

const productionBody = (production) => {
  const description = stripMarkdownText(production.description || production.bio || "");
  const image = production.background || production.cover || production.logo || production.image;
  const location = [production.city, production.uf].filter(Boolean).join(" - ");
  return `<article style="max-width:900px;margin:0 auto;padding:32px 20px;font-family:system-ui,sans-serif">
    <p><a href="${SITE_URL}/">Cutinapp</a> · Produção</p>
    <h1>${escapeHtml(production.name || "Produção")}</h1>
    ${image ? `<img src="${escapeHtml(absoluteImage(image))}" alt="Capa de ${escapeHtml(production.name || "Produção")}" style="max-width:100%;height:auto" />` : ""}
    ${location ? `<p><strong>Localização:</strong> ${escapeHtml(location)}</p>` : ""}
    ${description ? `<p>${escapeHtml(description)}</p>` : ""}
    <p><a href="${SITE_URL}/production/${encodeURIComponent(production.slug)}/public">Ver produção e eventos publicados</a></p>
  </article>`;
};

const buildProductionSnapshot = (baseHtml, production) => {
  const canonical = `${SITE_URL}/production/${encodeURIComponent(production.slug)}/public`;
  const name = production.name || "Produção";
  const location = [production.city, production.uf].filter(Boolean).join(" - ");
  const title = `${name}${location ? ` em ${location}` : ""} | Cutinapp`;
  const description = truncate(stripMarkdownText(production.description || production.bio || "") || `Conheça ${name}, seus eventos e ingressos disponíveis na Cutinapp.`);
  return applySeo(baseHtml, {
    title,
    description,
    canonical,
    image: absoluteImage(production.logo || production.image || production.background || production.cover),
    imageAlt: `Logo de ${name}`,
    jsonLd: productionSchema(production),
    body: productionBody(production),
  });
};


const artistBody = (artist) => {
  const name = artist.stage_name || artist.name || "Artista";
  const description = stripText(artist.short_bio || artist.bio || "");
  const location = [artist.city, artist.uf].filter(Boolean).join(" - ");
  return `<article style="max-width:900px;margin:0 auto;padding:32px 20px;font-family:system-ui,sans-serif">
    <p><a href="${SITE_URL}/">Cutinapp</a> · <a href="${SITE_URL}/artists">Artistas</a></p>
    <h1>${escapeHtml(name)}</h1>
    ${artist.photo ? `<img src="${escapeHtml(absoluteImage(artist.photo))}" alt="Foto de ${escapeHtml(name)}" style="max-width:100%;height:auto" />` : ""}
    ${location ? `<p><strong>Localização:</strong> ${escapeHtml(location)}</p>` : ""}
    ${description ? `<p>${escapeHtml(description)}</p>` : ""}
  </article>`;
};

const buildArtistSnapshot = (baseHtml, artist) => {
  const name = artist.stage_name || artist.name || "Artista";
  const canonical = `${SITE_URL}/artist/${encodeURIComponent(artist.slug)}`;
  const location = [artist.city, artist.uf].filter(Boolean).join(" - ");
  const description = truncate(stripText(artist.short_bio || artist.bio || "") || `Conheça ${name}${location ? `, artista de ${location}` : ""}, agenda e eventos na Cutinapp.`);
  const image = absoluteImage(artist.photo || artist.avatar);
  return applySeo(baseHtml, {
    title: `${name}${location ? ` · ${location}` : ""} | Cutinapp`,
    description,
    canonical,
    image,
    imageAlt: `Foto de ${name}`,
    type: "profile",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "ProfilePage",
      url: canonical,
      mainEntity: {
        "@type": "Person",
        name,
        description,
        image,
        url: canonical,
      },
    },
    body: artistBody(artist),
  });
};

const blogBody = (entry) => {
  const description = stripText(entry.excerpt || entry.seo_description || "");
  const image = entry.og_image || entry.cover_image || entry.seo?.og_image;
  return `<article style="max-width:900px;margin:0 auto;padding:32px 20px;font-family:system-ui,sans-serif">
    <p><a href="${SITE_URL}/">Cutinapp</a> · <a href="${SITE_URL}/blog">Blog</a></p>
    <h1>${escapeHtml(entry.title || "Blog Cutinapp")}</h1>
    ${image ? `<img src="${escapeHtml(absoluteImage(image))}" alt="${escapeHtml(entry.title || "Artigo Cutinapp")}" style="max-width:100%;height:auto" />` : ""}
    ${description ? `<p>${escapeHtml(description)}</p>` : ""}
    <p><a href="${SITE_URL}/blog/${encodeURIComponent(entry.slug)}">Ler artigo completo</a></p>
  </article>`;
};

const buildBlogSnapshot = (baseHtml, entry) => {
  const canonical = `${SITE_URL}/blog/${encodeURIComponent(entry.slug)}`;
  const title = entry.seo?.title || entry.seo_title || `${entry.title || "Blog"} | Cutinapp`;
  const description = truncate(entry.seo?.description || entry.seo_description || entry.excerpt || `Leia ${entry.title || "este conteúdo"} no blog da Cutinapp.`);
  const image = absoluteImage(entry.og_image || entry.cover_image || entry.seo?.og_image);
  return applySeo(baseHtml, {
    title,
    description,
    canonical,
    image,
    imageAlt: entry.title || "Blog Cutinapp",
    type: "article",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: entry.title || title,
      description,
      image,
      datePublished: entry.published_at || undefined,
      dateModified: entry.updated_at || entry.published_at || undefined,
      mainEntityOfPage: canonical,
      url: canonical,
      publisher: { "@type": "Organization", name: "Cutinapp", url: SITE_URL },
    },
    body: blogBody(entry),
  });
};

const profileName = (profile) => {
  const full = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim();
  return full || profile?.user_name || "Participante Cutinapp";
};

const profileBody = (payload) => {
  const profile = payload?.profile || {};
  const name = profileName(profile);
  const location = [profile.city, profile.uf].filter(Boolean).join(" - ");
  const description = stripText(profile.about || "");
  return `<article style="max-width:900px;margin:0 auto;padding:32px 20px;font-family:system-ui,sans-serif">
    <p><a href="${SITE_URL}/">Cutinapp</a> · Participante</p>
    <h1>${escapeHtml(name)}</h1>
    ${profile.avatar ? `<img src="${escapeHtml(absoluteImage(profile.avatar))}" alt="Avatar de ${escapeHtml(name)}" style="max-width:100%;height:auto" />` : ""}
    ${profile.user_name ? `<p>@${escapeHtml(String(profile.user_name).replace(/^@/, ""))}</p>` : ""}
    ${location ? `<p>${escapeHtml(location)}</p>` : ""}
    ${description ? `<p>${escapeHtml(description)}</p>` : ""}
  </article>`;
};

const buildProfileSnapshot = (baseHtml, payload) => {
  const profile = payload?.profile || {};
  const id = Number(profile.id);
  const name = profileName(profile);
  const handle = profile.user_name ? ` (@${String(profile.user_name).replace(/^@/, "")})` : "";
  const canonical = `${SITE_URL}/profile/${id}`;
  const description = truncate(stripText(profile.about || "") || `Veja o perfil de ${name} e suas conexões públicas na Cutinapp.`);
  const image = absoluteImage(profile.avatar);
  return applySeo(baseHtml, {
    title: `${name}${handle} | Cutinapp`,
    description,
    canonical,
    image,
    imageAlt: `Avatar de ${name}`,
    type: "profile",
    robots: "noindex, follow, max-image-preview:large",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "ProfilePage",
      url: canonical,
      mainEntity: {
        "@type": "Person",
        name,
        image,
        description,
        url: canonical,
      },
    },
    body: profileBody(payload),
  });
};

const itemBody = ({ event, production, item }) => {
  const image = item.image_url || item.image;
  const description = stripText(item.short_description || item.description || "");
  return `<article style="max-width:900px;margin:0 auto;padding:32px 20px;font-family:system-ui,sans-serif">
    <p><a href="${SITE_URL}/event/${encodeURIComponent(event.slug)}">${escapeHtml(event.title || "Evento")}</a> · Item</p>
    <h1>${escapeHtml(item.name || "Item")}</h1>
    ${image ? `<img src="${escapeHtml(absoluteImage(image))}" alt="${escapeHtml(item.name || "Item")}" style="max-width:100%;height:auto" />` : ""}
    ${description ? `<p>${escapeHtml(description)}</p>` : ""}
    ${production?.name ? `<p><strong>Produção:</strong> ${escapeHtml(production.name)}</p>` : ""}
  </article>`;
};

const buildItemSnapshot = (baseHtml, row) => {
  const { event, production, item } = row;
  const canonical = `${SITE_URL}/event/${encodeURIComponent(event.slug)}/item/${Number(item.id)}`;
  const name = item.name || "Item";
  const description = truncate(item.short_description || item.description || `${name} disponível no evento ${event.title || "publicado na Cutinapp"}.`);
  const image = absoluteImage(item.image_url || item.image);
  return applySeo(baseHtml, {
    title: `${name} | ${event.title || production?.name || "Cutinapp"}`,
    description,
    canonical,
    image,
    imageAlt: `Imagem de ${name}`,
    type: "product",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Product",
      name,
      description,
      image,
      sku: item.sku || undefined,
      brand: production?.name ? { "@type": "Brand", name: production.name } : undefined,
      offers: {
        "@type": "Offer",
        price: item.promotion_enabled && item.promotion_price !== null ? Number(item.promotion_price).toFixed(2) : Number(item.price || 0).toFixed(2),
        priceCurrency: item.currency || event.currency || production?.currency || "BRL",
        availability: item.available === false ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
        url: canonical,
      },
    },
    body: itemBody(row),
  });
};

const discoveryCopy = ({ city, period, category, now }) => {
  if (category && city) return {
    title: `${category} em ${city} | Eventos e ingressos | Cutinapp`,
    heading: `${category} em ${city}`,
    description: `Encontre ${category.toLowerCase()} em ${city}, confira datas, locais, atrações e ingressos disponíveis na Cutinapp.`,
  };
  if (period === "hoje" && city) return {
    title: `Eventos hoje em ${city} | Cutinapp`,
    heading: `Eventos hoje em ${city} — ${longToday(now)}`,
    description: `Veja eventos hoje em ${city}, com programação, locais, atrações e ingressos disponíveis na Cutinapp.`,
  };
  const labels = {
    amanha: "amanhã",
    "fim-de-semana": "neste fim de semana",
    "proximos-7-dias": "nos próximos 7 dias",
  };
  if (period && city) return {
    title: `Eventos ${labels[period] || ""} em ${city} | Cutinapp`.replace(/\s+/g, " "),
    heading: `Eventos ${labels[period] || ""} em ${city}`.replace(/\s+/g, " "),
    description: `Veja eventos ${labels[period] || ""} em ${city}, com programação, locais e ingressos na Cutinapp.`.replace(/\s+/g, " "),
  };
  if (city) return {
    title: `Eventos em ${city} | Festas, shows e ingressos | Cutinapp`,
    heading: `Eventos em ${city}`,
    description: `Descubra festas, shows, encontros e experiências em ${city}. Veja datas, locais e ingressos na Cutinapp.`,
  };
  return {
    title: "Eventos hoje e próximos eventos | Cutinapp",
    heading: "Eventos na Cutinapp",
    description: "Descubra eventos de hoje, amanhã e do fim de semana. Encontre programação, locais, atrações e ingressos na Cutinapp.",
  };
};

const discoverySchema = (canonical, heading, events) => ({
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: heading,
  url: canonical,
  numberOfItems: events.length,
  itemListElement: events.slice(0, 50).map((event, index) => ({
    "@type": "ListItem",
    position: index + 1,
    url: `${SITE_URL}/event/${encodeURIComponent(event.slug)}`,
    item: {
      "@type": "Event",
      name: event.title,
      url: `${SITE_URL}/event/${encodeURIComponent(event.slug)}`,
      startDate: event.start_date || undefined,
      image: absoluteImage(event.image),
      location: {
        "@type": "Place",
        name: event.venue || event.address || event.city || undefined,
        address: {
          "@type": "PostalAddress",
          addressLocality: event.city || undefined,
          addressRegion: event.uf || undefined,
          addressCountry: event.country || undefined,
        },
      },
    },
  })),
});

const discoveryBody = ({ heading, description, events, city }) => `<section style="max-width:1100px;margin:0 auto;padding:32px 20px;font-family:system-ui,sans-serif">
  <p><a href="${SITE_URL}/">Cutinapp</a> · <a href="${SITE_URL}/eventos">Eventos</a></p>
  <h1>${escapeHtml(heading)}</h1>
  <p>${escapeHtml(description)}</p>
  <ul>${events.slice(0, 50).map((event) => `<li style="margin:14px 0"><a href="${SITE_URL}/event/${encodeURIComponent(event.slug)}"><strong>${escapeHtml(event.title)}</strong></a> — ${escapeHtml(formatDate(event.start_date))}${event.venue || event.city ? ` · ${escapeHtml(event.venue || event.city)}` : ""}</li>`).join("")}</ul>
  ${city ? `<p>Veja também: <a href="${SITE_URL}/eventos/${slugify(city)}/hoje">eventos hoje</a>, <a href="${SITE_URL}/eventos/${slugify(city)}/amanha">eventos amanhã</a> e <a href="${SITE_URL}/eventos/${slugify(city)}/fim-de-semana">eventos no fim de semana</a> em ${escapeHtml(city)}.</p>` : ""}
</section>`;

const buildDiscoverySnapshot = (baseHtml, { route, events, city = "", period = "", category = "", now }) => {
  const canonical = `${SITE_URL}/${route.replace(/^\/+/, "")}`;
  const copy = discoveryCopy({ city, period, category, now });
  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Cutinapp", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "Eventos", item: `${SITE_URL}/eventos` },
      ...(city ? [{ "@type": "ListItem", position: 3, name: `Eventos em ${city}`, item: `${SITE_URL}/eventos/${slugify(city)}` }] : []),
      ...((period || category) ? [{ "@type": "ListItem", position: city ? 4 : 3, name: category || copy.heading, item: canonical }] : []),
    ],
  };
  return applySeo(baseHtml, {
    title: copy.title,
    description: copy.description,
    canonical,
    image: absoluteImage(events[0]?.image),
    jsonLd: [discoverySchema(canonical, copy.heading, events), breadcrumbs],
    body: discoveryBody({ ...copy, events, city }),
  });
};

const cleanupPreviousSnapshots = async () => {
  const marker = path.join(BUILD_DIR, GENERATED_MARKER);
  try {
    await fs.access(marker);
    await Promise.all([
      fs.rm(path.join(BUILD_DIR, "event"), { recursive: true, force: true }),
      fs.rm(path.join(BUILD_DIR, "eventos"), { recursive: true, force: true }),
      fs.rm(path.join(BUILD_DIR, "production"), { recursive: true, force: true }),
      fs.rm(path.join(BUILD_DIR, "artist"), { recursive: true, force: true }),
      fs.rm(path.join(BUILD_DIR, "blog"), { recursive: true, force: true }),
      fs.rm(path.join(BUILD_DIR, "profile"), { recursive: true, force: true }),
    ]);
  } catch (_) {
    // Primeira execução: não remove diretórios que não foram criados por este gerador.
  }
};

const main = async () => {
  const baseHtml = await fs.readFile(path.join(BUILD_DIR, "index.html"), "utf8");
  await cleanupPreviousSnapshots();

  const [eventRows, productionRows, artistRows, blogRows, profileIds] = await Promise.all([
    fetchAllEvents(),
    fetchAllProductions(),
    fetchAllArtists(),
    fetchAllBlogEntries(),
    fetchAllPublicProfileIds(),
  ]);
  const events = eventRows.filter((event) => event?.slug && event?.title);
  const productions = productionRows.filter((production) => production?.slug && production?.name);
  const artists = artistRows.filter((artist) => artist?.slug && (artist?.stage_name || artist?.name));
  const blogs = blogRows.filter((entry) => entry?.slug && entry?.title);
  const [profiles, itemRows] = await Promise.all([
    fetchProfiles(profileIds),
    fetchPublicEventItems(events),
  ]);
  const items = itemRows.filter((row) => row?.event?.slug && Number(row?.item?.id) > 0 && row?.item?.name);
  const now = new Date();
  let written = 0;

  for (const event of events) {
    await writeSnapshot(`event/${event.slug}`, buildEventSnapshot(baseHtml, event));
    written += 1;
  }

  for (const production of productions) {
    await writeSnapshot(`production/${production.slug}/public`, buildProductionSnapshot(baseHtml, production));
    written += 1;
  }

  for (const artist of artists) {
    await writeSnapshot(`artist/${artist.slug}`, buildArtistSnapshot(baseHtml, artist));
    written += 1;
  }

  for (const entry of blogs) {
    await writeSnapshot(`blog/${entry.slug}`, buildBlogSnapshot(baseHtml, entry));
    written += 1;
  }

  for (const payload of profiles) {
    const id = Number(payload?.profile?.id);
    if (!Number.isInteger(id) || id < 1) continue;
    await writeSnapshot(`profile/${id}`, buildProfileSnapshot(baseHtml, payload));
    written += 1;
  }

  for (const row of items) {
    await writeSnapshot(`event/${row.event.slug}/item/${Number(row.item.id)}`, buildItemSnapshot(baseHtml, row));
    written += 1;
  }

  const globalRoute = "eventos";
  await writeSnapshot(globalRoute, buildDiscoverySnapshot(baseHtml, { route: globalRoute, events, now }));
  written += 1;

  const byCity = new Map();
  for (const event of events) {
    if (!event.city) continue;
    const key = `${event.city}|||${event.uf || ""}`;
    if (!byCity.has(key)) byCity.set(key, []);
    byCity.get(key).push(event);
  }

  for (const [key, cityEvents] of byCity) {
    const [city] = key.split("|||");
    const citySlug = slugify(city);
    if (!citySlug) continue;

    await writeSnapshot(`eventos/${citySlug}`, buildDiscoverySnapshot(baseHtml, {
      route: `eventos/${citySlug}`, events: cityEvents, city, now,
    }));
    written += 1;

    for (const period of ["hoje", "amanha", "fim-de-semana", "proximos-7-dias"]) {
      const filtered = cityEvents.filter((event) => eventMatchesPeriod(event, period, now));
      await writeSnapshot(`eventos/${citySlug}/${period}`, buildDiscoverySnapshot(baseHtml, {
        route: `eventos/${citySlug}/${period}`, events: filtered, city, period, now,
      }));
      written += 1;
    }

    const categories = new Map();
    for (const event of cityEvents) {
      if (!event.category) continue;
      if (!categories.has(event.category)) categories.set(event.category, []);
      categories.get(event.category).push(event);
    }
    for (const [category, categoryEvents] of categories) {
      const categorySlug = slugify(category);
      if (!categorySlug) continue;
      await writeSnapshot(`eventos/${citySlug}/categoria/${categorySlug}`, buildDiscoverySnapshot(baseHtml, {
        route: `eventos/${citySlug}/categoria/${categorySlug}`,
        events: categoryEvents,
        city,
        category,
        now,
      }));
      written += 1;
    }
  }

  await fs.writeFile(path.join(BUILD_DIR, GENERATED_MARKER), JSON.stringify({
    generated_at: new Date().toISOString(),
    events: events.length,
    productions: productions.length,
    artists: artists.length,
    blog_entries: blogs.length,
    profiles: profiles.length,
    items: items.length,
    snapshots: written,
  }, null, 2), "utf8");

  console.log(`SEO snapshots generated: ${written} pages (${events.length} events, ${productions.length} productions, ${artists.length} artists, ${blogs.length} blog entries, ${profiles.length} profiles, ${items.length} items).`);
};

main().catch((error) => {
  console.error("SEO snapshot generation failed:", error);
  process.exitCode = 1;
});