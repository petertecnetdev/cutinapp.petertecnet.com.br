import { attributionForOrder, summarizeRevenueByChannel } from "./channelRevenueEconomics";

describe("revenue channel attribution", () => {
  test("prioritizes promoter and coupon attribution without exposing personal data", () => {
    expect(attributionForOrder({ promoter_id: 7, coupon_code: "VIP" }).key).toBe("promoter");
    expect(attributionForOrder({ coupon: { code: "VIP" } }).key).toBe("coupon");
    expect(attributionForOrder({ metadata: { sales_channel: "campaign" } }).key).toBe("campaign");
    expect(attributionForOrder({}).key).toBe("organic");
  });

  test("measures GMV, take rate, net revenue and margin after channel costs", () => {
    const [promoter] = summarizeRevenueByChannel([
      {
        status: "paid",
        total: 200,
        platform_fee: 20,
        processor_fee: 4,
        promoter_id: 9,
        promoter_commission: 5,
        metadata: { settlement_mode: "platform_collection" },
      },
    ]);

    expect(promoter.key).toBe("promoter");
    expect(promoter.gmv).toBe(200);
    expect(promoter.platformRevenue).toBe(20);
    expect(promoter.processorFeesBorneByPlatform).toBe(4);
    expect(promoter.promoterCommission).toBe(5);
    expect(promoter.netRevenue).toBe(11);
    expect(promoter.netTakeRate).toBeCloseTo(5.5, 8);
    expect(promoter.contributionMargin).toBeCloseTo(55, 8);
    expect(promoter.netRevenuePerOrder).toBe(11);
  });

  test("makes coupon impact measurable instead of treating discount as free growth", () => {
    const [coupon] = summarizeRevenueByChannel([
      {
        payment_status: "paid",
        total_price: 100,
        platform_fee: 12,
        coupon_code: "WELCOME",
        discount_amount: 6,
      },
    ]);

    expect(coupon.key).toBe("coupon");
    expect(coupon.discountAmount).toBe(6);
    expect(coupon.netRevenue).toBe(6);
    expect(coupon.netTakeRate).toBe(6);
  });

  test("does not charge processor cost to Peter Tecnet when settlement is not platform collection", () => {
    const [organic] = summarizeRevenueByChannel([
      {
        status: "paid",
        total: 100,
        platform_fee: 10,
        processor_fee: 3,
        metadata: { settlement_mode: "producer_collection" },
      },
    ]);

    expect(organic.processorFeesBorneByPlatform).toBe(0);
    expect(organic.netRevenue).toBe(10);
  });

  test("ranks channels by realized net revenue before raw GMV", () => {
    const channels = summarizeRevenueByChannel([
      { status: "paid", total: 300, platform_fee: 15, promoter_id: 1, promoter_commission: 10 },
      { status: "paid", total: 150, platform_fee: 15 },
    ]);

    expect(channels.map((channel) => channel.key)).toEqual(["organic", "promoter"]);
    expect(channels[0].netRevenue).toBe(15);
    expect(channels[1].netRevenue).toBe(5);
  });

  test("flags channels below the minimum net take rate instead of treating GMV as healthy revenue", () => {
    const [campaign] = summarizeRevenueByChannel([
      {
        status: "paid",
        total: 100,
        platform_fee: 8,
        channel: "campaign",
        discount_amount: 7,
      },
    ]);

    expect(campaign.netRevenue).toBe(1);
    expect(campaign.netTakeRate).toBe(1);
    expect(campaign.minimumNetTakeRate).toBe(2);
    expect(campaign.netTakeRateGap).toBe(-1);
    expect(campaign.netRevenueHeadroomAboveFloor).toBe(0);
    expect(campaign.additionalCostCapacityPerOrder).toBe(0);
    expect(campaign.safeReinvestmentBudget).toBe(0);
    expect(campaign.reinvestmentBreakEvenGmv).toBe(0);
    expect(campaign.reinvestmentBreakEvenOrders).toBe(0);
    expect(campaign.requiredGmvUpliftRate).toBe(0);
    expect(campaign.recommendedAction).toBe("reduce_cost");
    expect(campaign.economicStatus).toBe("below_floor");
  });

  test("measures how much channel cost can increase before crossing the economic floor", () => {
    const [promoter] = summarizeRevenueByChannel([
      {
        status: "paid",
        total: 200,
        platform_fee: 20,
        promoter_id: 3,
        promoter_commission: 4,
      },
      {
        status: "paid",
        total: 200,
        platform_fee: 20,
        promoter_id: 3,
        promoter_commission: 4,
      },
    ]);

    expect(promoter.variableChannelCosts).toBe(8);
    expect(promoter.channelCostRate).toBe(2);
    expect(promoter.netRevenue).toBe(32);
    expect(promoter.minimumNetRevenue).toBe(8);
    expect(promoter.netRevenueHeadroomAboveFloor).toBe(24);
    expect(promoter.additionalCostCapacityPerOrder).toBe(12);
    expect(promoter.safeReinvestmentBudget).toBe(12);
    expect(promoter.safeReinvestmentPerOrder).toBe(6);
    expect(promoter.reinvestmentBreakEvenGmv).toBe(150);
    expect(promoter.reinvestmentBreakEvenOrders).toBe(0.75);
    expect(promoter.requiredGmvUpliftRate).toBe(37.5);
    expect(promoter.evidenceStatus).toBe("limited");
    expect(promoter.recommendedAction).toBe("test");
    expect(promoter.economicStatus).toBe("healthy");
  });

  test("recommends scaling only when evidence and take-rate headroom are sufficient", () => {
    const orders = Array.from({ length: 5 }, () => ({
      status: "paid",
      total: 100,
      platform_fee: 10,
      channel: "campaign",
      discount_amount: 1,
    }));
    const [campaign] = summarizeRevenueByChannel(orders);

    expect(campaign.paidOrders).toBe(5);
    expect(campaign.netTakeRate).toBe(9);
    expect(campaign.netTakeRateGap).toBe(7);
    expect(campaign.netRevenueHeadroomAboveFloor).toBe(35);
    expect(campaign.safeReinvestmentBudget).toBe(17.5);
    expect(campaign.safeReinvestmentPerOrder).toBe(3.5);
    expect(campaign.reinvestmentBreakEvenGmv).toBeCloseTo(194.4444444444, 8);
    expect(campaign.reinvestmentBreakEvenOrders).toBeCloseTo(1.9444444444, 8);
    expect(campaign.requiredGmvUpliftRate).toBeCloseTo(38.8888888889, 8);
    expect(campaign.evidenceStatus).toBe("sufficient");
    expect(campaign.recommendedAction).toBe("scale");
  });

  test("keeps only a configurable safety fraction of headroom available for reinvestment", () => {
    const orders = Array.from({ length: 5 }, () => ({ status: "paid", total: 100, platform_fee: 10 }));
    const [organic] = summarizeRevenueByChannel(orders, { reinvestmentSafetyFactor: 0.25 });

    expect(organic.netRevenueHeadroomAboveFloor).toBe(40);
    expect(organic.safeReinvestmentBudget).toBe(10);
    expect(organic.safeReinvestmentPerOrder).toBe(2);
    expect(organic.reinvestmentBreakEvenGmv).toBe(100);
    expect(organic.reinvestmentBreakEvenOrders).toBe(1);
    expect(organic.requiredGmvUpliftRate).toBe(20);
  });

  test("bounds reinvestment safety factor so recommendations never spend beyond economic headroom", () => {
    const orders = Array.from({ length: 5 }, () => ({ status: "paid", total: 100, platform_fee: 10 }));
    const [organic] = summarizeRevenueByChannel(orders, { reinvestmentSafetyFactor: 5 });

    expect(organic.reinvestmentSafetyFactor).toBe(1);
    expect(organic.safeReinvestmentBudget).toBe(organic.netRevenueHeadroomAboveFloor);
    expect(organic.reinvestmentBreakEvenGmv).toBe(400);
    expect(organic.requiredGmvUpliftRate).toBe(80);
  });

  test("supports a stricter configurable net take rate floor without changing prices or fees", () => {
    const [coupon] = summarizeRevenueByChannel(
      [
        {
          status: "paid",
          total: 100,
          platform_fee: 10,
          coupon_code: "SAFE",
          discount_amount: 4,
        },
      ],
      { minNetTakeRate: 7 },
    );

    expect(coupon.netTakeRate).toBe(6);
    expect(coupon.minimumNetTakeRate).toBe(7);
    expect(coupon.minimumNetRevenue).toBeCloseTo(7, 8);
    expect(coupon.netTakeRateGap).toBe(-1);
    expect(coupon.safeReinvestmentBudget).toBe(0);
    expect(coupon.reinvestmentBreakEvenGmv).toBe(0);
    expect(coupon.recommendedAction).toBe("reduce_cost");
    expect(coupon.economicStatus).toBe("below_floor");
  });
});
