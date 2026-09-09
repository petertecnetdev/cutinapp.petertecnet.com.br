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
    const maximumChannelBudget = finiteNonNegative(channel.scalableSafeHeadroom);
    let remainingChannelCapacity = maximumChannelBudget;

    if (explicitBands.length === 0) {
      tranches.push({
        source: channel.source,
        bandIndex: 0,
        capacity: maximumChannelBudget,
        marginalRiskAdjustedNetReturn: channel.riskAdjustedNetReturn,
        baseRiskAdjustedNetReturn: channel.riskAdjustedNetReturn,
        modeledFromObservedReturn: true,
      });
      return;
    }

    explicitBands.forEach((band = {}, bandIndex) => {
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

  const recommendations = normalized.recommendations.map((channel) => ({
    ...channel,
    suggestedIncrementalBudget: allocationBySource[channel.source] || 0,
  }));

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
