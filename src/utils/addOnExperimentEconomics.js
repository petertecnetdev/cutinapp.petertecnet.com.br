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
  const evidenceSampleMultiple = Math.min(control.paidOrders, treatment.paidOrders) / evidenceTarget;
  const evidence = Math.min(1, evidenceSampleMultiple);
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
    evidenceSampleMultiple,
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

export function recommendMonetizationBudgetAllocation({
  channels = [],
  availableIncrementalBudget = 0,
  maximumTotalCostMultipleFromObserved = 2,
  maximumEvidenceScaledCostMultipleFromObserved = 4,
  evidenceSampleMultipleForMaximumScale = 5,
  minimumStablePeriods = 2,
  minimumStablePeriodNetReturn = 0,
  maximumRecentReturnStandardDeviation = 0.5,
  minimumRecentReturnTrend = -0.1,
} = {}) {
  const budget = finiteNonNegative(availableIncrementalBudget);
  const defaultObservedCostMultiple = Math.max(1, finiteNonNegative(maximumTotalCostMultipleFromObserved));
  const defaultEvidenceScaledCostMultiple = Math.max(
    defaultObservedCostMultiple,
    finiteNonNegative(maximumEvidenceScaledCostMultipleFromObserved),
  );
  const sampleMultipleForMaximumScale = Math.max(1, finiteNonNegative(evidenceSampleMultipleForMaximumScale));
  const defaultMinimumStablePeriods = Math.max(1, Math.floor(finiteNonNegative(minimumStablePeriods)));
  const defaultMinimumStablePeriodReturn = finiteNonNegative(minimumStablePeriodNetReturn);
  const defaultMaximumRecentReturnStandardDeviation = finiteNonNegative(maximumRecentReturnStandardDeviation);
  const parsedMinimumRecentReturnTrend = Number(minimumRecentReturnTrend);
  const defaultMinimumRecentReturnTrend = Number.isFinite(parsedMinimumRecentReturnTrend)
    ? parsedMinimumRecentReturnTrend
    : -0.1;
  let remainingBudget = budget;

  const normalizedChannels = (Array.isArray(channels) ? channels : []).map((item = {}, index) => {
    const economics = item.economics || item.analysis || item;
    const source = String(item.source || item.channel || item.name || `channel_${index + 1}`).trim().toLowerCase();
    const projectedContribution = finiteNonNegative(economics.projectedIncrementalContributionAtBaselineVolume);
    const projectedCost = finiteNonNegative(economics.projectedIncrementalExperimentCostAtBaselineVolume);
    const headroom = finiteNonNegative(economics.remainingSafeIncrementalCostHeadroomAtBaselineVolume);
    const configuredObservedCostMultiple = item.maximumTotalCostMultipleFromObserved
      ?? economics.maximumTotalCostMultipleFromObserved
      ?? defaultObservedCostMultiple;
    const baseObservedCostMultiple = Math.max(1, finiteNonNegative(configuredObservedCostMultiple));
    const configuredEvidenceScaledCostMultiple = item.maximumEvidenceScaledCostMultipleFromObserved
      ?? economics.maximumEvidenceScaledCostMultipleFromObserved
      ?? defaultEvidenceScaledCostMultiple;
    const evidenceScaledCostMultipleCap = Math.max(
      baseObservedCostMultiple,
      finiteNonNegative(configuredEvidenceScaledCostMultiple),
    );
    const rawEvidenceSampleMultiple = Number(economics.evidenceSampleMultiple);
    const hasEvidenceStrength = Number.isFinite(rawEvidenceSampleMultiple) && rawEvidenceSampleMultiple >= 1;
    const evidenceSampleMultiple = hasEvidenceStrength ? rawEvidenceSampleMultiple : null;
    const scaleProgress = hasEvidenceStrength && sampleMultipleForMaximumScale > 1
      ? Math.min(1, Math.max(0, (evidenceSampleMultiple - 1) / (sampleMultipleForMaximumScale - 1)))
      : 0;
    const observedCostMultiple = baseObservedCostMultiple
      + ((evidenceScaledCostMultipleCap - baseObservedCostMultiple) * scaleProgress);
    const evidenceBoundIncrementalBudgetCap = projectedCost * Math.max(0, observedCostMultiple - 1);
    const scalableSafeHeadroom = Math.min(headroom, evidenceBoundIncrementalBudgetCap);
    const roi = Number(economics.netReturnOnIncrementalCost);
    const netReturnOnIncrementalCost = Number.isFinite(roi) ? roi : null;
    const evidenceStatus = economics.evidenceStatus || "collecting";
    const economicallyPositive = economics.economicallyPositive === true;

    const rawPeriods = item.recentPerformancePeriods ?? economics.recentPerformancePeriods;
    const temporalStabilityProvided = Array.isArray(rawPeriods) && rawPeriods.length > 0;
    const channelMinimumStablePeriods = Math.max(
      1,
      Math.floor(finiteNonNegative(item.minimumStablePeriods ?? economics.minimumStablePeriods ?? defaultMinimumStablePeriods)),
    );
    const channelMinimumStablePeriodReturn = finiteNonNegative(
      item.minimumStablePeriodNetReturn
        ?? economics.minimumStablePeriodNetReturn
        ?? defaultMinimumStablePeriodReturn,
    );
    const channelMaximumRecentReturnStandardDeviation = finiteNonNegative(
      item.maximumRecentReturnStandardDeviation
        ?? economics.maximumRecentReturnStandardDeviation
        ?? defaultMaximumRecentReturnStandardDeviation,
    );
    const rawMinimumRecentReturnTrend = Number(
      item.minimumRecentReturnTrend
        ?? economics.minimumRecentReturnTrend
        ?? defaultMinimumRecentReturnTrend,
    );
    const channelMinimumRecentReturnTrend = Number.isFinite(rawMinimumRecentReturnTrend)
      ? rawMinimumRecentReturnTrend
      : defaultMinimumRecentReturnTrend;
    const normalizedPeriods = temporalStabilityProvided
      ? rawPeriods.map((period = {}) => {
        const periodReturn = Number(period.netReturnOnIncrementalCost ?? period.roi ?? period.netReturn);
        return {
          netReturnOnIncrementalCost: Number.isFinite(periodReturn) ? periodReturn : null,
          economicallyPositive: period.economicallyPositive !== false,
        };
      })
      : [];
    const recentStablePeriods = normalizedPeriods.slice(-channelMinimumStablePeriods);
    const hasEnoughStablePeriods = recentStablePeriods.length >= channelMinimumStablePeriods;
    const validRecentReturns = recentStablePeriods
      .map((period) => period.netReturnOnIncrementalCost)
      .filter((value) => value !== null);
    const recentReturnMean = validRecentReturns.length > 0
      ? validRecentReturns.reduce((sum, value) => sum + value, 0) / validRecentReturns.length
      : null;
    const recentReturnStandardDeviation = validRecentReturns.length > 0
      ? Math.sqrt(validRecentReturns.reduce((sum, value) => sum + ((value - recentReturnMean) ** 2), 0) / validRecentReturns.length)
      : null;
    const recentReturnTrend = validRecentReturns.length > 1
      ? (validRecentReturns[validRecentReturns.length - 1] - validRecentReturns[0]) / (validRecentReturns.length - 1)
      : null;
    const returnVolatilityWithinLimit = !hasEnoughStablePeriods
      || (recentReturnStandardDeviation !== null
        && recentReturnStandardDeviation <= channelMaximumRecentReturnStandardDeviation);
    const returnTrendPreserved = !hasEnoughStablePeriods
      || (recentReturnTrend === null || recentReturnTrend >= channelMinimumRecentReturnTrend);
    const periodReturnFloorPreserved = !temporalStabilityProvided || (
      hasEnoughStablePeriods
      && recentStablePeriods.every((period) => (
        period.economicallyPositive
        && period.netReturnOnIncrementalCost !== null
        && period.netReturnOnIncrementalCost >= channelMinimumStablePeriodReturn
      ))
    );
    const temporalStabilityPreserved = periodReturnFloorPreserved
      && returnVolatilityWithinLimit
      && returnTrendPreserved;
    const temporalStabilityStatus = !temporalStabilityProvided
      ? "not_provided"
      : (!hasEnoughStablePeriods ? "collecting" : (temporalStabilityPreserved ? "stable" : "unstable"));

    const eligibleForPaidBudget = evidenceStatus === "sufficient"
      && economicallyPositive
      && temporalStabilityPreserved
      && scalableSafeHeadroom > 0
      && projectedContribution > 0
      && projectedCost > 0
      && netReturnOnIncrementalCost !== null;

    const temporalExclusionReason = !hasEnoughStablePeriods
      ? "insufficient_temporal_evidence"
      : (!periodReturnFloorPreserved
        ? "unstable_recent_performance"
        : (!returnVolatilityWithinLimit
          ? "volatile_recent_performance"
          : (!returnTrendPreserved ? "declining_recent_performance" : null)));

    return {
      source,
      projectedIncrementalContributionAtBaselineVolume: projectedContribution,
      projectedIncrementalExperimentCostAtBaselineVolume: projectedCost,
      remainingSafeIncrementalCostHeadroomAtBaselineVolume: headroom,
      baseMaximumTotalCostMultipleFromObserved: baseObservedCostMultiple,
      maximumTotalCostMultipleFromObserved: observedCostMultiple,
      maximumEvidenceScaledCostMultipleFromObserved: evidenceScaledCostMultipleCap,
      evidenceSampleMultiple,
      evidenceScaleProgress: scaleProgress,
      evidenceBoundIncrementalBudgetCap,
      scalableSafeHeadroom,
      netReturnOnIncrementalCost,
      evidenceStatus,
      economicallyPositive,
      temporalStabilityProvided,
      temporalStabilityStatus,
      temporalStabilityPreserved,
      minimumStablePeriods: channelMinimumStablePeriods,
      minimumStablePeriodNetReturn: channelMinimumStablePeriodReturn,
      maximumRecentReturnStandardDeviation: channelMaximumRecentReturnStandardDeviation,
      minimumRecentReturnTrend: channelMinimumRecentReturnTrend,
      recentReturnMean,
      recentReturnStandardDeviation,
      recentReturnTrend,
      returnVolatilityWithinLimit,
      returnTrendPreserved,
      evaluatedStablePeriods: recentStablePeriods.length,
      eligibleForPaidBudget,
      suggestedIncrementalBudget: 0,
      exclusionReason: eligibleForPaidBudget
        ? null
        : (evidenceStatus !== "sufficient"
          ? "insufficient_evidence"
          : (!economicallyPositive
            ? "not_economically_positive"
            : (!temporalStabilityPreserved
              ? temporalExclusionReason
              : (headroom <= 0
                ? "no_safe_headroom"
                : (evidenceBoundIncrementalBudgetCap <= 0
                  ? "no_evidence_bound_headroom"
                  : (projectedCost <= 0 ? "no_paid_budget_required" : "missing_return_signal"))))),
    };
  });

  const ranked = normalizedChannels
    .filter((channel) => channel.eligibleForPaidBudget)
    .sort((a, b) => {
      if (b.netReturnOnIncrementalCost !== a.netReturnOnIncrementalCost) {
        return b.netReturnOnIncrementalCost - a.netReturnOnIncrementalCost;
      }
      if (b.projectedIncrementalContributionAtBaselineVolume !== a.projectedIncrementalContributionAtBaselineVolume) {
        return b.projectedIncrementalContributionAtBaselineVolume - a.projectedIncrementalContributionAtBaselineVolume;
      }
      return a.source.localeCompare(b.source);
    });

  const allocationBySource = {};
  ranked.forEach((channel) => {
    if (remainingBudget <= 0) return;
    const suggestedIncrementalBudget = Math.min(
      remainingBudget,
      channel.scalableSafeHeadroom,
    );
    channel.suggestedIncrementalBudget = suggestedIncrementalBudget;
    allocationBySource[channel.source] = suggestedIncrementalBudget;
    remainingBudget -= suggestedIncrementalBudget;
  });

  const rankedBySource = new Map(ranked.map((channel) => [channel.source, channel]));
  const recommendations = normalizedChannels
    .map((channel) => rankedBySource.get(channel.source) || channel)
    .sort((a, b) => {
      if (a.eligibleForPaidBudget !== b.eligibleForPaidBudget) return a.eligibleForPaidBudget ? -1 : 1;
      if (a.eligibleForPaidBudget && b.eligibleForPaidBudget) {
        return ranked.findIndex((candidate) => candidate.source === a.source)
          - ranked.findIndex((candidate) => candidate.source === b.source);
      }
      return a.source.localeCompare(b.source);
    });

  const allocatedBudget = budget - remainingBudget;

  return {
    decisionSupportOnly: true,
    availableIncrementalBudget: budget,
    maximumTotalCostMultipleFromObserved: defaultObservedCostMultiple,
    maximumEvidenceScaledCostMultipleFromObserved: defaultEvidenceScaledCostMultiple,
    evidenceSampleMultipleForMaximumScale: sampleMultipleForMaximumScale,
    minimumStablePeriods: defaultMinimumStablePeriods,
    minimumStablePeriodNetReturn: defaultMinimumStablePeriodReturn,
    maximumRecentReturnStandardDeviation: defaultMaximumRecentReturnStandardDeviation,
    minimumRecentReturnTrend: defaultMinimumRecentReturnTrend,
    allocatedBudget,
    unallocatedBudget: remainingBudget,
    allocationBySource,
    recommendations,
  };
}
