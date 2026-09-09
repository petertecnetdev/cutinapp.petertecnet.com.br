import { recommendRiskAdjustedMonetizationBudgetAllocation } from "./riskAdjustedMonetizationBudget";

const finiteNonNegative = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const finite = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const sourceKey = (item = {}, index = 0) => (
  String(item.source || item.channel || item.name || `channel_${index + 1}`).trim().toLowerCase()
);

export function buildMarginalPerformanceHistoryFromAnalytics(rows = []) {
  const input = Array.isArray(rows) ? rows : [];

  return input
    .map((row = {}, historyIndex) => {
      const incrementalCost = finiteNonNegative(
        row.incrementalCost
          ?? row.incremental_cost
          ?? row.cost
          ?? row.spend
          ?? row.attributedCost
          ?? row.attributed_cost,
      );
      const incrementalGmv = finiteNonNegative(
        row.incrementalGmv
          ?? row.incremental_gmv
          ?? row.gmv
          ?? row.grossMerchandiseValue
          ?? row.gross_merchandise_value,
      );
      const incrementalNetRevenue = finiteNonNegative(
        row.incrementalNetRevenue
          ?? row.incremental_net_revenue
          ?? row.netRevenue
          ?? row.net_revenue
          ?? row.platformNetRevenue
          ?? row.platform_net_revenue,
      );

      const explicitContribution = Number(
        row.incrementalContribution
          ?? row.incremental_contribution
          ?? row.contribution
          ?? row.netContribution
          ?? row.net_contribution,
      );
      const contribution = Number.isFinite(explicitContribution)
        ? explicitContribution
        : incrementalNetRevenue - incrementalCost;

      if (incrementalCost <= 0 || !Number.isFinite(contribution)) return null;

      return {
        historyIndex,
        period: row.period ?? row.bucket ?? row.window ?? null,
        incrementalBudgetCapacity: incrementalCost,
        incrementalCost,
        incrementalGmv,
        incrementalNetRevenue,
        incrementalContribution: contribution,
        netReturnOnIncrementalCost: contribution / incrementalCost,
        observedFromAnalytics: true,
      };
    })
    .filter(Boolean);
}

const deriveHistoricalBands = (original = {}, channel = {}) => {
  const rawHistory = Array.isArray(original.marginalPerformanceHistory)
    ? original.marginalPerformanceHistory
    : Array.isArray(original.historicalMarginalPerformance)
      ? original.historicalMarginalPerformance
      : Array.isArray(original.realizedAnalyticsHistory)
        ? buildMarginalPerformanceHistoryFromAnalytics(original.realizedAnalyticsHistory)
        : Array.isArray(original.analyticsHistory)
          ? buildMarginalPerformanceHistoryFromAnalytics(original.analyticsHistory)
          : [];

  const totalRiskPenalty = finiteNonNegative(channel.volatilityPenalty)
    + finiteNonNegative(channel.decliningTrendPenalty);

  return rawHistory
    .map((observation = {}, historyIndex) => {
      const capacity = finiteNonNegative(
        observation.incrementalBudgetCapacity
          ?? observation.incrementalBudget
          ?? observation.incrementalCost
          ?? observation.cost,
      );
      const rawReturn = Number(
        observation.marginalNetReturnOnIncrementalCost
          ?? observation.netReturnOnIncrementalCost
          ?? observation.marginalReturn,
      );

      if (capacity <= 0 || !Number.isFinite(rawReturn)) return null;

      return {
        historyIndex,
        capacity,
        rawReturn,
        marginalRiskAdjustedNetReturn: rawReturn - totalRiskPenalty,
        incrementalGmv: finiteNonNegative(observation.incrementalGmv),
        incrementalNetRevenue: finiteNonNegative(observation.incrementalNetRevenue),
        incrementalContribution: Number.isFinite(Number(observation.incrementalContribution))
          ? Number(observation.incrementalContribution)
          : null,
        observedFromAnalytics: observation.observedFromAnalytics === true,
        period: observation.period ?? null,
      };
    })
    .filter(Boolean);
};

