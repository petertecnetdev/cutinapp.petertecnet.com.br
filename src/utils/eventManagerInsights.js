const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const startOfDay = (value = new Date()) => {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const sameDay = (left, right) => startOfDay(left).getTime() === startOfDay(right).getTime();

export const EVENT_MANAGER_PREFERENCES_KEY = "cutinapp.eventManager.preferences.v3";
export const EVENT_MANAGER_PINS_KEY = "cutinapp.eventManager.pins.v1";

export const moneyBR = (value) => new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 2,
}).format(number(value));

export const eventOperationalMetrics = (event) => ({
  paidOrders: number(event?.operational_metrics?.paid_orders_count),
  pendingOrders: number(event?.operational_metrics?.pending_orders_count),
  grossSales: number(event?.operational_metrics?.gross_sales),
  grossSalesToday: number(event?.operational_metrics?.gross_sales_today),
  ticketsSold: number(event?.operational_metrics?.tickets_sold),
  passesIssued: number(event?.operational_metrics?.passes_issued),
  ticketCapacity: number(event?.operational_metrics?.ticket_capacity),
  ticketsRemaining: number(event?.operational_metrics?.tickets_remaining),
  sellThroughRate: number(event?.operational_metrics?.sell_through_rate),
  inventoryUtilizationRate: number(event?.operational_metrics?.inventory_utilization_rate),
  checkedIn: number(event?.operational_metrics?.checked_in_count),
  checkinRate: number(event?.operational_metrics?.checkin_rate),
  views: number(event?.operational_metrics?.views_count),
  conversionRate: number(event?.operational_metrics?.conversion_rate),
  agendaDays: Array.isArray(event?.operational_metrics?.agenda_days)
    ? event.operational_metrics.agenda_days.map((day) => number(day))
    : [],
  agendaActive: Boolean(event?.operational_metrics?.agenda_active),
  lastSaleAt: event?.operational_metrics?.last_sale_at || null,
});

export const eventHealth = (event) => {
  const metrics = eventOperationalMetrics(event);
  const hasBasics = Boolean(String(event?.title || "").trim() && event?.start_date && String(event?.venue || event?.address || "").trim());
  const hasImage = Boolean(event?.image || event?.production?.logo);
  const hasLocation = Boolean(event?.venue || event?.address || event?.city || event?.online_url);
  const hasTickets = number(event?.tickets_count) > 0;
  const hasSellableTickets = number(event?.available_tickets_count) > 0;
  const published = Boolean(event?.is_published && !event?.is_cancelled);

  let score = 0;
  if (hasBasics) score += 20;
  if (hasImage) score += 10;
  if (hasLocation) score += 10;
  if (hasTickets) score += 12;
  if (hasSellableTickets || event?.has_ended) score += 13;
  if (published || event?.has_ended) score += 15;
  if (metrics.views > 0 || event?.has_ended) score += 5;
  if (metrics.paidOrders > 0 || event?.has_ended) score += 10;
  if (metrics.agendaActive) score += 5;

  score = Math.max(0, Math.min(100, Math.round(score)));

  if (event?.is_cancelled) return { score, key: "cancelled", label: "Cancelado", tone: "secondary" };
  if (score >= 85) return { score, key: "excellent", label: "Saudável", tone: "success" };
  if (score >= 65) return { score, key: "good", label: "Bom", tone: "info" };
  if (score >= 45) return { score, key: "attention", label: "Atenção", tone: "warning" };
  return { score, key: "critical", label: "Incompleto", tone: "danger" };
};

const hoursUntil = (value) => {
  const timestamp = new Date(value || "").getTime();
  if (!Number.isFinite(timestamp)) return Number.POSITIVE_INFINITY;
  return (timestamp - Date.now()) / 3600000;
};

export const eventPerformance = (event) => {
  const metrics = eventOperationalMetrics(event);
  if (event?.is_cancelled) return { key: "cancelled", label: "Cancelado", tone: "secondary", rank: 90 };
  if (event?.has_ended || hoursUntil(event?.end_date) <= 0) return { key: "ended", label: "Encerrado", tone: "secondary", rank: 80 };

  if (metrics.ticketCapacity > 0 && metrics.ticketsRemaining === 0) {
    return { key: "sold_out", label: "Esgotado", tone: "success", rank: 5 };
  }
  if (metrics.inventoryUtilizationRate >= 85) {
    return { key: "almost_sold_out", label: "Quase esgotado", tone: "success", rank: 8 };
  }

  const until = hoursUntil(event?.start_date);
  if (event?.is_published && until <= 48 && until > 0 && metrics.ticketsSold === 0) {
    return { key: "critical", label: "Sem vendas perto do evento", tone: "danger", rank: 1 };
  }
  if (event?.is_published && metrics.views >= 20 && metrics.conversionRate < 1 && metrics.paidOrders === 0) {
    return { key: "low_conversion", label: "Baixa conversão", tone: "warning", rank: 2 };
  }
  if (event?.is_published && metrics.paidOrders === 0) {
    return { key: "no_sales", label: "Sem vendas", tone: "warning", rank: 3 };
  }
  if (metrics.paidOrders >= 5 || metrics.sellThroughRate >= 35 || metrics.conversionRate >= 4) {
    return { key: "strong", label: "Vendendo bem", tone: "success", rank: 20 };
  }
  if (metrics.paidOrders > 0) {
    return { key: "selling", label: "Com vendas", tone: "info", rank: 25 };
  }
  if (!event?.is_published) {
    return { key: "draft", label: "Ainda não publicado", tone: "secondary", rank: 10 };
  }
  return { key: "starting", label: "Começando", tone: "info", rank: 30 };
};

