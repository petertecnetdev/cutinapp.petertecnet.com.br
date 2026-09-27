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
    || /[\u0000-\u001F\u007F]/.test(candidate)
  ) {
    return safeFallback;
  }

  return candidate;
};
