import {
  recommendMonetizationBudgetAllocation,
} from "./addOnExperimentEconomics";

describe("recommendMonetizationBudgetAllocation", () => {
  test("prioriza o canal com maior retorno líquido e respeita o headroom seguro", () => {
    const result = recommendMonetizationBudgetAllocation({
      availableIncrementalBudget: 300,
      channels: [
        {
          source: "campaign",
          economics: {
            evidenceStatus: "sufficient",
            economicallyPositive: true,
            projectedIncrementalContributionAtBaselineVolume: 180,
            projectedIncrementalExperimentCostAtBaselineVolume: 120,
            remainingSafeIncrementalCostHeadroomAtBaselineVolume: 220,
            netReturnOnIncrementalCost: 1.5,
          },
        },
        {
          source: "promoter",
          economics: {
            evidenceStatus: "sufficient",
            economicallyPositive: true,
            projectedIncrementalContributionAtBaselineVolume: 160,
            projectedIncrementalExperimentCostAtBaselineVolume: 200,
            remainingSafeIncrementalCostHeadroomAtBaselineVolume: 200,
            netReturnOnIncrementalCost: 0.8,
          },
        },
      ],
    });

    expect(result.decisionSupportOnly).toBe(true);
    expect(result.allocationBySource).toEqual({ campaign: 220, promoter: 80 });
    expect(result.allocatedBudget).toBeCloseTo(300);
    expect(result.unallocatedBudget).toBeCloseTo(0);
    expect(result.recommendations.map((item) => item.source)).toEqual(["campaign", "promoter"]);
  });

  test("não recomenda verba paga sem evidência, margem econômica ou headroom", () => {
    const result = recommendMonetizationBudgetAllocation({
      availableIncrementalBudget: 500,
      channels: [
        {
          source: "coupon",
          economics: {
            evidenceStatus: "collecting",
            economicallyPositive: true,
            projectedIncrementalContributionAtBaselineVolume: 300,
            projectedIncrementalExperimentCostAtBaselineVolume: 100,
            remainingSafeIncrementalCostHeadroomAtBaselineVolume: 300,
            netReturnOnIncrementalCost: 3,
          },
        },
        {
          source: "boost",
          economics: {
            evidenceStatus: "sufficient",
            economicallyPositive: false,
            projectedIncrementalContributionAtBaselineVolume: 200,
            projectedIncrementalExperimentCostAtBaselineVolume: 100,
            remainingSafeIncrementalCostHeadroomAtBaselineVolume: 300,
            netReturnOnIncrementalCost: 2,
          },
        },
        {
          source: "promoter",
          economics: {
            evidenceStatus: "sufficient",
            economicallyPositive: true,
            projectedIncrementalContributionAtBaselineVolume: 150,
            projectedIncrementalExperimentCostAtBaselineVolume: 100,
            remainingSafeIncrementalCostHeadroomAtBaselineVolume: 0,
            netReturnOnIncrementalCost: 1.5,
          },
        },
      ],
    });

    expect(result.allocatedBudget).toBeCloseTo(0);
    expect(result.unallocatedBudget).toBeCloseTo(500);
    expect(result.allocationBySource).toEqual({});
    expect(result.recommendations.find((item) => item.source === "coupon").exclusionReason)
      .toBe("insufficient_evidence");
    expect(result.recommendations.find((item) => item.source === "boost").exclusionReason)
      .toBe("not_economically_positive");
    expect(result.recommendations.find((item) => item.source === "promoter").exclusionReason)
      .toBe("no_safe_headroom");
  });

  test("desempata retorno pelo maior ganho de contribuição e preserva verba não alocável", () => {
    const result = recommendMonetizationBudgetAllocation({
      availableIncrementalBudget: 400,
      channels: [
        {
          source: "promoter",
          economics: {
            evidenceStatus: "sufficient",
            economicallyPositive: true,
            projectedIncrementalContributionAtBaselineVolume: 220,
            projectedIncrementalExperimentCostAtBaselineVolume: 100,
            remainingSafeIncrementalCostHeadroomAtBaselineVolume: 120,
            netReturnOnIncrementalCost: 1,
          },
        },
        {
          source: "campaign",
          economics: {
            evidenceStatus: "sufficient",
            economicallyPositive: true,
            projectedIncrementalContributionAtBaselineVolume: 300,
            projectedIncrementalExperimentCostAtBaselineVolume: 150,
            remainingSafeIncrementalCostHeadroomAtBaselineVolume: 180,
            netReturnOnIncrementalCost: 1,
          },
        },
      ],
    });

    expect(result.recommendations.map((item) => item.source)).toEqual(["campaign", "promoter"]);
    expect(result.allocationBySource).toEqual({ campaign: 180, promoter: 120 });
    expect(result.allocatedBudget).toBeCloseTo(300);
    expect(result.unallocatedBudget).toBeCloseTo(100);
  });
});
