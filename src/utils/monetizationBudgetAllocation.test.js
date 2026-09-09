import {
  recommendMonetizationBudgetAllocation,
} from "./addOnExperimentEconomics";

describe("recommendMonetizationBudgetAllocation", () => {
  test("prioriza o canal com maior retorno líquido e limita a escala ao custo observado", () => {
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
    expect(result.maximumTotalCostMultipleFromObserved).toBe(2);
    expect(result.allocationBySource).toEqual({ campaign: 120, promoter: 180 });
    expect(result.allocatedBudget).toBeCloseTo(300);
    expect(result.unallocatedBudget).toBeCloseTo(0);
    expect(result.recommendations.map((item) => item.source)).toEqual(["campaign", "promoter"]);
    expect(result.recommendations.find((item) => item.source === "campaign").scalableSafeHeadroom)
      .toBeCloseTo(120);
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
    expect(result.allocationBySource).toEqual({ campaign: 150, promoter: 100 });
    expect(result.allocatedBudget).toBeCloseTo(250);
    expect(result.unallocatedBudget).toBeCloseTo(150);
  });

  test("permite calibrar a escala por canal sem ultrapassar o headroom econômico", () => {
    const result = recommendMonetizationBudgetAllocation({
      availableIncrementalBudget: 1000,
      maximumTotalCostMultipleFromObserved: 2,
      channels: [
        {
          source: "boost",
          maximumTotalCostMultipleFromObserved: 1.5,
          economics: {
            evidenceStatus: "sufficient",
            economicallyPositive: true,
            projectedIncrementalContributionAtBaselineVolume: 500,
            projectedIncrementalExperimentCostAtBaselineVolume: 200,
            remainingSafeIncrementalCostHeadroomAtBaselineVolume: 900,
            netReturnOnIncrementalCost: 2.5,
          },
        },
        {
          source: "campaign",
          maximumTotalCostMultipleFromObserved: 3,
          economics: {
            evidenceStatus: "sufficient",
            economicallyPositive: true,
            projectedIncrementalContributionAtBaselineVolume: 300,
            projectedIncrementalExperimentCostAtBaselineVolume: 100,
            remainingSafeIncrementalCostHeadroomAtBaselineVolume: 150,
            netReturnOnIncrementalCost: 2,
          },
        },
      ],
    });

    expect(result.allocationBySource).toEqual({ boost: 100, campaign: 150 });
    expect(result.allocatedBudget).toBeCloseTo(250);
    expect(result.unallocatedBudget).toBeCloseTo(750);
    expect(result.recommendations.find((item) => item.source === "boost").evidenceBoundIncrementalBudgetCap)
      .toBeCloseTo(100);
    expect(result.recommendations.find((item) => item.source === "campaign").evidenceBoundIncrementalBudgetCap)
      .toBeCloseTo(200);
  });
});
