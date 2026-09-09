import { recommendMarginalMonetizationBudgetAllocation } from "./marginalMonetizationBudget";

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

describe("marginal monetization budget allocation", () => {
  test("realoca orçamento quando o retorno marginal do melhor canal satura", () => {
    const result = recommendMarginalMonetizationBudgetAllocation({
      availableIncrementalBudget: 200,
      channels: [
        {
          source: "promoter",
          economics: economics({ netReturnOnIncrementalCost: 3 }),
          marginalReturnBands: [
            { incrementalBudgetCapacity: 50, marginalRiskAdjustedNetReturn: 3 },
            { incrementalBudgetCapacity: 150, marginalRiskAdjustedNetReturn: 0.8 },
          ],
        },
        {
          source: "boost",
          economics: economics({ netReturnOnIncrementalCost: 2 }),
          marginalReturnBands: [
            { incrementalBudgetCapacity: 150, marginalRiskAdjustedNetReturn: 2 },
          ],
        },
      ],
    });

    expect(result.allocationMethod).toBe("marginal_risk_adjusted_net_return");
    expect(result.allocationBySource.promoter).toBe(50);
    expect(result.allocationBySource.boost).toBe(150);
    expect(result.allocatedBudget).toBe(200);
    expect(result.unallocatedBudget).toBe(0);
    expect(result.marginalReturnTranches.map((band) => band.marginalRiskAdjustedNetReturn))
      .toEqual([3, 2, 0.8]);
  });

  test("não força gasto em faixa de retorno marginal não positivo", () => {
    const result = recommendMarginalMonetizationBudgetAllocation({
      availableIncrementalBudget: 200,
      channels: [
        {
          source: "coupon",
          economics: economics(),
          marginalReturnBands: [
            { incrementalBudgetCapacity: 75, marginalRiskAdjustedNetReturn: 1.5 },
            { incrementalBudgetCapacity: 125, marginalRiskAdjustedNetReturn: 0 },
          ],
        },
      ],
    });

    expect(result.allocationBySource.coupon).toBe(75);
    expect(result.allocatedBudget).toBe(75);
    expect(result.unallocatedBudget).toBe(125);
  });

  test("mantém compatibilidade usando o retorno observado quando não há faixas", () => {
    const result = recommendMarginalMonetizationBudgetAllocation({
      availableIncrementalBudget: 120,
      channels: [
        {
          source: "cross_sell",
          economics: economics({ netReturnOnIncrementalCost: 1.8 }),
        },
      ],
    });

    expect(result.allocationBySource.cross_sell).toBe(120);
    expect(result.marginalReturnTranches).toHaveLength(1);
    expect(result.marginalReturnTranches[0].modeledFromObservedReturn).toBe(true);
    expect(result.marginalReturnTranches[0].marginalRiskAdjustedNetReturn).toBe(1.8);
  });

  test("deriva faixas marginais do histórico observado sem exigir configuração manual", () => {
    const result = recommendMarginalMonetizationBudgetAllocation({
      availableIncrementalBudget: 180,
      channels: [
        {
          source: "promoter",
          economics: economics({ netReturnOnIncrementalCost: 2.4 }),
          marginalPerformanceHistory: [
            { incrementalBudgetCapacity: 60, netReturnOnIncrementalCost: 2.5 },
            { incrementalBudgetCapacity: 80, netReturnOnIncrementalCost: 1.2 },
            { incrementalBudgetCapacity: 100, netReturnOnIncrementalCost: -0.2 },
          ],
        },
        {
          source: "boost",
          economics: economics({ netReturnOnIncrementalCost: 1.5 }),
          marginalPerformanceHistory: [
            { incrementalBudgetCapacity: 120, netReturnOnIncrementalCost: 1.5 },
          ],
        },
      ],
    });

    expect(result.allocationBySource.promoter).toBe(60);
    expect(result.allocationBySource.boost).toBe(120);
    expect(result.unallocatedBudget).toBe(0);
    expect(result.marginalReturnTranches.find((band) => band.source === "promoter" && band.bandIndex === 0))
      .toMatchObject({ bandsSource: "observed_history", rawHistoricalNetReturn: 2.5 });
    expect(result.recommendations.find((channel) => channel.source === "promoter"))
      .toMatchObject({ marginalBandsSource: "observed_history", marginalBandsEvaluated: 3 });
  });

  test("aplica as penalidades de risco do canal também ao retorno vindo do histórico", () => {
    const result = recommendMarginalMonetizationBudgetAllocation({
      availableIncrementalBudget: 100,
      channels: [
        {
          source: "coupon",
          economics: economics({ netReturnOnIncrementalCost: 1.4 }),
          recentPerformancePeriods: [
            { netReturnOnIncrementalCost: 2 },
            { netReturnOnIncrementalCost: 1 },
            { netReturnOnIncrementalCost: 0 },
          ],
          marginalPerformanceHistory: [
            { incrementalBudgetCapacity: 100, netReturnOnIncrementalCost: 1.5 },
          ],
        },
      ],
      minimumStablePeriods: 3,
      maximumRecentReturnStandardDeviation: 2,
      minimumRecentReturnTrend: -2,
    });

    expect(result.marginalReturnTranches[0].marginalRiskAdjustedNetReturn).toBeLessThan(0);
    expect(result.allocatedBudget).toBe(0);
    expect(result.unallocatedBudget).toBe(100);
  });

  test("faixas explícitas continuam tendo precedência sobre histórico observado", () => {
    const result = recommendMarginalMonetizationBudgetAllocation({
      availableIncrementalBudget: 50,
      channels: [
        {
          source: "boost",
          economics: economics(),
          marginalReturnBands: [
            { incrementalBudgetCapacity: 50, marginalRiskAdjustedNetReturn: 3 },
          ],
          marginalPerformanceHistory: [
            { incrementalBudgetCapacity: 50, netReturnOnIncrementalCost: 0.2 },
          ],
        },
      ],
    });

    expect(result.allocatedBudget).toBe(50);
    expect(result.marginalReturnTranches[0]).toMatchObject({
      bandsSource: "explicit",
      marginalRiskAdjustedNetReturn: 3,
    });
  });
});
