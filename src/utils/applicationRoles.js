import { appSlug } from "../config";

const parseMetadata = (value) => {
  if (!value) return {};
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch (_) { return {}; }
};

const membershipFor = (user) => (user?.applications || []).find((application) => application?.slug === appSlug);

export const hasContextRole = (user, role) => {
  const membership = membershipFor(user);
  const pivot = membership?.pivot;
  if (!pivot || pivot.status !== "active") return false;
  if (pivot.role === role) return true;
  const metadata = parseMetadata(pivot.metadata);
  return Array.isArray(metadata.roles) && metadata.roles.includes(role);
};

export const hasAnyContextRole = (user, roles = []) => roles.some((role) => hasContextRole(user, role));

export const isPeterTecnetRoot = (user) => String(user?.email || "").trim().toLowerCase() === "petertecnet@gmail.com";

export const isProductionManager = (user) => Boolean(
  user?.is_producer
  || user?.is_ticket_seller
  || hasAnyContextRole(user, ["producer", "production_manager", "manager", "ticket_manager", "box_office"]),
);

export const isArtistActor = (user) => Boolean(
  hasAnyContextRole(user, ["artist", "artist_manager"])
  || user?.employer?.type === "artist",
);

export const isPromoterActor = (user) => Boolean(
  user?.is_promoter
  || hasAnyContextRole(user, ["promoter", "sales_promoter"]),
);

export const hasActorArea = (user) => isArtistActor(user) || isPromoterActor(user);
