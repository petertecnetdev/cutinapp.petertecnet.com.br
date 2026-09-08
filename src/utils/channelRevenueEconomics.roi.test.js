import { summarizeRevenueByChannel } from "./channelRevenueEconomics";

describe("channel reinvestment projected net return", () => {
  const campaignOrders = () => Array.from({ length: 5 }, () => ({
    status: "paid",
    total: 100,
    platform_fee: 10,
    channel: "campaign",
    discount_amount: 1,
  }));

  test("keeps the existing recommendation when no GMV uplift projection is provided", () => {
    const [campaign] = summarizeRevenueByChannel(campaignOrders());

    expect(campaign.expectedGmvUpliftRate).toBeNull();
    expect(campaign.projectedNetReturnPerReal).toBeNull();
    expect(campaign.projectionStatus).toBe("not_provided");
    expect(campaign.recommendedAction).toBe("scale");
  });

  test("measures net return per real reinvested from an explicit channel projection", () => {
    const [campaign] = summarizeRevenueByChannel(campaignOrders(), {
      expectedGmvUpliftRateByChannel: { campaign: 50 },
    });

    expect(campaign.safeReinvestmentBudget).toBe(17.5);
    expect(campaign.projectedIncrementalGmv).toBe(250);
    expect(campaign.projectedIncrementalNetRevenue).toBe(22.5);
    expect(campaign.projectedNetReturnAfterReinvestment).toBe(5);
    expect(campaign.projectedNetReturnPerReal).toBeCloseTo(0.2857142857, 8);
    expect(campaign.projectionStatus).toBe("profitable");
    expect(campaign.recommendedAction).toBe("scale");
  });

  test("does not scale when explicit projected return would destroy reinvestment economics", () => {
    const [campaign] = summarizeRevenueByChannel(campaignOrders(), {
      expectedGmvUpliftRate: 20,
    });

    expect(campaign.projectedIncrementalNetRevenue).toBe(9);
    expect(campaign.projectedNetReturnAfterReinvestment).toBe(-8.5);
    expect(campaign.projectedNetReturnPerReal).toBeCloseTo(-0.4857142857, 8);
    expect(campaign.projectionStatus).toBe("below_target");
    expect(campaign.recommendedAction).toBe("maintain");
  });

  test("supports a minimum projected net return target without inventing growth assumptions", () => {
    const [campaign] = summarizeRevenueByChannel(campaignOrders(), {
      expectedGmvUpliftRate: 50,
      minProjectedNetReturnPerRealForScale: 0.5,
    });

    expect(campaign.projectedNetReturnPerReal).toBeCloseTo(0.2857142857, 8);
    expect(campaign.minProjectedNetReturnPerRealForScale).toBe(0.5);
    expect(campaign.projectionStatus).toBe("below_target");
    expect(campaign.recommendedAction).toBe("maintain");
  });
});
