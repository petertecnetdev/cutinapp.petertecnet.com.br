import { recommendMonetizationBudgetAllocation } from "./addOnExperimentEconomics";

const baseEconomics = {
  evidenceStatus: "sufficient",
  evidenceSampleMultiple: 5,
  economicallyPositive: true,
  projectedIncrementalContributionAtBaselineVolume: 400,
  projectedIncrementalExperimentCostAtBaselineVolume: 100,
  remainingSafeIncrementalCostHeadroomAtBaselineVolume: 400,
  netReturnOnIncrementalCost: 2,
};

describe("monetization budget temporal risk guards", () => {
  test("bloqueia escala quando o retorno recente é volátil mesmo acima do piso", () => {
    const result = recommendMonetizationBudgetAllocation({
      availableIncrementalBudget: 500,
      minimumStablePeriods: 2,
      minimumStablePeriodNetReturn: 0.5,
      maximumRecentReturnStandardDeviation: 0.5,
      channels: [
        {
          source: "boost",
          recentPerformancePeriods: [
            { netReturnOnIncrementalCost: 0.6, economicallyPositive: true },
            { netReturnOnIncrementalCost: 1.8, economicallyPositive: true },
          ],
          economics: baseEconomics,
        },
      ],
    });

    const boost = result.recommendations[0];
    expect(boost.recentReturnMean).toBeCloseTo(1.2);
    expect(boost.recentReturnStandardDeviation).toBeCloseTo(0.6);
    expect(boost.returnVolatilityWithinLimit).toBe(false);
    expect(boost.temporalStabilityPreserved).toBe(false);
    expect(boost.exclusionReason).toBe("volatile_recent_performance");
    expect(result.allocatedBudget).toBe(0);
    expect(result.unallocatedBudget).toBe(500);
  });

  test("bloqueia escala quando o retorno apresenta tendência descendente relevante", () => {
    const result = recommendMonetizationBudgetAllocation({
      availableIncrementalBudget: 500,
      minimumStablePeriods: 2,
      minimumStablePeriodNetReturn: 0.5,
      maximumRecentReturnStandardDeviation: 1,
      minimumRecentReturnTrend: -0.1,
      channels: [
        {
          source: "promoter",
          recentPerformancePeriods: [
            { netReturnOnIncrementalCost: 1.5, economicallyPositive: true },
            { netReturnOnIncrementalCost: 0.8, economicallyPositive: true },
          ],
          economics: baseEconomics,
        },
      ],
    });

    const promoter = result.recommendations[0];
    expect(promoter.recentReturnTrend).toBeCloseTo(-0.7);
    expect(promoter.returnVolatilityWithinLimit).toBe(true);
    expect(promoter.returnTrendPreserved).toBe(false);
    expect(promoter.exclusionReason).toBe("declining_recent_performance");
    expect(result.allocatedBudget).toBe(0);
  });

  test("mantém escala quando retorno recente é consistente e sem deterioração material", () => {
    const result = recommendMonetizationBudgetAllocation({
      availableIncrementalBudget: 500,
      minimumStablePeriods: 3,
      minimumStablePeriodNetReturn: 0.5,
      maximumRecentReturnStandardDeviation: 0.5,
      minimumRecentReturnTrend: -0.1,
      channels: [
        {
          source: "campaign",
          recentPerformancePeriods: [
            { netReturnOnIncrementalCost: 1.0, economicallyPositive: true },
            { netReturnOnIncrementalCost: 1.1, economicallyPositive: true },
            { netReturnOnIncrementalCost: 1.2, economicallyPositive: true },
          ],
          economics: baseEconomics,
        },
      ],
    });

    const campaign = result.recommendations[0];
    expect(campaign.temporalStabilityStatus).toBe("stable");
    expect(campaign.recentReturnStandardDeviation).toBeLessThan(0.1);
    expect(campaign.recentReturnTrend).toBeCloseTo(0.1);
    expect(campaign.returnVolatilityWithinLimit).toBe(true);
    expect(campaign.returnTrendPreserved).toBe(true);
    expect(campaign.eligibleForPaidBudget).toBe(true);
    expect(result.allocatedBudget).toBeGreaterThan(0);
  });
});
