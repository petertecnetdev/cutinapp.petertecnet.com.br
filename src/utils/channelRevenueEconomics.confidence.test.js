import { summarizeRevenueByChannel } from "./channelRevenueEconomics";

describe("channel uplift projection historical confidence", () => {
  const campaignOrders = (count = 5) => Array.from({ length: count }, () => ({
    status: "paid",
    total: 100,
    platform_fee: 10,
    channel: "campaign",
    discount_amount: 1,
  }));

  test("keeps explicit projection unchanged when no observed uplift is supplied", () => {
    const [campaign] = summarizeRevenueByChannel(campaignOrders(), {
      expectedGmvUpliftRate: 50,
    });

    expect(campaign.observedGmvUpliftRate).toBeNull();
    expect(campaign.historicalConfidence).toBe(0);
    expect(campaign.calibratedExpectedGmvUpliftRate).toBe(50);
    expect(campaign.conservativeExpectedGmvUpliftRate).toBe(50);
    expect(campaign.projectionDownsideGapRate).toBe(0);
    expect(campaign.recommendedAction).toBe("scale");
  });

  test("blends downside history into the projection according to paid-order evidence", () => {
    const [campaign] = summarizeRevenueByChannel(campaignOrders(), {
      expectedGmvUpliftRate: 50,
      observedGmvUpliftRateByChannel: { campaign: 0 },
    });

    expect(campaign.historicalConfidence).toBe(0.25);
    expect(campaign.calibratedExpectedGmvUpliftRate).toBe(37.5);
    expect(campaign.conservativeExpectedGmvUpliftRate).toBe(37.5);
    expect(campaign.projectedIncrementalGmv).toBe(187.5);
    expect(campaign.projectionStatus).toBe("below_target");
    expect(campaign.recommendedAction).toBe("maintain");
  });

  test("lets sufficient observed downside fully calibrate an optimistic projection", () => {
    const [campaign] = summarizeRevenueByChannel(campaignOrders(20), {
      expectedGmvUpliftRate: 50,
      observedGmvUpliftRateByChannel: { campaign: 10 },
    });

    expect(campaign.historicalConfidence).toBe(1);
    expect(campaign.calibratedExpectedGmvUpliftRate).toBe(10);
    expect(campaign.conservativeExpectedGmvUpliftRate).toBe(10);
    expect(campaign.projectionStatus).toBe("below_target");
    expect(campaign.recommendedAction).toBe("maintain");
  });

  test("does not let historical upside inflate the reinvestment projection automatically", () => {
    const [campaign] = summarizeRevenueByChannel(campaignOrders(), {
      expectedGmvUpliftRate: 20,
      observedGmvUpliftRateByChannel: { campaign: 80 },
      minOrdersForFullHistoricalConfidence: 5,
    });

    expect(campaign.minOrdersForFullHistoricalConfidence).toBe(5);
    expect(campaign.historicalConfidence).toBe(1);
    expect(campaign.calibratedExpectedGmvUpliftRate).toBe(80);
    expect(campaign.conservativeExpectedGmvUpliftRate).toBe(20);
    expect(campaign.projectionDownsideGapRate).toBe(60);
    expect(campaign.projectedIncrementalGmv).toBe(100);
    expect(campaign.projectionStatus).toBe("below_target");
    expect(campaign.recommendedAction).toBe("maintain");
  });
});
