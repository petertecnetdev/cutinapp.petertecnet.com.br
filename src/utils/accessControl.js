const normalizeText = (value) => String(value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .trim()
  .toLowerCase();

const collectNames = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(collectNames);
  if (typeof value === "string") return [normalizeText(value)];
  if (typeof value === "object") {
    return [value.name, value.slug, value.role, value.profile, value.permission, value.code]
      .filter(Boolean)
      .map(normalizeText);
  }
  return [];
};

export const getRoleNames = (user) => {
  const raw = [
    user?.profile,
    user?.profiles,
    user?.role,
    user?.roles,
    user?.type,
    user?.user_type,
    user?._auth?.role,
    user?._auth?.roles,
  ];
  return [...new Set(raw.flatMap(collectNames))];
};

export const getPermissionNames = (user) => {
  const raw = [
    user?.permissions,
    user?.profile?.permissions,
    user?.profiles?.flatMap?.((profile) => profile?.permissions || []) || [],
    user?.role?.permissions,
    user?.roles?.flatMap?.((role) => role?.permissions || []) || [],
  ];
  return new Set(raw.flatMap(collectNames));
};

const includesAny = (values, candidates) => candidates.some((candidate) => values.some((value) => value.includes(candidate)));

export const hasPermission = (user, ...names) => {
  const permissions = getPermissionNames(user);
  return names.some((name) => permissions.has(normalizeText(name)));
};

export const getAccessProfile = (user) => {
  const roles = getRoleNames(user);
  const can = (...names) => hasPermission(user, ...names);

  const isAdmin = includesAny(roles, ["administrador", "admin", "superadmin"])
    || can("user_management", "role_management", "permission_management");

  const isProducer = isAdmin
    || includesAny(roles, ["produtor", "producer", "organizador", "organizer"])
    || can("production_create", "production_configure", "production_update", "event_create", "event_config", "event_edit");

  const isPromoter = isAdmin
    || includesAny(roles, ["promoter", "divulgador", "afiliado"])
    || can("ticket_sale_manage_own");

  const isArtist = isAdmin || includesAny(roles, ["artista", "artist", "banda", "dj", "musico"]);
  const isSupplier = isAdmin || includesAny(roles, ["fornecedor", "supplier", "prestador"]);
  const isParticipant = includesAny(roles, ["participante", "participant", "cliente", "customer", "usuario", "user"])
    || (!isAdmin && !isProducer && !isPromoter && !isArtist && !isSupplier);

  const canCheckin = isAdmin || can("item_scan", "item_check", "production_scan", "production_validate");
  const canManageTeam = isAdmin || isProducer || can("user_list", "user_create", "user_management");
  const canManageEvents = isAdmin || isProducer || can("event_create", "event_config", "event_edit", "event_delete");
  const canManageProductions = isAdmin || isProducer || can("production_create", "production_configure", "production_update", "production_delete");
  const canManageItems = isAdmin || isProducer || can("item_create", "item_config", "item_list");
  const canManageTickets = isAdmin || isProducer || can("ticket_create", "ticket_edit", "ticket_delete", "ticket_sale_view", "ticket_sale_report");

  return {
    roles,
    isAdmin,
    isProducer,
    isPromoter,
    isArtist,
    isSupplier,
    isParticipant,
    canCheckin,
    canManageTeam,
    canManageEvents,
    canManageProductions,
    canManageItems,
    canManageTickets,
  };
};

export const getPrimaryRoleLabel = (access) => {
  if (access?.isAdmin) return "Administrador";
  if (access?.isProducer) return "Produtor";
  if (access?.isPromoter) return "Promoter";
  if (access?.isArtist) return "Artista";
  if (access?.isSupplier) return "Fornecedor";
  return "Participante";
};
