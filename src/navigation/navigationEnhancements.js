export const NAV_FAVORITES_KEY = "cutinapp:navigation-favorites";
export const NAV_RECENTS_KEY = "cutinapp:navigation-recents";

export const NAV_FEATURE_FLAGS = Object.freeze({
  commandPalette: true,
  favorites: true,
  recents: true,
  breadcrumbs: true,
  contextualQuickActions: true,
});

const uniqueById = (items = []) => items.filter((entry, index, all) => entry?.id && all.findIndex((candidate) => candidate?.id === entry.id) === index);

export const buildBreadcrumbs = (pathname = "", productions = []) => {
  const crumbs = [{ id: "home", label: "Cutinapp", to: "/feed" }];
  const production = pathname.match(/^\/production\/(?:edit\/)?(\d+)/);
  const event = pathname.match(/^\/event\/(?:edit\/)?([^/]+)/);
  if (production) {
    const entity = productions.find((item) => String(item.id) === production[1]);
    crumbs.push({ id: "productions", label: "Produções", to: "/production/mine" });
    crumbs.push({ id: `production-${production[1]}`, label: entity?.name || `Produção #${production[1]}`, to: `/production/${production[1]}` });
  } else if (event) {
    crumbs.push({ id: "events", label: "Eventos", to: "/event/manage" });
    crumbs.push({ id: `event-${event[1]}`, label: `Evento ${event[1]}`, to: `/event/${event[1]}` });
  }
  return crumbs;
};

export const contextualQuickActions = (pathname = "", capabilities = {}) => {
  if (!capabilities.producer) return [];
  const event = pathname.match(/^\/event\/(?:edit\/)?([^/]+)/);
  if (event) return uniqueById([
    { id: "context-event-ticket", label: "Criar ingresso", icon: "fa-solid fa-ticket", to: "/ticket/create" },
    { id: "context-event-courtesy", label: "Gerar cortesia", icon: "fa-solid fa-gift", to: `/event/${event[1]}/courtesies` },
    { id: "context-event-checkin", label: "Abrir check-in", icon: "fa-solid fa-qrcode", to: "/checkin" },
  ]);
  const production = pathname.match(/^\/production\/(?:edit\/)?(\d+)/);
  if (production) return [
    { id: "context-production-event", label: "Criar evento", icon: "fa-solid fa-calendar-plus", to: "/event/create" },
    { id: "context-production-sales", label: "Ver vendas", icon: "fa-solid fa-chart-line", to: "/producer/sales" },
    { id: "context-production-agenda", label: "Abrir agenda", icon: "fa-regular fa-calendar", to: `/production/${production[1]}/agenda` },
  ];
  return [];
};

export const navigationSearchIndex = ({ common = [], actors = [], account = [], contextual = [], quick = [] }) => uniqueById([
  ...common,
  ...actors.flatMap((area) => area.items || []),
  ...account,
  ...contextual,
  ...quick,
]).filter((entry) => entry.to && entry.label);

export const searchNavigation = (index, query) => {
  const normalized = String(query || "").trim().toLocaleLowerCase("pt-BR");
  if (!normalized) return index.slice(0, 8);
  return index.filter((entry) => `${entry.label} ${entry.keywords || ""}`.toLocaleLowerCase("pt-BR").includes(normalized)).slice(0, 10);
};

export const readStringList = (raw) => {
  if (!raw) return [];
  try { const value = JSON.parse(raw); return Array.isArray(value) ? value.filter((item) => typeof item === "string") : []; } catch (_) { return []; }
};

export const pushRecent = (current, id, limit = 6) => [id, ...current.filter((entry) => entry !== id)].slice(0, limit);
export const toggleFavorite = (current, id) => current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id].slice(-8);
export const resolveStoredItems = (ids, index) => ids.map((id) => index.find((entry) => entry.id === id)).filter(Boolean);

export const prefetchOnIntent = (entry) => {
  if (typeof window === "undefined" || !entry?.to) return;
  try { window.dispatchEvent(new CustomEvent("cutinapp:navigation-intent", { detail: { route: entry.to, id: entry.id } })); } catch (_) { /* optional */ }
};
