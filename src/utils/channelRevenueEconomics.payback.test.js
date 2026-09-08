import { summarizeRevenueByChannel } from "./channelRevenueEconomics";

describe("channel reinvestment payback guardrails", () => {
  const campaignOrders = () => Array.from({ length: 5 }, () => ({
    status: "paid",
    total: 100,
    platform_fee: 10,
    channel: "campaign",
    discount_amount: 1,
  }));

  test("scales only when payback burden stays inside the configured GMV uplift limit", () => {
    const [campaign] = summarizeRevenueByChannel(campaignOrders());

    expect(campaign.requiredGmvUpliftRate).toBeCloseTo(38.8888888889, 8);
    expect(campaign.maxRequiredGmvUpliftForScale).toBe(50);
    expect(campaign.paybackStatus).toBe("efficient");
    expect(campaign.recommendedAction).toBe("scale");
  });

  test("does not recommend scaling when reinvestment would require disproportionate GMV growth", () => {
    const [campaign] = summarizeRevenueByChannel(campaignOrders(), {
      reinvestmentSafetyFactor: 1,
    });

    expect(campaign.netTakeRateGap).toBe(7);
    expect(campaign.evidenceStatus).toBe("sufficient");
    expect(campaign.safeReinvestmentBudget).toBe(35);
    expect(campaign.requiredGmvUpliftRate).toBeCloseTo(77.7777777778, 8);
    expect(campaign.paybackStatus).toBe("high_burden");
    expect(campaign.recommendedAction).toBe("maintain");
  });

  test("supports a stricter or looser payback threshold without changing prices or fees", () => {
    const [strict] = summarizeRevenueByChannel(campaignOrders(), {
      maxRequiredGmvUpliftForScale: 30,
    });
    const [loose] = summarizeRevenueByChannel(campaignOrders(), {
      maxRequiredGmvUpliftForScale: 40,
    });

    expect(strict.paybackStatus).toBe("high_burden");
    expect(strict.recommendedAction).toBe("maintain");
    expect(loose.paybackStatus).toBe("efficient");
    expect(loose.recommendedAction).toBe("scale");
  });

  test("marks payback as not applicable when there is no safe reinvestment budget", () => {
    const [coupon] = summarizeRevenueByChannel([
      {
        status: "paid",
        total: 100,
        platform_fee: 8,
        coupon_code: "LOSS",
        discount_amount: 7,
      },
    ]);

    expect(coupon.safeReinvestmentBudget).toBe(0);
    expect(coupon.paybackStatus).toBe("not_applicable");
    expect(coupon.recommendedAction).toBe("reduce_cost");
  });
});
