const amount = (value) => {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? number : 0;
};

export function estimatePendingRevenueOpportunity({ orders = [], fallbackTakeRate = 0 } = {}) {
  const normalizedTakeRate = Math.max(0, Number(fallbackTakeRate || 0));
  const grouped = new Map();
  let pendingGmv = 0;
  let estimatedPlatformRevenue = 0;
  let pendingCount = 0;

  orders.filter((order) => order?.status === "pending").forEach((order) => {
    const total = amount(order.total);
    if (total <= 0) return;

    const explicitFee = amount(order.platform_fee);
    const estimatedFee = explicitFee > 0 ? explicitFee : total * (normalizedTakeRate / 100);
    const eventId = String(order.event?.id || order.event_id || order.event?.title || "evento");
    const current = grouped.get(eventId) || {
      id: eventId,
      title: order.event?.title || "Evento",
      pendingCount: 0,
      pendingGmv: 0,
      estimatedPlatformRevenue: 0,
    };

    pendingCount += 1;
    pendingGmv += total;
    estimatedPlatformRevenue += estimatedFee;
    current.pendingCount += 1;
    current.pendingGmv += total;
    current.estimatedPlatformRevenue += estimatedFee;
    grouped.set(eventId, current);
  });

  return {
    pendingCount,
    pendingGmv,
    estimatedPlatformRevenue,
    events: Array.from(grouped.values())
      .sort((a, b) => b.estimatedPlatformRevenue - a.estimatedPlatformRevenue || b.pendingGmv - a.pendingGmv),
  };
}
