import { canNavigate } from "./capabilityResolver";

export const PRODUCTION_STORAGE_KEY = "cutinapp:navigation-production";
export const NAV_USAGE_STORAGE_KEY = "cutinapp:navigation-usage";

const item = (id, label, icon, to, extras = {}) => ({ id, label, icon, to, ...extras });

export const commonNavigation = [
  item("feed", "Feed", "fa-solid fa-bolt", "/feed"),
  item("events", "Eventos", "fa-regular fa-calendar-days", "/event"),
  item("productions", "Produções", "fa-solid fa-building", "/productions"),
  item("artists", "Artistas", "fa-solid fa-music", "/artists"),
];

export const accountNavigation = [
  item("profile", "Meu perfil", "fa-regular fa-user", "/profile"),
  item("passes", "Meus ingressos", "fa-solid fa-ticket", "/passes"),
  item("purchases", "Minhas compras", "fa-solid fa-receipt", "/purchases"),
  item("notifications", "Notificações", "fa-regular fa-bell", "/notifications"),
  item("dashboard", "Meu painel", "fa-solid fa-gauge-high", "/dashboard"),
  item("account-settings", "Editar conta", "fa-solid fa-gear", "/user/edit"),
  item("password", "Alterar senha", "fa-solid fa-key", "/password"),
];

export const actorNavigation = [
  {
    id: "producer",
    label: "Produção",
    icon: "fa-solid fa-briefcase",
    requirement: "producer",
    description: "Produções, eventos, ingressos e operação",
    items: [
      item("my-productions", "Minhas produções", "fa-solid fa-building", "/production/mine"),
      item("manage-events", "Meus eventos", "fa-solid fa-calendar-check", "/event/manage"),
      item("create-event", "Criar evento", "fa-solid fa-calendar-plus", "/event/create"),
      item("create-ticket", "Ingressos e cortesias", "fa-solid fa-ticket", "/ticket/create"),
      item("sales", "Vendas", "fa-solid fa-chart-line", "/producer/sales"),
      item("finance", "Financeiro", "fa-solid fa-wallet", "/producer/finance"),
      item("checkin", "Portaria / check-in", "fa-solid fa-qrcode", "/checkin"),
      item("contracts", "Contratos", "fa-solid fa-file-signature", "/producer/contracts"),
    ],
    quick: [
      item("quick-create-event", "Criar evento", "fa-solid fa-calendar-plus", "/event/create", { requirement: "producer" }),
      item("quick-create-ticket", "Criar ingresso", "fa-solid fa-ticket", "/ticket/create", { requirement: "producer" }),
      item("quick-checkin", "Abrir check-in", "fa-solid fa-qrcode", "/checkin", { requirement: "producer" }),
      item("quick-sales", "Ver vendas", "fa-solid fa-chart-line", "/producer/sales", { requirement: "producer" }),
    ],
  },
  {
    id: "artist",
    label: "Artista",
    icon: "fa-solid fa-music",
    requirement: "artist",
    description: "Carreira, agenda e presença nos eventos",
    items: [
      item("artist-area", "Área do artista", "fa-solid fa-microphone-lines", "/artist/manage"),
      item("artist-events", "Explorar eventos", "fa-regular fa-calendar-days", "/event"),
      item("artist-discovery", "Explorar artistas", "fa-solid fa-users", "/artists"),
    ],
    quick: [item("quick-artist", "Gerenciar carreira", "fa-solid fa-wand-magic-sparkles", "/artist/manage", { requirement: "artist" })],
  },
  {
    id: "promoter",
    label: "Promoter",
    icon: "fa-solid fa-bullhorn",
    requirement: "promoter",
    description: "Divulgação, atribuição e vendas",
    items: [
      item("promoter-events", "Eventos para divulgar", "fa-regular fa-calendar-days", "/event"),
      item("promoter-sales", "Vendas atribuídas", "fa-solid fa-chart-line", "/producer/sales"),
      item("promoter-feed", "Feed", "fa-solid fa-bolt", "/feed"),
    ],
    quick: [item("quick-promoter", "Encontrar evento", "fa-solid fa-bullhorn", "/event", { requirement: "promoter" })],
  },
  {
    id: "agent",
    label: "Agente",
    icon: "fa-solid fa-user-tie",
    requirement: "agent",
    description: "Aquisição e relacionamento",
    items: [item("agent-dashboard", "Painel do agente", "fa-solid fa-gauge", "/agent")],
    quick: [item("quick-agent", "Abrir painel", "fa-solid fa-user-tie", "/agent", { requirement: "agent" })],
  },
  {
    id: "admin",
    label: "Administração",
    icon: "fa-solid fa-shield-halved",
    requirement: "admin",
    description: "Operação e governança da Cutinapp",
    items: [
      item("admin-center", "Admin Center", "fa-solid fa-shield-halved", "/admin"),
      item("admin-users", "Usuários", "fa-solid fa-users-gear", "/admin/users"),
      item("admin-events", "Eventos", "fa-solid fa-calendar-days", "/admin/events"),
      item("moderation", "Moderação", "fa-solid fa-user-shield", "/moderation/reports"),
    ],
    quick: [item("quick-admin", "Abrir Admin Center", "fa-solid fa-shield-halved", "/admin", { requirement: "admin" })],
  },
];

