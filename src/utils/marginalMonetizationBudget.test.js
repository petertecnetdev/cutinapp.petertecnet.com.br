import {
  buildEventChannelMarginalPerformanceHistories,
  buildMarginalPerformanceHistoryFromAnalytics,
  hydrateChannelsWithRealizedAnalyticsHistory,
  recommendMarginalMonetizationBudgetAllocation,
} from "./marginalMonetizationBudget";

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
          economics: economics({ netReturnOnIncrementalCost: 3 }),
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
      minimumStablePeriodNetReturn: 0,
      maximumRecentReturnStandardDeviation: 2,
      minimumRecentReturnTrend: -2,
    });

    expect(result.recommendations[0].riskAdjustedNetReturn).toBeGreaterThan(0);
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

  test("normaliza métricas realizadas da API central em histórico marginal auditável", () => {
    const history = buildMarginalPerformanceHistoryFromAnalytics([
      {
        period: "2026-09-01/2026-09-07",
        incremental_cost: 100,
        incremental_gmv: 1200,
        platform_net_revenue: 260,
      },
      {
        period: "2026-09-08/2026-09-09",
        spend: 80,
        gmv: 700,
        net_revenue: 140,
        contribution: 40,
      },
      { incremental_cost: 0, incremental_gmv: 500, platform_net_revenue: 100 },
    ]);

    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({
      incrementalBudgetCapacity: 100,
      incrementalGmv: 1200,
      incrementalNetRevenue: 260,
      incrementalContribution: 160,
      netReturnOnIncrementalCost: 1.6,
      observedFromAnalytics: true,
    });
    expect(history[1].netReturnOnIncrementalCost).toBe(0.5);
  });

  test("agrupa métricas realizadas por evento, canal e período sem contaminar eventos", () => {
    const groups = buildEventChannelMarginalPerformanceHistories([
      {
        event_uuid: "event-1",
        attribution_channel: "promoter",
        period: "week_1",
        incremental_cost: 40,
        incremental_gmv: 500,
        platform_net_revenue: 120,
      },
      {
        event_uuid: "event-1",
        attribution_channel: "PROMOTER",
        period: "week_1",
        incremental_cost: 60,
        incremental_gmv: 700,
        platform_net_revenue: 180,
      },
      {
        event_uuid: "event-2",
        attribution_channel: "promoter",
        period: "week_1",
        incremental_cost: 50,
        incremental_gmv: 400,
        platform_net_revenue: 90,
      },
      {
        event_uuid: "event-1",
        attribution_channel: "boost",
        period: "week_2",
        incremental_cost: 25,
        incremental_gmv: 250,
        platform_net_revenue: 70,
      },
    ]);

    expect(groups).toHaveLength(3);
    expect(groups.find((group) => group.eventId === "event-1" && group.channel === "promoter"))
      .toMatchObject({
        periods: 1,
        totalIncrementalCost: 100,
        totalIncrementalGmv: 1200,
        totalIncrementalNetRevenue: 300,
        totalIncrementalContribution: 200,
      });
    expect(groups.find((group) => group.eventId === "event-1" && group.channel === "promoter").history[0])
      .toMatchObject({
        incrementalBudgetCapacity: 100,
        netReturnOnIncrementalCost: 2,
        aggregatedAnalyticsRows: 2,
      });
  });

  test("hidrata somente canais do evento alvo e preserva histórico explicitamente fornecido", () => {
    const channels = hydrateChannelsWithRealizedAnalyticsHistory({
      eventId: "event-1",
      channels: [
        { source: "promoter", economics: economics() },
        { source: "boost", economics: economics(), marginalPerformanceHistory: [] },
      ],
      analyticsRows: [
        {
          event_id: "event-1",
          source: "promoter",
          period: "week_1",
          spend: 50,
          gmv: 600,
          net_revenue: 150,
        },
        {
          event_id: "event-2",
          source: "promoter",
          period: "week_1",
          spend: 100,
          gmv: 5000,
          net_revenue: 1000,
        },
        {
          event_id: "event-1",
          source: "boost",
          period: "week_1",
          spend: 30,
          gmv: 250,
          net_revenue: 80,
        },
      ],
    });

    expect(channels[0].realizedAnalyticsHistorySource).toBe("central_analytics_event_channel");
    expect(channels[0].realizedAnalyticsHistory).toHaveLength(1);
    expect(channels[0].realizedAnalyticsHistory[0]).toMatchObject({
      incrementalCost: 50,
      incrementalGmv: 600,
      incrementalNetRevenue: 150,
      incrementalContribution: 100,
    });
    expect(channels[1].realizedAnalyticsHistory).toBeUndefined();
    expect(channels[1].marginalPerformanceHistory).toEqual([]);
  });

  test("usa histórico econômico realizado da API central como faixas marginais", () => {
    const result = recommendMarginalMonetizationBudgetAllocation({
      availableIncrementalBudget: 150,
      channels: [
        {
          source: "promoter",
          economics: economics({ netReturnOnIncrementalCost: 2 }),
          realizedAnalyticsHistory: [
            {
              period: "week_1",
              incrementalCost: 50,
              incrementalGmv: 600,
              incrementalNetRevenue: 150,
            },
            {
              period: "week_2",
              incrementalCost: 100,
              incrementalGmv: 900,
              incrementalNetRevenue: 80,
            },
          ],
        },
      ],
    });

    expect(result.recommendations[0]).toMatchObject({
      marginalBandsSource: "central_analytics",
      marginalBandsEvaluated: 2,
    });
    expect(result.marginalReturnTranches[0]).toMatchObject({
      bandsSource: "central_analytics",
      incrementalGmv: 600,
      incrementalNetRevenue: 150,
      incrementalContribution: 100,
      period: "week_1",
    });
    expect(result.allocationBySource.promoter).toBe(50);
    expect(result.unallocatedBudget).toBe(100);
  });
});
