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
});
