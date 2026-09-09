import { storageUrl } from "../config";
import { SITE_URL } from "../components/SeoHead";
import { eventImageUrl } from "./eventMedia";

const schema = (name) => `https://schema.org/${name}`;

const stripText = (value = "") => String(value)
  .replace(/<[^>]*>/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const truncate = (value, limit = 165) => {
  const text = stripText(value);
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
};

const absoluteAssetUrl = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${storageUrl}${raw.replace(/^\/+/, "")}`;
};

const eventAttendanceMode = (event) => {
  if (event?.event_format === "online") return schema("OnlineEventAttendanceMode");
  if (event?.event_format === "hybrid") return schema("MixedEventAttendanceMode");
  return schema("OfflineEventAttendanceMode");
};

const eventStatus = (event) => {
  if (event?.is_cancelled) return schema("EventCancelled");
  return schema("EventScheduled");
};

const physicalLocation = (event) => {
  const street = [event?.address, event?.address_number].filter(Boolean).join(", ");
  const place = {
    "@type": "Place",
    name: event?.venue || event?.establishment_name || street || event?.city || "Local do evento",
    address: {
      "@type": "PostalAddress",
      streetAddress: event?.formatted_address || street || event?.address || undefined,
      addressLocality: event?.city || undefined,
      addressRegion: event?.uf || event?.state || undefined,
      postalCode: event?.cep || undefined,
      addressCountry: event?.country || "BR",
    },
  };

  if (event?.latitude !== null && event?.latitude !== undefined && event?.longitude !== null && event?.longitude !== undefined) {
    place.geo = {
      "@type": "GeoCoordinates",
      latitude: Number(event.latitude),
      longitude: Number(event.longitude),
    };
  }

  return place;
};

const eventLocation = (event) => {
  if (event?.event_format === "online") {
    return {
      "@type": "VirtualLocation",
      url: event?.online_url || `${SITE_URL}/event/${encodeURIComponent(event?.slug || "")}`,
    };
  }

  if (event?.event_format === "hybrid") {
    return [
      physicalLocation(event),
      {
        "@type": "VirtualLocation",
        url: event?.online_url || undefined,
      },
    ];
  }

  return physicalLocation(event);
};

const eventOrganizer = (event) => {
  const production = event?.production || event?.organization || null;
  const name = event?.organizer_name || production?.name || "Cutinapp";
  const url = production?.slug
    ? `${SITE_URL}/production/${encodeURIComponent(production.slug)}/public`
    : SITE_URL;

  return {
    "@type": "Organization",
    name,
    url,
  };
};

const eventPerformers = (event, artists = []) => {
  const source = Array.isArray(artists) && artists.length > 0 ? artists : (Array.isArray(event?.artists) ? event.artists : []);
  return source
    .filter((artist) => artist?.stage_name || artist?.name)
    .map((artist) => ({
      "@type": "MusicGroup",
      name: artist.stage_name || artist.name,
      url: artist.slug ? `${SITE_URL}/artist/${encodeURIComponent(artist.slug)}` : undefined,
    }));
};

const eventOffers = (event, tickets = []) => {
  const canonical = `${SITE_URL}/event/${encodeURIComponent(event?.slug || "")}`;
  return (Array.isArray(tickets) ? tickets : [])
    .filter((ticket) => ticket && ticket.price !== undefined && ticket.price !== null)
    .map((ticket) => ({
      "@type": "Offer",
      name: ticket.name || ticket.type || "Ingresso",
      price: Number(ticket.price || 0).toFixed(2),
      priceCurrency: "BRL",
      url: `${canonical}#ingressos`,
      availability: ticket.available === false ? schema("SoldOut") : schema("InStock"),
      validThrough: ticket.limit_date || event?.start_date || undefined,
    }));
};

export const buildEventSeo = (event, { tickets = [], artists = [] } = {}) => {
  if (!event?.slug) return null;

  const canonical = `${SITE_URL}/event/${encodeURIComponent(event.slug)}`;
  const structuredImage = eventImageUrl(event.image, "hero") || absoluteAssetUrl(event.image) || `${SITE_URL}/images/logo.png`;
  const socialImage = eventImageUrl(event.image, "og") || structuredImage;
  const locationLabel = [event.city, event.uf].filter(Boolean).join(" - ");
  const title = `${event.title || "Evento"}${locationLabel ? ` em ${locationLabel}` : ""} | Cutinapp`;
  const description = truncate(
    event.description || `Confira data, local, atrações e ingressos para ${event.title || "este evento"} na Cutinapp.`
  );
  const offers = eventOffers(event, tickets);
  const performers = eventPerformers(event, artists);

  const eventJsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    "@id": `${canonical}#event`,
    name: event.title || "Evento Cutinapp",
    description: stripText(event.description || description),
    image: [structuredImage],
    url: canonical,
    startDate: event.start_date || undefined,
    endDate: event.end_date || undefined,
    eventStatus: eventStatus(event),
    eventAttendanceMode: eventAttendanceMode(event),
    location: eventLocation(event),
    organizer: eventOrganizer(event),
    performer: performers.length > 0 ? performers : undefined,
    offers: offers.length > 0 ? offers : undefined,
    isAccessibleForFree: offers.length > 0 ? offers.every((offer) => Number(offer.price) === 0) : undefined,
    maximumAttendeeCapacity: event.max_attendees ? Number(event.max_attendees) : undefined,
    sameAs: [event.website, event.instagram_url, event.facebook_url, event.youtube_url].filter(Boolean),
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Cutinapp", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "Eventos", item: `${SITE_URL}/eventos` },
      ...(event.city ? [{
        "@type": "ListItem",
        position: 3,
        name: `Eventos em ${event.city}`,
        item: `${SITE_URL}/eventos/${String(event.city).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
      }] : []),
      {
        "@type": "ListItem",
        position: event.city ? 4 : 3,
        name: event.title || "Evento",
        item: canonical,
      },
    ],
  };

  return {
    title,
    description,
    canonical,
    image: socialImage,
    type: "website",
    jsonLd: [eventJsonLd, breadcrumbJsonLd],
  };
};

export { absoluteAssetUrl, stripText, truncate };