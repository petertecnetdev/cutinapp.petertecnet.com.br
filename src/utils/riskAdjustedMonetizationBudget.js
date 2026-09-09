import { recommendMonetizationBudgetAllocation } from "./addOnExperimentEconomics";

const finiteNonNegative = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const finite = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function recommendRiskAdjustedMonetizationBudgetAllocation({
  channels = [],
  availableIncrementalBudget = 0,
  volatilityPenaltyWeight = 1,
  decliningTrendPenaltyWeight = 1,
  ...guardrails
} = {}) {
  const budget = finiteNonNegative(availableIncrementalBudget);
  const volatilityWeight = finiteNonNegative(volatilityPenaltyWeight);
  const trendWeight = finiteNonNegative(decliningTrendPenaltyWeight);

  const normalized = recommendMonetizationBudgetAllocation({
    channels,
    availableIncrementalBudget: 0,
    ...guardrails,
  });

  const ranked = normalized.recommendations
    .map((channel) => {
      const rawReturn = finite(channel.netReturnOnIncrementalCost, 0);
      const volatility = finiteNonNegative(channel.recentReturnStandardDeviation);
      const trend = finite(channel.recentReturnTrend, 0);
      const volatilityPenalty = volatility * volatilityWeight;
      const decliningTrendPenalty = Math.max(0, -trend) * trendWeight;
      const riskAdjustedNetReturn = rawReturn - volatilityPenalty - decliningTrendPenalty;

      return {
        ...channel,
        rawNetReturnOnIncrementalCost: rawReturn,
        riskAdjustedNetReturn,
        volatilityPenalty,
        decliningTrendPenalty,
        suggestedIncrementalBudget: 0,
      };
    })
    .sort((a, b) => {
      if (a.eligibleForPaidBudget !== b.eligibleForPaidBudget) return a.eligibleForPaidBudget ? -1 : 1;
      if (b.riskAdjustedNetReturn !== a.riskAdjustedNetReturn) {
        return b.riskAdjustedNetReturn - a.riskAdjustedNetReturn;
      }
      if (b.rawNetReturnOnIncrementalCost !== a.rawNetReturnOnIncrementalCost) {
        return b.rawNetReturnOnIncrementalCost - a.rawNetReturnOnIncrementalCost;
      }
      return a.source.localeCompare(b.source);
    });

  let remainingBudget = budget;
  const allocationBySource = {};

  ranked.forEach((channel) => {
    if (!channel.eligibleForPaidBudget || remainingBudget <= 0 || channel.riskAdjustedNetReturn <= 0) return;
    const suggestedIncrementalBudget = Math.min(
      remainingBudget,
      finiteNonNegative(channel.scalableSafeHeadroom),
    );
    channel.suggestedIncrementalBudget = suggestedIncrementalBudget;
    allocationBySource[channel.source] = suggestedIncrementalBudget;
    remainingBudget -= suggestedIncrementalBudget;
  });

  return {
    ...normalized,
    decisionSupportOnly: true,
    allocationMethod: "risk_adjusted_net_return",
    availableIncrementalBudget: budget,
    volatilityPenaltyWeight: volatilityWeight,
    decliningTrendPenaltyWeight: trendWeight,
    allocatedBudget: budget - remainingBudget,
    unallocatedBudget: remainingBudget,
    allocationBySource,
    recommendations: ranked,
  };
}
