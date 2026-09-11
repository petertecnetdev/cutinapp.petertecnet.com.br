const INVALID_STATUSES = new Set(["cancelled", "refunded", "charged_back"]);

export const PASS_FILTERS = [
  ["all", "Todos"],
  ["upcoming", "Próximos"],
  ["today", "Hoje"],
  ["past", "Anteriores"],
  ["transferred", "Transferidos"],
  ["cancelled", "Cancelados"],
  ["refunded", "Reembolsados"],
  ["pending", "Pagamento pendente"],
];

export const money = (value) => Number(value || 0).toLocaleString("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export const dateTime = (value) => {
  if (!value) return "Data não informada";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data não informada";
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

export const dayLabel = (value) => {
  if (!value) return "Sem data";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(date);
};

const startOfLocalDay = (value) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

export const eventMoment = (event, nowMs = Date.now()) => {
  if (!event) return "unknown";
  if (event.is_cancelled) return "cancelled";
  const startMs = Date.parse(event.start_date || "");
  const endMs = Date.parse(event.end_date || "");
  if (Number.isFinite(startMs) && startOfLocalDay(startMs) === startOfLocalDay(nowMs)) {
    if (!Number.isFinite(endMs) || endMs >= nowMs) return "today";
  }
  if (Number.isFinite(endMs) && endMs < nowMs) return "past";
  if (Number.isFinite(startMs) && startMs <= nowMs && (!Number.isFinite(endMs) || endMs >= nowMs)) return "ongoing";
  if (Number.isFinite(startMs) && startMs > nowMs) return "upcoming";
  return "unknown";
};

export const countdownLabel = (event, nowMs = Date.now()) => {
  const startMs = Date.parse(event?.start_date || "");
  if (!Number.isFinite(startMs)) return "";
  const diff = startMs - nowMs;
  const hours = Math.ceil(diff / 3600000);
  const days = Math.ceil(diff / 86400000);
  if (diff <= 0) {
    const moment = eventMoment(event, nowMs);
    return moment === "ongoing" || moment === "today" ? "Acontecendo agora" : "";
  }
  if (hours <= 24) return hours <= 1 ? "Começa em menos de 1 hora" : `Começa em ${hours} horas`;
  if (days === 1) return "É amanhã";
  if (days <= 7) return `Faltam ${days} dias`;
  return "";
};

export const passState = (pass, nowMs = Date.now()) => {
  const status = String(pass?.status || "").toLowerCase();
  const moment = eventMoment(pass?.event, nowMs);
  if (status === "refunded") return { key: "refunded", label: "Reembolsado", variant: "info" };
  if (status === "charged_back") return { key: "cancelled", label: "Pagamento contestado", variant: "danger" };
  if (status === "cancelled" || moment === "cancelled") return { key: "cancelled", label: "Cancelado", variant: "danger" };
  if (pass?.checked_in_at || status === "checked_in") return { key: "used", label: "Utilizado", variant: "secondary" };
  if (moment === "past") return { key: "past", label: "Evento encerrado", variant: "secondary" };
  if (moment === "ongoing" || moment === "today") return { key: "today", label: "Use agora", variant: "success" };
  return { key: "upcoming", label: "Válido", variant: "success" };
};

export const lifecycleAction = (pass, nowMs = Date.now()) => {
  const state = passState(pass, nowMs);
  if (state.key === "refunded") return { icon: "fa-solid fa-money-bill-transfer", label: "Ver compra", type: "purchase" };
  if (state.key === "cancelled") return { icon: "fa-solid fa-circle-info", label: "Ver situação", type: "detail" };
  if (state.key === "today") return { icon: "fa-solid fa-qrcode", label: "Abrir QR para entrada", type: "detail" };
  if (state.key === "past" || state.key === "used") return { icon: "fa-solid fa-photo-film", label: "Reviva este evento", type: "event" };
  return { icon: "fa-solid fa-ticket", label: "Abrir ingresso", type: "detail" };
};

export const isTransferable = (pass, nowMs = Date.now()) => {
  if (pass?.wallet_state && typeof pass.wallet_state.transferable === "boolean") return pass.wallet_state.transferable;
  const state = passState(pass, nowMs);
  return !["cancelled", "refunded", "used", "past"].includes(state.key);
};

export const searchableText = (item) => {
  const data = item?.data || {};
  const event = data.event || {};
  const ticket = data.ticket || {};
  const production = event.production || data.production || {};
  const purchase = data.purchase || {};
  return [
    event.title, event.city, event.uf, event.venue, event.address, event.formatted_address,
    ticket.name, ticket.type, ticket.ticket_type, production.name,
    data.holder_name, data.holder_email, data.recipient_name, data.recipient_email,
    data.reference, data.id, data.pass_id, purchase.public_id,
  ].filter(Boolean).join(" ").toLowerCase();
};

export const itemFilterKey = (item, nowMs = Date.now()) => {
  if (item.kind === "pending") return "pending";
  if (item.kind === "transfer") return "transferred";
  return passState(item.data, nowMs).key;
};

export const matchesWalletFilter = (item, filter, nowMs = Date.now()) => {
  if (filter === "all") return true;
  const key = itemFilterKey(item, nowMs);
  if (filter === "today") return key === "today";
  if (filter === "upcoming") return key === "upcoming";
  if (filter === "past") return key === "past" || key === "used";
  return key === filter;
};

export const itemStartMs = (item) => {
  const value = item?.data?.event?.start_date || item?.data?.created_at || item?.data?.transferred_at;
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
};

export const sortWalletItems = (items, sort = "nearest", nowMs = Date.now()) => [...items].sort((left, right) => {
  if (sort === "newest") {
    const leftCreated = Date.parse(left?.data?.created_at || left?.data?.transferred_at || "") || 0;
    const rightCreated = Date.parse(right?.data?.created_at || right?.data?.transferred_at || "") || 0;
    return rightCreated - leftCreated;
  }
  if (sort === "name") {
    return String(left?.data?.event?.title || "").localeCompare(String(right?.data?.event?.title || ""), "pt-BR");
  }
  const leftStart = itemStartMs(left);
  const rightStart = itemStartMs(right);
  const leftFuture = leftStart >= nowMs;
  const rightFuture = rightStart >= nowMs;
  if (leftFuture !== rightFuture) return leftFuture ? -1 : 1;
  return leftFuture ? leftStart - rightStart : rightStart - leftStart;
});

export const walletCounts = (items, nowMs = Date.now()) => PASS_FILTERS.reduce((acc, [key]) => {
  acc[key] = items.filter((item) => matchesWalletFilter(item, key, nowMs)).length;
  return acc;
}, {});

export const groupPassItems = (items) => {
  const groups = [];
  const index = new Map();
  items.forEach((item) => {
    if (item.kind !== "pass") {
      groups.push({ key: `${item.kind}-${item.data?.id || item.data?.public_id}`, kind: item.kind, items: [item], data: item.data });
      return;
    }
    const pass = item.data;
    const key = [
      "pass",
      pass?.event?.id || "event",
      pass?.purchase?.public_id || "no-order",
      pass?.ticket?.id || "ticket",
    ].join(":");
    if (!index.has(key)) {
      const group = { key, kind: "pass-group", items: [], data: pass };
      index.set(key, group);
      groups.push(group);
    }
    index.get(key).items.push(item);
  });
  return groups;
};

export const eventShareUrl = (event) => {
  if (typeof window === "undefined" || !event?.slug) return "";
  return `${window.location.origin}/event/${encodeURIComponent(event.slug)}`;
};

export const mapsUrl = (event) => {
  if (event?.google_maps_url) return event.google_maps_url;
  const query = [event?.formatted_address, event?.address, event?.venue, event?.city, event?.uf].filter(Boolean).join(", ");
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : "";
};

export const shouldShowPrice = (pass) => pass?.purchase?.line_unit_price != null || pass?.ticket?.price != null;

export { INVALID_STATUSES };
