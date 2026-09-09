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

  test("expõe teto seguro e headroom restante para custos de aquisição", () => {
    const result = evaluateAddOnExperiment({
      baseline: { paidOrders: 100, gmv: 10000, netPlatformRevenue: 1000 },
      variant: {
        paidOrders: 100,
        gmv: 12000,
        netPlatformRevenue: 1600,
        attributedCosts: [{ source: "promoter", amount: 200 }],
      },
      minimumNetReturnOnIncrementalCost: 0.5,
    });

    // Margem-base de 10% permite até R$ 400 de custo na variante.
    expect(result.marginPreservingIncrementalCostCapAtBaselineVolume).toBeCloseTo(400);
    // ROI líquido mínimo de 0,5 limita os R$ 600 de receita incremental a R$ 400 de custo.
    expect(result.capitalEfficiencyIncrementalCostCapAtBaselineVolume).toBeCloseTo(400);
    expect(result.safeIncrementalCostCapAtBaselineVolume).toBeCloseTo(400);
    expect(result.projectedIncrementalExperimentCostAtBaselineVolume).toBeCloseTo(200);
    expect(result.remainingSafeIncrementalCostHeadroomAtBaselineVolume).toBeCloseTo(200);
    expect(result.safeIncrementalCostOverrunAtBaselineVolume).toBeCloseTo(0);
  });

  test("sinaliza estouro do teto seguro mesmo quando o custo está atribuído a vários canais", () => {
    const result = evaluateAddOnExperiment({
      baseline: { paidOrders: 100, gmv: 10000, netPlatformRevenue: 1000 },
      variant: {
        paidOrders: 100,
        gmv: 12000,
        netPlatformRevenue: 1600,
        attributedCosts: [
          { source: "promoter", amount: 250 },
          { source: "coupon", amount: 100 },
          { source: "campaign", amount: 100 },
        ],
      },
      minimumNetReturnOnIncrementalCost: 0.5,
    });

    expect(result.safeIncrementalCostCapAtBaselineVolume).toBeCloseTo(400);
    expect(result.projectedIncrementalExperimentCostAtBaselineVolume).toBeCloseTo(450);
    expect(result.remainingSafeIncrementalCostHeadroomAtBaselineVolume).toBeCloseTo(0);
    expect(result.safeIncrementalCostOverrunAtBaselineVolume).toBeCloseTo(50);
    expect(result.marginPreserved).toBe(false);
    expect(result.capitalEfficiencyPreserved).toBe(false);
    expect(result.recommendation).toBe("keep_baseline");
  });
});
