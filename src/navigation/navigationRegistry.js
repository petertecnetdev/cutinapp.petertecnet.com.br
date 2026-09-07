import {
  hasContextRole,
  isArtistActor,
  isPeterTecnetRoot,
  isProductionManager,
  isPromoterActor,
} from "../utils/applicationRoles";

export const NAV_MODE_STORAGE_KEY = "cutinapp:navigation-mode";
export const PRODUCTION_STORAGE_KEY = "cutinapp:navigation-production";

const item = (id, label, icon, to, extras = {}) => ({ id, label, icon, to, ...extras });

export const navigationModesFor = (user) => {
  const root = isPeterTecnetRoot(user);
  const modes = [{ id: "participant", label: "Participante", icon: "fa-regular fa-user", description: "Descobrir, interagir e comprar" }];
  if (root || isProductionManager(user)) modes.push({ id: "manager", label: "Gerência", icon: "fa-solid fa-briefcase", description: "Produção, eventos e vendas" });
  if (root || isArtistActor(user)) modes.push({ id: "artist", label: "Artista", icon: "fa-solid fa-music", description: "Agenda, presença e público" });
  if (root || isPromoterActor(user)) modes.push({ id: "promoter", label: "Promoter", icon: "fa-solid fa-bullhorn", description: "Divulgação, vendas e comissão" });
  if (hasContextRole(user, "acquisition_agent")) modes.push({ id: "agent", label: "Agente", icon: "fa-solid fa-user-tie", description: "Aquisição e relacionamento" });
  if (root) modes.push({ id: "admin", label: "Administração", icon: "fa-solid fa-shield-halved", description: "Operação da Cutinapp" });
  return modes;
};

const registry = {
  participant: {
    primary: [
      item("feed", "Feed", "fa-solid fa-bolt", "/feed"),
      item("events", "Eventos", "fa-regular fa-calendar-days", "/event"),
      item("tickets", "Ingressos", "fa-solid fa-ticket", "/passes"),
      item("profile", "Perfil", "fa-regular fa-user", "/profile"),
    ],
    secondary: [
      item("productions", "Produções", "fa-solid fa-building", "/productions"),
      item("artists", "Artistas", "fa-solid fa-music", "/artists"),
      item("purchases", "Compras", "fa-solid fa-receipt", "/purchases"),
    ],
    quick: [
      item("discover", "Explorar eventos", "fa-solid fa-compass", "/event"),
      item("post", "Publicar no feed", "fa-regular fa-pen-to-square", "/feed"),
    ],
  },
  manager: {
    primary: [
      item("manager-home", "Produções", "fa-solid fa-building", "/production/mine"),
      item("events-manage", "Eventos", "fa-solid fa-calendar-check", "/event/manage"),
      item("sales", "Vendas", "fa-solid fa-chart-line", "/producer/sales"),
      item("checkin", "Check-in", "fa-solid fa-qrcode", "/checkin"),
    ],
    secondary: [
      item("finance", "Financeiro", "fa-solid fa-wallet", "/producer/finance"),
      item("contracts", "Contratos", "fa-solid fa-file-signature", "/producer/contracts"),
      item("participant-view", "Ver como participante", "fa-regular fa-eye", "/feed"),
    ],
    quick: [
      item("create-event", "Criar evento", "fa-solid fa-calendar-plus", "/event/create"),
      item("create-ticket", "Criar ingresso", "fa-solid fa-ticket", "/ticket/create"),
      item("create-production", "Criar produção", "fa-solid fa-building-circle-arrow-right", "/production/create"),
    ],
  },
  artist: {
    primary: [
      item("artist-area", "Área do artista", "fa-solid fa-music", "/artist/manage"),
      item("events", "Eventos", "fa-regular fa-calendar-days", "/event"),
      item("feed", "Feed", "fa-solid fa-bolt", "/feed"),
      item("profile", "Perfil", "fa-regular fa-user", "/profile"),
    ],
    secondary: [item("artists", "Explorar artistas", "fa-solid fa-users", "/artists")],
    quick: [item("artist-manage", "Gerenciar carreira", "fa-solid fa-wand-magic-sparkles", "/artist/manage")],
  },
  promoter: {
    primary: [
      item("promoter-sales", "Vendas", "fa-solid fa-chart-line", "/producer/sales"),
      item("events", "Eventos", "fa-regular fa-calendar-days", "/event"),
      item("feed", "Feed", "fa-solid fa-bolt", "/feed"),
      item("profile", "Perfil", "fa-regular fa-user", "/profile"),
    ],
    secondary: [item("purchases", "Compras", "fa-solid fa-receipt", "/purchases")],
    quick: [item("promote", "Encontrar evento para divulgar", "fa-solid fa-bullhorn", "/event")],
  },
  agent: {
    primary: [
      item("agent", "Painel do agente", "fa-solid fa-user-tie", "/agent"),
      item("events", "Eventos", "fa-regular fa-calendar-days", "/event"),
      item("feed", "Feed", "fa-solid fa-bolt", "/feed"),
    ],
    secondary: [item("profile", "Perfil", "fa-regular fa-user", "/profile")],
    quick: [item("agent-home", "Abrir painel", "fa-solid fa-arrow-up-right-from-square", "/agent")],
  },
  admin: {
    primary: [
      item("admin", "Admin Center", "fa-solid fa-shield-halved", "/admin"),
      item("events-manage", "Eventos", "fa-solid fa-calendar-check", "/event/manage"),
      item("sales", "Vendas", "fa-solid fa-chart-line", "/producer/sales"),
      item("feed", "Feed", "fa-solid fa-bolt", "/feed"),
    ],
    secondary: [
      item("moderation", "Moderação", "fa-solid fa-user-shield", "/moderation/reports"),
      item("checkin", "Check-in", "fa-solid fa-qrcode", "/checkin"),
    ],
    quick: [
      item("admin-open", "Abrir Admin Center", "fa-solid fa-shield-halved", "/admin"),
      item("create-event", "Criar evento", "fa-solid fa-calendar-plus", "/event/create"),
    ],
  },
};

export const navigationForMode = (mode) => registry[mode] || registry.participant;

export const contextualNavigation = (pathname = "", mode = "participant") => {
  const eventMatch = pathname.match(/^\/event\/(?!create|manage)([^/]+)/);
  if (eventMatch && ["manager", "admin"].includes(mode)) {
    return {
      label: "Evento atual",
      items: [
        item("event-view", "Ver evento", "fa-regular fa-eye", pathname),
        item("event-sales", "Vendas", "fa-solid fa-chart-line", "/producer/sales"),
        item("event-checkin", "Check-in", "fa-solid fa-qrcode", "/checkin"),
      ],
    };
  }

  const productionMatch = pathname.match(/^\/production\/(\d+)/);
  if (productionMatch && ["manager", "admin"].includes(mode)) {
    const id = productionMatch[1];
    return {
      label: "Produção atual",
      items: [
        item("production-view", "Visão geral", "fa-solid fa-building", `/production/${id}`),
        item("production-agenda", "Agenda", "fa-regular fa-calendar", `/production/${id}/agenda`),
        item("create-event", "Novo evento", "fa-solid fa-calendar-plus", "/event/create"),
      ],
    };
  }

  return null;
};