export const actorMenusFor = (capabilities) => actorNavigation.filter((area) => canNavigate(capabilities, area.requirement));

export const quickActionsFor = (capabilities) => actorMenusFor(capabilities)
  .flatMap((area) => area.quick || [])
  .filter((entry, index, all) => canNavigate(capabilities, entry.requirement) && all.findIndex((candidate) => candidate.to === entry.to) === index);

export const contextualNavigation = (pathname = "", capabilities = {}) => {
  const eventMatch = pathname.match(/^\/event\/(?!create|manage)([^/]+)/);
  if (eventMatch && capabilities.producer) {
    const eventRef = eventMatch[1];
    return {
      label: "Evento atual",
      items: [
        item("event-view", "Ver evento", "fa-regular fa-eye", `/event/${eventRef}`),
        item("event-edit", "Editar evento", "fa-solid fa-pen", `/event/edit/${eventRef}`),
        item("event-courtesies", "Cortesias", "fa-solid fa-gift", `/event/${eventRef}/courtesies`),
        item("event-participants", "Participantes", "fa-solid fa-users", `/event/${eventRef}/participants`),
        item("event-lineup", "Line-up", "fa-solid fa-music", `/event/${eventRef}/lineup`),
        item("event-checkin", "Check-in", "fa-solid fa-qrcode", "/checkin"),
      ],
    };
  }

  const productionMatch = pathname.match(/^\/production\/(\d+)/);
  if (productionMatch && capabilities.producer) {
    const id = productionMatch[1];
    return {
      label: "Produção atual",
      items: [
        item("production-view", "Visão geral", "fa-solid fa-building", `/production/${id}`),
        item("production-edit", "Editar produção", "fa-solid fa-pen", `/production/edit/${id}`),
        item("production-agenda", "Agenda", "fa-regular fa-calendar", `/production/${id}/agenda`),
        item("production-new-event", "Novo evento", "fa-solid fa-calendar-plus", "/event/create"),
        item("production-sales", "Vendas", "fa-solid fa-chart-line", "/producer/sales"),
      ],
    };
  }
  return null;
};

export const readNavigationUsage = (raw) => {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_) { return {}; }
};

export const rankQuickActions = (actions, usage = {}) => [...actions].sort((a, b) => {
  const score = Number(usage[b.id] || 0) - Number(usage[a.id] || 0);
  if (score !== 0) return score;
  return actions.indexOf(a) - actions.indexOf(b);
});