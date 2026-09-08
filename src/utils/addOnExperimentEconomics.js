const finiteNonNegative = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const rate = (numerator, denominator) => denominator > 0 ? numerator / denominator : 0;

export function evaluateAddOnExperiment({ baseline = {}, variant = {}, minimumOrdersPerArm = 20 } = {}) {
  const normalize = (arm) => {
    const paidOrders = finiteNonNegative(arm.paidOrders);
    const addOnOrders = Math.min(paidOrders, finiteNonNegative(arm.addOnOrders));
    const gmv = finiteNonNegative(arm.gmv);
    const netPlatformRevenue = finiteNonNegative(arm.netPlatformRevenue);
    return {
      paidOrders,
      addOnOrders,
      gmv,
      netPlatformRevenue,
      attachmentRate: rate(addOnOrders, paidOrders),
      averageTicket: rate(gmv, paidOrders),
      netRevenuePerOrder: rate(netPlatformRevenue, paidOrders),
      netTakeRate: rate(netPlatformRevenue, gmv),
    };
  };

  const control = normalize(baseline);
  const treatment = normalize(variant);
  const evidenceTarget = Math.max(1, finiteNonNegative(minimumOrdersPerArm));
  const evidence = Math.min(1, Math.min(control.paidOrders, treatment.paidOrders) / evidenceTarget);
  const attachmentUplift = treatment.attachmentRate - control.attachmentRate;
  const ticketUplift = treatment.averageTicket - control.averageTicket;
  const netRevenuePerOrderUplift = treatment.netRevenuePerOrder - control.netRevenuePerOrder;
  const projectedIncrementalNetRevenueAtBaselineVolume = netRevenuePerOrderUplift * control.paidOrders;
  const marginPreserved = treatment.netTakeRate >= control.netTakeRate;
  const economicallyPositive = netRevenuePerOrderUplift > 0 && marginPreserved;

  return {
    baseline: control,
    variant: treatment,
    evidence,
    evidenceStatus: evidence >= 1 ? "sufficient" : "collecting",
    attachmentUplift,
    ticketUplift,
    netRevenuePerOrderUplift,
    projectedIncrementalNetRevenueAtBaselineVolume,
    marginPreserved,
    economicallyPositive,
    recommendation: evidence < 1 ? "collect_more_data" : (economicallyPositive ? "prefer_variant" : "keep_baseline"),
  };
}
