export const FALLBACK_ORGANIZATION_TAXONOMY = {
  types: [
    { value: "company", label: "Produtora" },
    { value: "venue", label: "Casa / espaço de eventos" },
    { value: "collective", label: "Coletivo" },
    { value: "individual", label: "Produtor independente" },
  ],
  roles: [
    { value: "producer", label: "Produz eventos" },
    { value: "venue", label: "Sedia eventos" },
    { value: "organizer", label: "Organiza eventos" },
    { value: "promoter", label: "Promove e divulga eventos" },
  ],
  defaults: {
    company: ["producer"],
    venue: ["venue"],
    collective: ["producer", "organizer"],
    individual: ["producer", "organizer"],
  },
  legacy_aliases: {
    production: "company",
    producer: "company",
    produtora: "company",
    fixed: "venue",
    house: "venue",
    casa: "venue",
    independent: "individual",
    independent_producer: "individual",
    producer_independent: "individual",
    coletivo: "collective",
  },
};

const validEntries = (entries) => Array.isArray(entries)
  ? entries.filter((entry) => entry && typeof entry.value === "string" && typeof entry.label === "string")
  : [];

export const normalizeOrganizationTaxonomy = (payload) => {
  const types = validEntries(payload?.types);
  const roles = validEntries(payload?.roles);
  return {
    types: types.length ? types : FALLBACK_ORGANIZATION_TAXONOMY.types,
    roles: roles.length ? roles : FALLBACK_ORGANIZATION_TAXONOMY.roles,
    defaults: payload?.defaults && typeof payload.defaults === "object"
      ? { ...FALLBACK_ORGANIZATION_TAXONOMY.defaults, ...payload.defaults }
      : FALLBACK_ORGANIZATION_TAXONOMY.defaults,
    legacy_aliases: payload?.legacy_aliases && typeof payload.legacy_aliases === "object"
      ? { ...FALLBACK_ORGANIZATION_TAXONOMY.legacy_aliases, ...payload.legacy_aliases }
      : FALLBACK_ORGANIZATION_TAXONOMY.legacy_aliases,
  };
};

export const canonicalOrganizationType = (value, taxonomy = FALLBACK_ORGANIZATION_TAXONOMY) => {
  const raw = String(value || "").trim().toLowerCase();
  if (taxonomy.types.some((entry) => entry.value === raw)) return raw;
  return taxonomy.legacy_aliases?.[raw] || "company";
};

export const normalizeOrganizationRoles = (roles, type, taxonomy = FALLBACK_ORGANIZATION_TAXONOMY) => {
  const allowed = new Set(taxonomy.roles.map((entry) => entry.value));
  const source = Array.isArray(roles)
    ? roles
    : typeof roles === "string"
      ? roles.split(",")
      : [];
  const normalized = [...new Set(source.map((role) => String(role || "").trim().toLowerCase()).filter((role) => allowed.has(role)))];
  if (normalized.length) return normalized;
  return [...(taxonomy.defaults?.[canonicalOrganizationType(type, taxonomy)] || ["producer"])];
};

export const organizationTypePresentation = (organization, taxonomy = FALLBACK_ORGANIZATION_TAXONOMY) => {
  const type = canonicalOrganizationType(organization?.type, taxonomy);
  const label = taxonomy.types.find((entry) => entry.value === type)?.label || "Organização";
  const icon = {
    company: "fa-building",
    venue: "fa-store",
    collective: "fa-people-group",
    individual: "fa-user-tie",
  }[type] || "fa-building";
  return { type, label, icon };
};
