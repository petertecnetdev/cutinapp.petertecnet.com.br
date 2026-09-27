const pathSegment = (value) => {
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

export const publicEventRoute = (eventSlug) => {
  const slug = pathSegment(eventSlug);
  return slug ? `/event/${encodeURIComponent(slug)}` : "/event";
};

export const publicProductionRoute = (productionSlug) => {
  const slug = pathSegment(productionSlug);
  return slug ? `/production/${encodeURIComponent(slug)}/public` : "/productions";
};

export const publicArtistRoute = (artistSlug) => {
  const slug = pathSegment(artistSlug);
  return slug ? `/artist/${encodeURIComponent(slug)}` : "/artists";
};

export const publicEventItemRoute = (eventSlug, itemId) => {
  const slug = pathSegment(eventSlug);
  const id = pathSegment(itemId);

  if (slug && id) {
    return `/event/${encodeURIComponent(slug)}/item/${encodeURIComponent(id)}`;
  }

  if (slug) {
    return `/event/${encodeURIComponent(slug)}/catalogo`;
  }

  return "/event";
};

const publicEntityFallbacks = Object.freeze({
  event: "/event",
  item: "/event",
  eventitem: "/event",
  production: "/productions",
  artist: "/artists",
  ticket: "/passes",
  pass: "/passes",
  purchase: "/purchases",
  order: "/purchases",
  user: "/profile",
  profile: "/profile",
});

export const publicEntityFallbackRoute = (referenceType) => {
  const type = pathSegment(referenceType).toLowerCase().replace(/[\s_-]+/g, "");
  return publicEntityFallbacks[type] || "";
};

export const safeInternalRoute = (value, fallback = "/search") => {
  const candidate = pathSegment(value);
  const requestedFallback = pathSegment(fallback);
  const safeFallback = (
    requestedFallback.startsWith("/")
    && !requestedFallback.startsWith("//")
    && !requestedFallback.includes("\\")
  ) ? requestedFallback : "/";

  if (
    !candidate.startsWith("/")
    || candidate.startsWith("//")
    || candidate.includes("\\")
    || Array.from(candidate).some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    })
  ) {
    return safeFallback;
  }

  return candidate;
};
