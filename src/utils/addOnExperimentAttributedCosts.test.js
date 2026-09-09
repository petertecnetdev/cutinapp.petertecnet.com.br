import { evaluateAddOnExperiment } from "./addOnExperimentEconomics";

describe("evaluateAddOnExperiment attributed costs", () => {
  test("consolida custos reais por canal antes de calcular ROI e margem", () => {
    const result = evaluateAddOnExperiment({
      baseline: { paidOrders: 100, addOnOrders: 20, gmv: 10000, netPlatformRevenue: 1000 },
      variant: {
        paidOrders: 100,
        addOnOrders: 40,
        gmv: 11500,
        netPlatformRevenue: 1450,
        attributedCosts: [
          { source: "promoter", amount: 120 },
          { source: "coupon", amount: 80 },
          { source: "campaign", amount: 100 },
        ],
      },
      minimumNetReturnOnIncrementalCost: 0.75,
    });

    expect(result.variant.attributedExperimentCost).toBeCloseTo(300);
    expect(result.variant.attributedCostsBySource).toEqual({ promoter: 120, coupon: 80, campaign: 100 });
    expect(result.variant.incrementalExperimentCost).toBeCloseTo(300);
    expect(result.projectedIncrementalContributionAtBaselineVolume).toBeCloseTo(150);
    expect(result.netReturnOnIncrementalCost).toBeCloseTo(0.5);
    expect(result.capitalEfficiencyPreserved).toBe(false);
    expect(result.recommendation).toBe("keep_baseline");
  });

  test("soma custo direto e custos atribuídos sem perder rastreabilidade", () => {
    const result = evaluateAddOnExperiment({
      baseline: { paidOrders: 100, gmv: 10000, netPlatformRevenue: 1000 },
      variant: {
        paidOrders: 100,
        gmv: 11200,
        netPlatformRevenue: 1400,
        incrementalExperimentCost: 50,
        attributedCosts: [
          { type: "promoter", cost: 70 },
          { type: "promoter", value: 30 },
          { source: "coupon", amount: -20 },
          { source: "campaign", amount: "invalid" },
        ],
      },
    });

    expect(result.variant.directExperimentCost).toBeCloseTo(50);
    expect(result.variant.attributedExperimentCost).toBeCloseTo(100);
    expect(result.variant.attributedCostsBySource).toEqual({ promoter: 100, coupon: 0, campaign: 0 });
    expect(result.variant.incrementalExperimentCost).toBeCloseTo(150);
  });
});
