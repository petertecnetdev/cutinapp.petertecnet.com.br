import {
  hasContextRole,
  isArtistActor,
  isPeterTecnetRoot,
  isProductionManager,
  isPromoterActor,
} from "../utils/applicationRoles";
import { appSlug } from "../config";

const parseMetadata = (value) => {
  if (!value) return {};
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch (_) { return {}; }
};

const normalizePermission = (value) => String(value || "").trim().toLowerCase();

const collectPermissions = (user) => {
  const values = new Set();
  const add = (value) => {
    if (typeof value === "string") values.add(normalizePermission(value));
    if (value && typeof value === "object") add(value.slug || value.name || value.key || value.permission);
  };

  (Array.isArray(user?.permissions) ? user.permissions : []).forEach(add);
  (Array.isArray(user?.capabilities) ? user.capabilities : []).forEach(add);

  const membership = (user?.applications || []).find((application) => application?.slug === appSlug);
  const metadata = parseMetadata(membership?.pivot?.metadata);
  (Array.isArray(metadata.permissions) ? metadata.permissions : []).forEach(add);
  (Array.isArray(metadata.capabilities) ? metadata.capabilities : []).forEach(add);
  return values;
};

const anyPermission = (permissions, candidates) => candidates.some((permission) => permissions.has(permission));

export const resolveNavigationCapabilities = (user, evidence = {}) => {
  const permissions = collectPermissions(user);
  const root = isPeterTecnetRoot(user);
  const producer = Boolean(
    root
    || isProductionManager(user)
    || evidence.hasProductions
    || evidence.hasManagedEvents
    || anyPermission(permissions, ["production.manage", "productions.manage", "event.manage", "events.manage", "ticket.manage", "tickets.manage"]),
  );
  const artist = Boolean(
    root
    || isArtistActor(user)
    || hasContextRole(user, "artist")
    || anyPermission(permissions, ["artist.manage", "artists.manage"]),
  );
  const promoter = Boolean(
    root
    || isPromoterActor(user)
    || anyPermission(permissions, ["promoter.manage", "promotion.manage", "sales.promote", "commission.view"]),
  );
  const agent = Boolean(hasContextRole(user, "acquisition_agent") || permissions.has("acquisition.manage"));
  const admin = Boolean(root || evidence.hasApplicationAdmin || anyPermission(permissions, ["cutinapp.admin", "application.admin"]));

  const actorAreas = [
    producer && "producer",
    artist && "artist",
    promoter && "promoter",
    agent && "agent",
    admin && "admin",
  ].filter(Boolean);

  return {
    authenticated: Boolean(user),
    participant: Boolean(user),
    producer,
    artist,
    promoter,
    agent,
    admin,
    root,
    actorAreas,
    hasWorkArea: actorAreas.length > 0,
    permissions,
  };
};

export const canNavigate = (capabilities, requirement) => {
  if (!requirement) return true;
  if (Array.isArray(requirement)) return requirement.some((key) => Boolean(capabilities?.[key]));
  return Boolean(capabilities?.[requirement]);
};