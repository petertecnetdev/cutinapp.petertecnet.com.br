const amount = (value) => {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? number : 0;
};

const timestamp = (value) => {
  const parsed = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

export function estimatePendingRevenueOpportunity({ orders = [], fallbackTakeRate = 0, now = Date.now(), freshWindowHours = 24 } = {}) {
  const normalizedTakeRate = Math.max(0, Number(fallbackTakeRate || 0));
  const normalizedNow = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const freshWindowMs = Math.max(0, Number(freshWindowHours || 0)) * 60 * 60 * 1000;
  const grouped = new Map();
  let pendingGmv = 0;
  let estimatedPlatformRevenue = 0;
  let pendingCount = 0;
  let freshPendingGmv = 0;
  let freshEstimatedPlatformRevenue = 0;
  let freshPendingCount = 0;
  let stalePendingGmv = 0;
  let stalePendingCount = 0;
  let unknownAgeCount = 0;

  orders.filter((order) => order?.status === "pending").forEach((order) => {
    const total = amount(order.total);
    if (total <= 0) return;

    const explicitFee = amount(order.platform_fee);
    const estimatedFee = explicitFee > 0 ? explicitFee : total * (normalizedTakeRate / 100);
    const createdAt = timestamp(order.created_at || order.createdAt);
    const ageMs = createdAt === null ? null : Math.max(0, normalizedNow - createdAt);
    const isFresh = ageMs !== null && ageMs <= freshWindowMs;
    const isStale = ageMs !== null && ageMs > freshWindowMs;
    const eventId = String(order.event?.id || order.event_id || order.event?.title || "evento");
    const current = grouped.get(eventId) || {
      id: eventId,
      title: order.event?.title || "Evento",
      pendingCount: 0,
      pendingGmv: 0,
      estimatedPlatformRevenue: 0,
      freshPendingCount: 0,
      freshPendingGmv: 0,
      freshEstimatedPlatformRevenue: 0,
      stalePendingCount: 0,
      stalePendingGmv: 0,
      unknownAgeCount: 0,
    };

    pendingCount += 1;
    pendingGmv += total;
    estimatedPlatformRevenue += estimatedFee;
    current.pendingCount += 1;
    current.pendingGmv += total;
    current.estimatedPlatformRevenue += estimatedFee;

    if (isFresh) {
      freshPendingCount += 1;
      freshPendingGmv += total;
      freshEstimatedPlatformRevenue += estimatedFee;
      current.freshPendingCount += 1;
      current.freshPendingGmv += total;
      current.freshEstimatedPlatformRevenue += estimatedFee;
    } else if (isStale) {
      stalePendingCount += 1;
      stalePendingGmv += total;
      current.stalePendingCount += 1;
      current.stalePendingGmv += total;
    } else {
      unknownAgeCount += 1;
      current.unknownAgeCount += 1;
    }

    grouped.set(eventId, current);
  });

  return {
    pendingCount,
    pendingGmv,
    estimatedPlatformRevenue,
    freshWindowHours: Math.max(0, Number(freshWindowHours || 0)),
    freshPendingCount,
    freshPendingGmv,
    freshEstimatedPlatformRevenue,
    stalePendingCount,
    stalePendingGmv,
    unknownAgeCount,
    events: Array.from(grouped.values())
      .sort((a, b) => b.freshEstimatedPlatformRevenue - a.freshEstimatedPlatformRevenue || b.estimatedPlatformRevenue - a.estimatedPlatformRevenue || b.pendingGmv - a.pendingGmv),
  };
}
