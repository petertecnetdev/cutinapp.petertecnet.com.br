const finiteNonNegative = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const rate = (numerator, denominator) => denominator > 0 ? numerator / denominator : 0;

const normalizeAttributedCosts = (costs) => {
  if (!Array.isArray(costs)) return { total: 0, bySource: {} };

  return costs.reduce((summary, item = {}) => {
    const amount = finiteNonNegative(item.amount ?? item.cost ?? item.value);
    const source = String(item.source || item.type || "other").trim().toLowerCase() || "other";
    summary.total += amount;
    summary.bySource[source] = (summary.bySource[source] || 0) + amount;
    return summary;
  }, { total: 0, bySource: {} });
};

export function evaluateAddOnExperiment({
  baseline = {},
  variant = {},
  minimumOrdersPerArm = 20,
  minimumNetReturnOnIncrementalCost = 0,
} = {}) {
  const normalize = (arm) => {
    const paidOrders = finiteNonNegative(arm.paidOrders);
    const addOnOrders = Math.min(paidOrders, finiteNonNegative(arm.addOnOrders));
    const gmv = finiteNonNegative(arm.gmv);
    const netPlatformRevenue = finiteNonNegative(arm.netPlatformRevenue);
    const directExperimentCost = finiteNonNegative(arm.incrementalExperimentCost);
    const attributedCosts = normalizeAttributedCosts(arm.attributedCosts);
    const incrementalExperimentCost = directExperimentCost + attributedCosts.total;
    const contributionAfterExperimentCost = Math.max(0, netPlatformRevenue - incrementalExperimentCost);
    return {
      paidOrders,
      addOnOrders,
      gmv,
      netPlatformRevenue,
      directExperimentCost,
      attributedExperimentCost: attributedCosts.total,
      attributedCostsBySource: attributedCosts.bySource,
      incrementalExperimentCost,
      contributionAfterExperimentCost,
      attachmentRate: rate(addOnOrders, paidOrders),
      averageTicket: rate(gmv, paidOrders),
      netRevenuePerOrder: rate(netPlatformRevenue, paidOrders),
      experimentCostPerOrder: rate(incrementalExperimentCost, paidOrders),
      contributionAfterExperimentCostPerOrder: rate(contributionAfterExperimentCost, paidOrders),
      netTakeRate: rate(netPlatformRevenue, gmv),
      contributionTakeRateAfterExperimentCost: rate(contributionAfterExperimentCost, gmv),
    };
  };

  const control = normalize(baseline);
  const treatment = normalize(variant);
  const evidenceTarget = Math.max(1, finiteNonNegative(minimumOrdersPerArm));
  const minimumReturn = finiteNonNegative(minimumNetReturnOnIncrementalCost);
  const evidence = Math.min(1, Math.min(control.paidOrders, treatment.paidOrders) / evidenceTarget);
  const attachmentUplift = treatment.attachmentRate - control.attachmentRate;
  const ticketUplift = treatment.averageTicket - control.averageTicket;
  const netRevenuePerOrderUplift = treatment.netRevenuePerOrder - control.netRevenuePerOrder;
  const incrementalExperimentCostPerOrder = treatment.experimentCostPerOrder - control.experimentCostPerOrder;
  const contributionPerOrderUplift = treatment.contributionAfterExperimentCostPerOrder - control.contributionAfterExperimentCostPerOrder;
  const projectedIncrementalNetRevenueAtBaselineVolume = netRevenuePerOrderUplift * control.paidOrders;
  const projectedIncrementalContributionAtBaselineVolume = contributionPerOrderUplift * control.paidOrders;
  const projectedIncrementalExperimentCostAtBaselineVolume = incrementalExperimentCostPerOrder * control.paidOrders;
  const incrementalExperimentCost = treatment.incrementalExperimentCost - control.incrementalExperimentCost;
  const positiveProjectedIncrementalCost = Math.max(0, projectedIncrementalExperimentCostAtBaselineVolume);
  const netReturnOnIncrementalCost = positiveProjectedIncrementalCost > 0
    ? projectedIncrementalContributionAtBaselineVolume / positiveProjectedIncrementalCost
    : null;

  const baselineContributionTakeRate = control.contributionTakeRateAfterExperimentCost;
  const marginPreservingTreatmentCostPerOrderCap = Math.max(
    0,
    treatment.netRevenuePerOrder - (baselineContributionTakeRate * treatment.averageTicket),
  );
  const projectedBaselineExperimentCostAtBaselineVolume = control.experimentCostPerOrder * control.paidOrders;
  const projectedMarginPreservingTreatmentCostAtBaselineVolume = marginPreservingTreatmentCostPerOrderCap * control.paidOrders;
  const marginPreservingIncrementalCostCapAtBaselineVolume = Math.max(
    0,
    projectedMarginPreservingTreatmentCostAtBaselineVolume - projectedBaselineExperimentCostAtBaselineVolume,
  );
  const capitalEfficiencyIncrementalCostCapAtBaselineVolume = Math.max(
    0,
    projectedIncrementalNetRevenueAtBaselineVolume / (1 + minimumReturn),
  );
  const safeIncrementalCostCapAtBaselineVolume = Math.min(
    marginPreservingIncrementalCostCapAtBaselineVolume,
    capitalEfficiencyIncrementalCostCapAtBaselineVolume,
  );
  const remainingSafeIncrementalCostHeadroomAtBaselineVolume = Math.max(
    0,
    safeIncrementalCostCapAtBaselineVolume - positiveProjectedIncrementalCost,
  );
  const safeIncrementalCostOverrunAtBaselineVolume = Math.max(
    0,
    positiveProjectedIncrementalCost - safeIncrementalCostCapAtBaselineVolume,
  );

  const marginPreserved = treatment.contributionTakeRateAfterExperimentCost >= baselineContributionTakeRate;
  const capitalEfficiencyPreserved = positiveProjectedIncrementalCost === 0
    || netReturnOnIncrementalCost >= minimumReturn;
  const economicallyPositive = contributionPerOrderUplift > 0 && marginPreserved && capitalEfficiencyPreserved;

  return {
    baseline: control,
    variant: treatment,
    evidence,
    evidenceStatus: evidence >= 1 ? "sufficient" : "collecting",
    attachmentUplift,
    ticketUplift,
    netRevenuePerOrderUplift,
    contributionPerOrderUplift,
    incrementalExperimentCost,
    incrementalExperimentCostPerOrder,
    projectedIncrementalExperimentCostAtBaselineVolume,
    projectedIncrementalNetRevenueAtBaselineVolume,
    projectedIncrementalContributionAtBaselineVolume,
    netReturnOnIncrementalCost,
    minimumNetReturnOnIncrementalCost: minimumReturn,
    baselineContributionTakeRate,
    marginPreservingIncrementalCostCapAtBaselineVolume,
    capitalEfficiencyIncrementalCostCapAtBaselineVolume,
    safeIncrementalCostCapAtBaselineVolume,
    remainingSafeIncrementalCostHeadroomAtBaselineVolume,
    safeIncrementalCostOverrunAtBaselineVolume,
    marginPreserved,
    capitalEfficiencyPreserved,
    economicallyPositive,
    recommendation: evidence < 1 ? "collect_more_data" : (economicallyPositive ? "prefer_variant" : "keep_baseline"),
  };
}