export function recommendMarginalMonetizationBudgetAllocation({
  channels = [],
  availableIncrementalBudget = 0,
  ...guardrails
} = {}) {
  const budget = finiteNonNegative(availableIncrementalBudget);
  const inputChannels = Array.isArray(channels) ? channels : [];
  const channelBySource = new Map(
    inputChannels.map((item, index) => [sourceKey(item, index), item]),
  );

  const normalized = recommendRiskAdjustedMonetizationBudgetAllocation({
    channels: inputChannels,
    availableIncrementalBudget: 0,
    ...guardrails,
  });

  const tranches = [];

  normalized.recommendations.forEach((channel) => {
    if (!channel.eligibleForPaidBudget || channel.riskAdjustedNetReturn <= 0) return;

    const original = channelBySource.get(channel.source) || {};
    const explicitBands = Array.isArray(original.marginalReturnBands)
      ? original.marginalReturnBands
      : [];
    const historicalBands = explicitBands.length === 0
      ? deriveHistoricalBands(original, channel)
      : [];
    const effectiveBands = explicitBands.length > 0 ? explicitBands : historicalBands;
    const bandsSource = explicitBands.length > 0
      ? "explicit"
      : historicalBands.length > 0
        ? historicalBands.some((band) => band.observedFromAnalytics)
          ? "central_analytics"
          : "observed_history"
        : "observed_channel_return";
    const maximumChannelBudget = finiteNonNegative(channel.scalableSafeHeadroom);
    let remainingChannelCapacity = maximumChannelBudget;

    if (effectiveBands.length === 0) {
      tranches.push({
        source: channel.source,
        bandIndex: 0,
        capacity: maximumChannelBudget,
        marginalRiskAdjustedNetReturn: channel.riskAdjustedNetReturn,
        baseRiskAdjustedNetReturn: channel.riskAdjustedNetReturn,
        modeledFromObservedReturn: true,
        bandsSource,
      });
      return;
    }

    effectiveBands.forEach((band = {}, bandIndex) => {
      if (remainingChannelCapacity <= 0) return;
      const requestedCapacity = finiteNonNegative(
        band.incrementalBudgetCapacity ?? band.budgetCapacity ?? band.capacity,
      );
      const capacity = Math.min(remainingChannelCapacity, requestedCapacity);
      if (capacity <= 0) return;

      const directReturn = Number(
        band.marginalRiskAdjustedNetReturn
          ?? band.riskAdjustedNetReturn
          ?? band.netReturnOnIncrementalCost,
      );
      const multiplier = finite(band.returnMultiplier, 1);
      const marginalRiskAdjustedNetReturn = Number.isFinite(directReturn)
        ? directReturn
        : channel.riskAdjustedNetReturn * Math.max(0, multiplier);

      tranches.push({
        source: channel.source,
        bandIndex,
        capacity,
        marginalRiskAdjustedNetReturn,
        baseRiskAdjustedNetReturn: channel.riskAdjustedNetReturn,
        modeledFromObservedReturn: !Number.isFinite(directReturn),
        bandsSource,
        historyIndex: Number.isInteger(band.historyIndex) ? band.historyIndex : null,
        rawHistoricalNetReturn: Number.isFinite(band.rawReturn) ? band.rawReturn : null,
        incrementalGmv: finiteNonNegative(band.incrementalGmv),
        incrementalNetRevenue: finiteNonNegative(band.incrementalNetRevenue),
        incrementalContribution: Number.isFinite(Number(band.incrementalContribution))
          ? Number(band.incrementalContribution)
          : null,
        period: band.period ?? null,
      });
      remainingChannelCapacity -= capacity;
    });
  });

  tranches.sort((a, b) => {
    if (b.marginalRiskAdjustedNetReturn !== a.marginalRiskAdjustedNetReturn) {
      return b.marginalRiskAdjustedNetReturn - a.marginalRiskAdjustedNetReturn;
    }
    if (a.source !== b.source) return a.source.localeCompare(b.source);
    return a.bandIndex - b.bandIndex;
  });

  let remainingBudget = budget;
  const allocationBySource = {};
  const allocatedTranches = tranches.map((tranche) => {
    const allocatedBudget = tranche.marginalRiskAdjustedNetReturn > 0
      ? Math.min(remainingBudget, tranche.capacity)
      : 0;
    if (allocatedBudget > 0) {
      allocationBySource[tranche.source] = (allocationBySource[tranche.source] || 0) + allocatedBudget;
      remainingBudget -= allocatedBudget;
    }
    return { ...tranche, allocatedBudget };
  });

  const recommendations = normalized.recommendations.map((channel) => {
    const channelTranches = allocatedTranches.filter((tranche) => tranche.source === channel.source);
    return {
      ...channel,
      suggestedIncrementalBudget: allocationBySource[channel.source] || 0,
      marginalBandsSource: channelTranches[0]?.bandsSource || "unavailable",
      marginalBandsEvaluated: channelTranches.length,
    };
  });

  return {
    ...normalized,
    decisionSupportOnly: true,
    allocationMethod: "marginal_risk_adjusted_net_return",
    availableIncrementalBudget: budget,
    allocatedBudget: budget - remainingBudget,
    unallocatedBudget: remainingBudget,
    allocationBySource,
    marginalReturnTranches: allocatedTranches,
    recommendations,
  };
}
