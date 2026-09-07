import { hasContextRole, isArtistActor, isPeterTecnetRoot, isProductionManager, isPromoterActor } from "../utils/applicationRoles";
import { appSlug } from "../config";

const parseMetadata = (value) => { if (!value) return {}; if (typeof value === "object") return value; try { return JSON.parse(value); } catch (_) { return {}; } };
const normalize = (value) => String(value || "").trim().toLowerCase();
const collectPermissions = (user) => {
  const values = new Set();
  const add = (value) => { if (typeof value === "string") values.add(normalize(value)); else if (value && typeof value === "object") add(value.slug || value.name || value.key || value.permission); };
  (Array.isArray(user?.permissions) ? user.permissions : []).forEach(add);
  (Array.isArray(user?.capabilities) ? user.capabilities : []).forEach(add);
  const membership = (user?.applications || []).find((application) => application?.slug === appSlug);
  const metadata = parseMetadata(membership?.pivot?.metadata);
  [metadata.permissions, metadata.capabilities].forEach((list) => (Array.isArray(list) ? list : []).forEach(add));
  return values;
};
const any = (permissions, candidates) => candidates.some((permission) => permissions.has(permission));
const permissionMap = (permissions, root, producer, artist, promoter, admin) => ({
  "production.manage": root || producer || any(permissions, ["production.manage", "productions.manage"]),
  "event.manage": root || producer || any(permissions, ["event.manage", "events.manage"]),
  "ticket.manage": root || producer || any(permissions, ["ticket.manage", "tickets.manage"]),
  "sales.view": root || producer || promoter || any(permissions, ["sales.view", "sales.manage"]),
  "finance.view": root || producer || any(permissions, ["finance.view", "finance.manage"]),
  "checkin.manage": root || producer || any(permissions, ["checkin.manage", "check-in.manage"]),
  "artist.manage": root || artist || any(permissions, ["artist.manage", "artists.manage"]),
  "promoter.manage": root || promoter || any(permissions, ["promoter.manage", "promotion.manage"]),
  "commission.view": root || promoter || permissions.has("commission.view"),
  "application.admin": root || admin || any(permissions, ["cutinapp.admin", "application.admin"]),
});

export const resolveNavigationCapabilities = (user, evidence = {}) => {
  const permissions = collectPermissions(user);
  const root = isPeterTecnetRoot(user);
  const producer = Boolean(root || isProductionManager(user) || evidence.hasProductions || evidence.hasManagedEvents || any(permissions, ["production.manage", "productions.manage", "event.manage", "events.manage", "ticket.manage", "tickets.manage"]));
  const artist = Boolean(root || isArtistActor(user) || hasContextRole(user, "artist") || any(permissions, ["artist.manage", "artists.manage"]));
  const promoter = Boolean(root || isPromoterActor(user) || evidence.hasPromotions || any(permissions, ["promoter.manage", "promotion.manage", "sales.promote", "commission.view"]));
  const agent = Boolean(hasContextRole(user, "acquisition_agent") || permissions.has("acquisition.manage"));
  const admin = Boolean(root || evidence.hasApplicationAdmin || any(permissions, ["cutinapp.admin", "application.admin"]));
  const actorAreas = [producer && "producer", artist && "artist", promoter && "promoter", agent && "agent", admin && "admin"].filter(Boolean);
  return { authenticated: Boolean(user), participant: Boolean(user), producer, artist, promoter, agent, admin, root, actorAreas, hasWorkArea: actorAreas.length > 0, permissions, grants: permissionMap(permissions, root, producer, artist, promoter, admin) };
};

export const canNavigate = (capabilities, requirement) => {
  if (!requirement) return true;
  if (Array.isArray(requirement)) return requirement.some((key) => canNavigate(capabilities, key));
  if (Object.prototype.hasOwnProperty.call(capabilities?.grants || {}, requirement)) return Boolean(capabilities.grants[requirement]);
  return Boolean(capabilities?.[requirement]);
};