export const eventAlerts = (event) => {
  const alerts = [];
  const metrics = eventOperationalMetrics(event);
  const until = hoursUntil(event?.start_date);

  if (event?.is_cancelled || event?.has_ended || until <= 0) return alerts;

  if (until <= 24 && number(event?.available_tickets_count) === 0) {
    alerts.push({
      key: "no-ticket-near-event",
      tone: "danger",
      icon: "fa-solid fa-triangle-exclamation",
      title: "Evento em menos de 24h sem lote disponível",
      detail: "Crie ou reabra um lote para não perder vendas de última hora.",
    });
  } else if (event?.is_published && number(event?.available_tickets_count) === 0) {
    alerts.push({
      key: "published-no-ticket",
      tone: "warning",
      icon: "fa-solid fa-ticket",
      title: "Publicado sem ingresso disponível",
      detail: "O evento está no ar, mas não possui lote vendável.",
    });
  }

  if (event?.is_published && until <= 72 && metrics.ticketsSold === 0) {
    alerts.push({
      key: "near-no-sales",
      tone: "danger",
      icon: "fa-solid fa-chart-line",
      title: "Evento próximo sem vendas pagas",
      detail: "Revise preço, lotes e divulgação antes do horário do evento.",
    });
  } else if (event?.is_published && metrics.ticketsSold === 0) {
    alerts.push({
      key: "published-no-sales",
      tone: "warning",
      icon: "fa-solid fa-chart-line",
      title: "Publicado e ainda sem vendas",
      detail: "Acompanhe visualizações e compartilhe o link rastreável.",
    });
  }

  if (metrics.pendingOrders > 0) {
    alerts.push({
      key: "pending-orders",
      tone: "info",
      icon: "fa-regular fa-clock",
      title: `${metrics.pendingOrders} checkout(s) aguardando pagamento`,
      detail: "Há intenção de compra em andamento.",
    });
  }

  if (metrics.ticketCapacity > 0 && metrics.inventoryUtilizationRate >= 85 && metrics.ticketsRemaining > 0) {
    alerts.push({
      key: "almost-sold-out",
      tone: "success",
      icon: "fa-solid fa-fire",
      title: "Quase esgotado",
      detail: `Restam aproximadamente ${metrics.ticketsRemaining} ingresso(s) no estoque cadastrado.`,
    });
  }

  if (metrics.views >= 20 && metrics.paidOrders === 0) {
    alerts.push({
      key: "traffic-no-conversion",
      tone: "warning",
      icon: "fa-solid fa-eye",
      title: "Há interesse, mas pouca conversão",
      detail: `${metrics.views} visualizações registradas sem pedido pago.`,
    });
  }

  if (!event?.is_published && number(event?.available_tickets_count) > 0) {
    alerts.push({
      key: "ready-to-publish",
      tone: "info",
      icon: "fa-solid fa-rocket",
      title: "Pronto para publicar",
      detail: "O evento já possui lote disponível.",
    });
  }

  return alerts.slice(0, 3);
};

export const eventTemporalGroup = (event, now = new Date()) => {
  if (event?.is_cancelled) return { key: "cancelled", label: "Cancelados", order: 50 };

  const start = new Date(event?.start_date || "");
  const end = new Date(event?.end_date || event?.start_date || "");
  if (!Number.isFinite(start.getTime())) return { key: "undated", label: "Sem data definida", order: 45 };

  if (Number.isFinite(end.getTime()) && end.getTime() < now.getTime()) {
    return { key: "past", label: "Encerrados", order: 40 };
  }
  if (sameDay(start, now)) return { key: "today", label: "Hoje", order: 0 };

  const tomorrow = startOfDay(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (sameDay(start, tomorrow)) return { key: "tomorrow", label: "Amanhã", order: 5 };

  const sevenDays = startOfDay(now);
  sevenDays.setDate(sevenDays.getDate() + 7);
  if (start >= startOfDay(now) && start < sevenDays) {
    return { key: "week", label: "Nos próximos 7 dias", order: 10 };
  }

  return { key: "upcoming", label: "Próximos eventos", order: 20 };
};

export const smartEventRank = (event, pinned = false) => {
  const performance = eventPerformance(event);
  const health = eventHealth(event);
  const group = eventTemporalGroup(event);
  const time = new Date(event?.start_date || "").getTime();
  const safeTime = Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER;

  return [
    pinned ? 0 : 1,
    performance.rank,
    health.score < 45 ? 0 : health.score < 65 ? 1 : 2,
    group.order,
    safeTime,
  ];
};

export const compareSmartRanks = (left, right) => {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    if (a === b) continue;
    return a < b ? -1 : 1;
  }
  return 0;
};

export const weekdayShortLabel = (day) => ([
  "Dom",
  "Seg",
  "Ter",
  "Qua",
  "Qui",
  "Sex",
  "Sáb",
][number(day)] || "—");
