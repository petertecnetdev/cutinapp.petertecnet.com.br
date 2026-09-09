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
});
