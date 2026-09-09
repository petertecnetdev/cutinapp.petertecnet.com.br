import { recommendRiskAdjustedMonetizationBudgetAllocation } from "./riskAdjustedMonetizationBudget";

const economics = (overrides = {}) => ({
  evidenceStatus: "sufficient",
  evidenceSampleMultiple: 5,
  economicallyPositive: true,
  projectedIncrementalContributionAtBaselineVolume: 400,
  projectedIncrementalExperimentCostAtBaselineVolume: 100,
  remainingSafeIncrementalCostHeadroomAtBaselineVolume: 300,
  netReturnOnIncrementalCost: 2,
  ...overrides,
});

describe("risk-adjusted monetization budget allocation", () => {
  test("prioriza retorno consistente quando ROI bruto é igual", () => {
    const result = recommendRiskAdjustedMonetizationBudgetAllocation({
      availableIncrementalBudget: 100,
      minimumStablePeriods: 3,
      maximumRecentReturnStandardDeviation: 2,
      minimumRecentReturnTrend: -2,
      channels: [
        {
          source: "promoter",
          recentPerformancePeriods: [
            { netReturnOnIncrementalCost: 1.2 },
            { netReturnOnIncrementalCost: 2.8 },
            { netReturnOnIncrementalCost: 2.0 },
          ],
          economics: economics(),
        },
        {
          source: "boost",
          recentPerformancePeriods: [
            { netReturnOnIncrementalCost: 1.9 },
            { netReturnOnIncrementalCost: 2.0 },
            { netReturnOnIncrementalCost: 2.1 },
          ],
          economics: economics(),
        },
      ],
    });

    expect(result.allocationMethod).toBe("risk_adjusted_net_return");
    expect(result.recommendations[0].source).toBe("boost");
    expect(result.recommendations[0].riskAdjustedNetReturn)
      .toBeGreaterThan(result.recommendations[1].riskAdjustedNetReturn);
    expect(result.allocationBySource.boost).toBe(100);
    expect(result.allocationBySource.promoter).toBeUndefined();
  });

  test("penaliza tendência negativa mesmo quando o retorno bruto é maior", () => {
    const result = recommendRiskAdjustedMonetizationBudgetAllocation({
      availableIncrementalBudget: 100,
      minimumStablePeriods: 3,
      maximumRecentReturnStandardDeviation: 2,
      minimumRecentReturnTrend: -2,
      decliningTrendPenaltyWeight: 2,
      channels: [
        {
          source: "coupon",
          recentPerformancePeriods: [
            { netReturnOnIncrementalCost: 3.0 },
            { netReturnOnIncrementalCost: 2.5 },
            { netReturnOnIncrementalCost: 2.0 },
          ],
          economics: economics({ netReturnOnIncrementalCost: 2.5 }),
        },
        {
          source: "cross_sell",
          recentPerformancePeriods: [
            { netReturnOnIncrementalCost: 2.0 },
            { netReturnOnIncrementalCost: 2.0 },
            { netReturnOnIncrementalCost: 2.0 },
          ],
          economics: economics({ netReturnOnIncrementalCost: 2.0 }),
        },
      ],
    });

    expect(result.recommendations[0].source).toBe("cross_sell");
    expect(result.allocationBySource.cross_sell).toBe(100);
  });

  test("mantém orçamento não alocado quando retorno ajustado ao risco não é positivo", () => {
    const result = recommendRiskAdjustedMonetizationBudgetAllocation({
      availableIncrementalBudget: 200,
      minimumStablePeriods: 2,
      maximumRecentReturnStandardDeviation: 5,
      minimumRecentReturnTrend: -5,
      volatilityPenaltyWeight: 3,
      channels: [
        {
          source: "campaign",
          recentPerformancePeriods: [
            { netReturnOnIncrementalCost: 0.1 },
            { netReturnOnIncrementalCost: 1.9 },
          ],
          economics: economics({ netReturnOnIncrementalCost: 1 }),
        },
      ],
    });

    expect(result.recommendations[0].eligibleForPaidBudget).toBe(true);
    expect(result.recommendations[0].riskAdjustedNetReturn).toBeLessThanOrEqual(0);
    expect(result.allocatedBudget).toBe(0);
    expect(result.unallocatedBudget).toBe(200);
  });
});
