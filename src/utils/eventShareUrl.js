export const eventShareVersion = (event) => {
  const updatedAt = String(event?.updated_at || "").replace(/\D/g, "");
  if (updatedAt) return updatedAt.slice(0, 20);

  const id = Number(event?.id || 0);
  return id > 0 ? String(id) : "";
};

export const buildEventShareUrl = ({ event, origin, fallbackSlug = "", channel = "event_share" } = {}) => {
  const routeSlug = String(event?.slug || fallbackSlug || "").trim();
  if (!routeSlug) return String(origin || "");

  const url = new URL(`/event/${encodeURIComponent(routeSlug)}`, origin);
  const version = eventShareVersion(event);
  if (version) url.searchParams.set("v", version);

  const shareChannel = String(channel || "").trim();
  if (shareChannel) {
    url.searchParams.set("utm_source", "cutinapp");
    url.searchParams.set("utm_medium", shareChannel);
    url.searchParams.set("utm_campaign", "event_share");
  }

  return url.toString();
};
