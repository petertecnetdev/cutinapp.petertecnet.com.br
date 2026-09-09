import { evaluateAddOnExperiment } from "./addOnExperimentEconomics";

describe("evaluateAddOnExperiment", () => {
  test("prefere variante com receita líquida por pedido maior sem diluir take rate", () => {
    const result = evaluateAddOnExperiment({
      baseline: { paidOrders: 100, addOnOrders: 20, gmv: 10000, netPlatformRevenue: 1000 },
      variant: { paidOrders: 100, addOnOrders: 35, gmv: 11500, netPlatformRevenue: 1265 },
    });

    expect(result.evidenceStatus).toBe("sufficient");
    expect(result.attachmentUplift).toBeCloseTo(0.15);
    expect(result.ticketUplift).toBeCloseTo(15);
    expect(result.netRevenuePerOrderUplift).toBeCloseTo(2.65);
    expect(result.projectedIncrementalNetRevenueAtBaselineVolume).toBeCloseTo(265);
    expect(result.projectedIncrementalContributionAtBaselineVolume).toBeCloseTo(265);
    expect(result.marginPreserved).toBe(true);
    expect(result.recommendation).toBe("prefer_variant");
  });

  test("não recomenda crescimento que aumenta receita por pedido diluindo o take rate líquido", () => {
    const result = evaluateAddOnExperiment({
      baseline: { paidOrders: 80, addOnOrders: 16, gmv: 8000, netPlatformRevenue: 960 },
      variant: { paidOrders: 80, addOnOrders: 32, gmv: 10400, netPlatformRevenue: 1040 },
    });

    expect(result.netRevenuePerOrderUplift).toBeGreaterThan(0);
    expect(result.marginPreserved).toBe(false);
    expect(result.economicallyPositive).toBe(false);
    expect(result.recommendation).toBe("keep_baseline");
  });

  test("desconta custo incremental da variante antes de declarar vencedor", () => {
    const result = evaluateAddOnExperiment({
      baseline: { paidOrders: 100, addOnOrders: 20, gmv: 10000, netPlatformRevenue: 1000 },
      variant: {
        paidOrders: 100,
        addOnOrders: 38,
        gmv: 12000,
        netPlatformRevenue: 1320,
        incrementalExperimentCost: 360,
      },
    });

    expect(result.netRevenuePerOrderUplift).toBeCloseTo(3.2);
    expect(result.contributionPerOrderUplift).toBeCloseTo(-0.4);
    expect(result.incrementalExperimentCost).toBeCloseTo(360);
    expect(result.projectedIncrementalNetRevenueAtBaselineVolume).toBeCloseTo(320);
    expect(result.projectedIncrementalContributionAtBaselineVolume).toBeCloseTo(-40);
    expect(result.marginPreserved).toBe(false);
    expect(result.economicallyPositive).toBe(false);
    expect(result.recommendation).toBe("keep_baseline");
  });

  test("prefere variante quando receita incremental cobre custo e preserva margem", () => {
    const result = evaluateAddOnExperiment({
      baseline: { paidOrders: 100, addOnOrders: 20, gmv: 10000, netPlatformRevenue: 1000 },
      variant: {
        paidOrders: 100,
        addOnOrders: 36,
        gmv: 11200,
        netPlatformRevenue: 1344,
        incrementalExperimentCost: 112,
      },
    });

    expect(result.contributionPerOrderUplift).toBeCloseTo(2.32);
    expect(result.projectedIncrementalContributionAtBaselineVolume).toBeCloseTo(232);
    expect(result.marginPreserved).toBe(true);
    expect(result.economicallyPositive).toBe(true);
    expect(result.recommendation).toBe("prefer_variant");
  });

  test("mantém coleta quando a amostra ainda é pequena", () => {
    const result = evaluateAddOnExperiment({
      baseline: { paidOrders: 8, addOnOrders: 1, gmv: 800, netPlatformRevenue: 80 },
      variant: { paidOrders: 10, addOnOrders: 4, gmv: 1200, netPlatformRevenue: 144 },
      minimumOrdersPerArm: 20,
    });

    expect(result.evidence).toBeCloseTo(0.4);
    expect(result.evidenceStatus).toBe("collecting");
    expect(result.recommendation).toBe("collect_more_data");
  });

  test("normaliza entradas inválidas sem criar receita fictícia", () => {
    const result = evaluateAddOnExperiment({
      baseline: { paidOrders: -2, addOnOrders: 9, gmv: "x", netPlatformRevenue: -1 },
      variant: { incrementalExperimentCost: -100 },
    });

    expect(result.baseline.paidOrders).toBe(0);
    expect(result.baseline.addOnOrders).toBe(0);
    expect(result.variant.incrementalExperimentCost).toBe(0);
    expect(result.projectedIncrementalNetRevenueAtBaselineVolume).toBe(0);
    expect(result.projectedIncrementalContributionAtBaselineVolume).toBe(0);
    expect(result.recommendation).toBe("collect_more_data");
  });
});
