import {
  evaluateAddOnExperiment,
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

  test("aumenta gradualmente a escala permitida quando a amostra supera o mínimo", () => {
    const result = recommendMonetizationBudgetAllocation({
      availableIncrementalBudget: 1000,
      maximumTotalCostMultipleFromObserved: 2,
      maximumEvidenceScaledCostMultipleFromObserved: 4,
      evidenceSampleMultipleForMaximumScale: 5,
      channels: [
        {
          source: "promoter",
          economics: {
            evidenceStatus: "sufficient",
            evidenceSampleMultiple: 1,
            economicallyPositive: true,
            projectedIncrementalContributionAtBaselineVolume: 400,
            projectedIncrementalExperimentCostAtBaselineVolume: 100,
            remainingSafeIncrementalCostHeadroomAtBaselineVolume: 500,
            netReturnOnIncrementalCost: 2,
          },
        },
        {
          source: "campaign",
          economics: {
            evidenceStatus: "sufficient",
            evidenceSampleMultiple: 5,
            economicallyPositive: true,
            projectedIncrementalContributionAtBaselineVolume: 350,
            projectedIncrementalExperimentCostAtBaselineVolume: 100,
            remainingSafeIncrementalCostHeadroomAtBaselineVolume: 500,
            netReturnOnIncrementalCost: 1.5,
          },
        },
      ],
    });

    const promoter = result.recommendations.find((item) => item.source === "promoter");
    const campaign = result.recommendations.find((item) => item.source === "campaign");

    expect(promoter.maximumTotalCostMultipleFromObserved).toBeCloseTo(2);
    expect(promoter.evidenceBoundIncrementalBudgetCap).toBeCloseTo(100);
    expect(campaign.maximumTotalCostMultipleFromObserved).toBeCloseTo(4);
    expect(campaign.evidenceBoundIncrementalBudgetCap).toBeCloseTo(300);
    expect(result.allocationBySource).toEqual({ promoter: 100, campaign: 300 });
  });

  test("expõe força de amostra acima do mínimo sem alterar o status de suficiência", () => {
    const analysis = evaluateAddOnExperiment({
      minimumOrdersPerArm: 20,
      baseline: {
        paidOrders: 100,
        addOnOrders: 20,
        gmv: 10000,
        netPlatformRevenue: 1000,
        incrementalExperimentCost: 100,
      },
      variant: {
        paidOrders: 120,
        addOnOrders: 36,
        gmv: 12600,
        netPlatformRevenue: 1380,
        incrementalExperimentCost: 120,
      },
    });

    expect(analysis.evidence).toBe(1);
    expect(analysis.evidenceStatus).toBe("sufficient");
    expect(analysis.evidenceSampleMultiple).toBeCloseTo(5);
  });

  test("bloqueia escala quando o retorno recente não é estável em períodos consecutivos", () => {
    const result = recommendMonetizationBudgetAllocation({
      availableIncrementalBudget: 500,
      minimumStablePeriods: 2,
      minimumStablePeriodNetReturn: 0.5,
      channels: [
        {
          source: "boost",
          recentPerformancePeriods: [
            { netReturnOnIncrementalCost: 1.4, economicallyPositive: true },
            { netReturnOnIncrementalCost: 0.2, economicallyPositive: true },
          ],
          economics: {
            evidenceStatus: "sufficient",
            evidenceSampleMultiple: 5,
            economicallyPositive: true,
            projectedIncrementalContributionAtBaselineVolume: 500,
            projectedIncrementalExperimentCostAtBaselineVolume: 100,
            remainingSafeIncrementalCostHeadroomAtBaselineVolume: 400,
            netReturnOnIncrementalCost: 2,
          },
        },
      ],
    });

    const boost = result.recommendations[0];
    expect(boost.temporalStabilityStatus).toBe("unstable");
    expect(boost.temporalStabilityPreserved).toBe(false);
    expect(boost.exclusionReason).toBe("unstable_recent_performance");
    expect(result.allocatedBudget).toBe(0);
    expect(result.unallocatedBudget).toBe(500);
  });

  test("libera escala quando períodos recentes preservam o retorno mínimo e mantém compatibilidade sem histórico", () => {
    const result = recommendMonetizationBudgetAllocation({
      availableIncrementalBudget: 500,
      minimumStablePeriods: 2,
      minimumStablePeriodNetReturn: 0.5,
      channels: [
        {
          source: "campaign",
          recentPerformancePeriods: [
            { netReturnOnIncrementalCost: 0.9, economicallyPositive: true },
            { netReturnOnIncrementalCost: 1.1, economicallyPositive: true },
          ],
          economics: {
            evidenceStatus: "sufficient",
            evidenceSampleMultiple: 5,
            economicallyPositive: true,
            projectedIncrementalContributionAtBaselineVolume: 350,
            projectedIncrementalExperimentCostAtBaselineVolume: 100,
            remainingSafeIncrementalCostHeadroomAtBaselineVolume: 500,
            netReturnOnIncrementalCost: 1.5,
          },
        },
        {
          source: "promoter",
          economics: {
            evidenceStatus: "sufficient",
            evidenceSampleMultiple: 1,
            economicallyPositive: true,
            projectedIncrementalContributionAtBaselineVolume: 200,
            projectedIncrementalExperimentCostAtBaselineVolume: 100,
            remainingSafeIncrementalCostHeadroomAtBaselineVolume: 100,
            netReturnOnIncrementalCost: 1,
          },
        },
      ],
    });

    const campaign = result.recommendations.find((item) => item.source === "campaign");
    const promoter = result.recommendations.find((item) => item.source === "promoter");
    expect(campaign.temporalStabilityStatus).toBe("stable");
    expect(campaign.temporalStabilityPreserved).toBe(true);
    expect(promoter.temporalStabilityStatus).toBe("not_provided");
    expect(promoter.temporalStabilityPreserved).toBe(true);
    expect(result.allocationBySource).toEqual({ campaign: 300, promoter: 100 });
  });
});
