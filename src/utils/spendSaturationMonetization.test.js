import {
  buildEventChannelSpendSaturationCurves,
  hydrateChannelsWithSpendSaturationHistory,
} from "./spendSaturationMonetization";

const rows = [
  { event_id: "event-1", source: "promoter", period: "w1", spend: 20, gmv: 400, net_revenue: 100 },
  { event_id: "event-1", source: "promoter", period: "w2", spend: 30, gmv: 500, net_revenue: 120 },
  { event_id: "event-1", source: "promoter", period: "w3", spend: 60, gmv: 700, net_revenue: 150 },
  { event_id: "event-1", source: "promoter", period: "w4", spend: 80, gmv: 760, net_revenue: 160 },
  { event_id: "event-1", source: "promoter", period: "w5", spend: 120, gmv: 850, net_revenue: 170 },
  { event_id: "event-1", source: "promoter", period: "w6", spend: 150, gmv: 900, net_revenue: 175 },
  { event_id: "event-2", source: "promoter", period: "w1", spend: 10, gmv: 1000, net_revenue: 300 },
];

describe("spend saturation monetization", () => {
  test("deriva faixas de intensidade sem misturar eventos e detecta saturação", () => {
    const curves = buildEventChannelSpendSaturationCurves(rows, {
      targetBandCount: 3,
      minimumObservations: 3,
    });

    const eventOne = curves.find((curve) => curve.eventId === "event-1" && curve.channel === "promoter");
    const eventTwo = curves.find((curve) => curve.eventId === "event-2" && curve.channel === "promoter");

    expect(eventOne).toMatchObject({
      observations: 6,
      sufficientEvidence: true,
      bandCount: 3,
      saturationDetected: true,
    });
    expect(eventOne.bands).toHaveLength(3);
    expect(eventOne.bands.map((band) => band.intensity)).toEqual(["low", "medium", "high"]);
    expect(eventOne.bands[0].netReturnOnIncrementalCost)
      .toBeGreaterThan(eventOne.bands[2].netReturnOnIncrementalCost);

    expect(eventTwo).toMatchObject({
      observations: 1,
      sufficientEvidence: false,
      reason: "insufficient_spend_intensity_observations",
      bands: [],
    });
  });

  test("usa capacidade média observada por faixa para não multiplicar orçamento pelo número de períodos", () => {
    const [curve] = buildEventChannelSpendSaturationCurves(rows.filter((row) => row.event_id === "event-1"));

    expect(curve.bands[0]).toMatchObject({
      observations: 2,
      minimumObservedCost: 20,
      maximumObservedCost: 30,
      averageObservedCost: 25,
      incrementalBudgetCapacity: 25,
    });
    expect(curve.bands[2].incrementalBudgetCapacity).toBe(135);
  });

  test("hidrata histórico marginal somente quando há evidência e preserva configuração explícita", () => {
    const hydrated = hydrateChannelsWithSpendSaturationHistory({
      eventId: "event-1",
      analyticsRows: rows,
      channels: [
        { source: "promoter" },
        { source: "boost", marginalReturnBands: [] },
      ],
    });

    expect(hydrated[0]).toMatchObject({
      spendSaturationCurveSource: "central_analytics_event_channel_spend_intensity",
      spendSaturationDetected: true,
      spendSaturationObservations: 6,
    });
    expect(hydrated[0].marginalPerformanceHistory).toHaveLength(3);
    expect(hydrated[0].marginalPerformanceHistory[0]).toMatchObject({
      spendIntensity: "low",
      observedFromSpendIntensityAnalytics: true,
    });
    expect(hydrated[1].marginalPerformanceHistory).toBeUndefined();
    expect(hydrated[1].marginalReturnBands).toEqual([]);
  });

  test("não hidrata canal quando a amostra por intensidade ainda é insuficiente", () => {
    const hydrated = hydrateChannelsWithSpendSaturationHistory({
      eventId: "event-2",
      analyticsRows: rows,
      channels: [{ source: "promoter" }],
      minimumObservations: 3,
    });

    expect(hydrated[0].marginalPerformanceHistory).toBeUndefined();
    expect(hydrated[0].spendSaturationCurveSource).toBeUndefined();
  });
});
