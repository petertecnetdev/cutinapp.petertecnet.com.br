import { summarizeRevenueByChannel } from "./channelRevenueEconomics";

describe("channel economic cost ceilings", () => {
  test("exposes the maximum promoter commission that preserves the net take-rate floor", () => {
    const [promoter] = summarizeRevenueByChannel([
      {
        status: "paid",
        total: 100,
        platform_fee: 12,
        promoter_id: 10,
        promoter_commission: 3,
        processor_fee: 2,
        metadata: { settlement_mode: "platform_collection" },
      },
    ], { minNetTakeRate: 2 });

    expect(promoter.netRevenue).toBe(7);
    expect(promoter.netRevenueHeadroomAboveFloor).toBe(5);
    expect(promoter.maxPromoterCommission).toBe(8);
    expect(promoter.maxPromoterCommissionRate).toBe(8);
    expect(promoter.maxPromoterCommissionPerOrder).toBe(8);
  });

  test("keeps coupon cost fixed when calculating promoter commission capacity", () => {
    const [promoter] = summarizeRevenueByChannel([
      {
        status: "paid",
        total: 100,
        platform_fee: 15,
        promoter_id: 10,
        promoter_commission: 4,
        discount_amount: 3,
      },
    ], { minNetTakeRate: 2 });

    expect(promoter.variableChannelCosts).toBe(7);
    expect(promoter.netRevenue).toBe(8);
    expect(promoter.maxPromoterCommission).toBe(10);
    expect(promoter.maxVariableChannelCosts).toBe(13);
    expect(promoter.maxVariableChannelCostRate).toBe(13);
  });

  test("does not expose extra variable-cost capacity when the channel is below the floor", () => {
    const [campaign] = summarizeRevenueByChannel([
      {
        status: "paid",
        total: 100,
        platform_fee: 3,
        channel: "campaign",
        discount_amount: 2,
      },
    ], { minNetTakeRate: 2 });

    expect(campaign.netRevenue).toBe(1);
    expect(campaign.economicStatus).toBe("below_floor");
    expect(campaign.netRevenueHeadroomAboveFloor).toBe(0);
    expect(campaign.maxVariableChannelCosts).toBe(2);
    expect(campaign.maxVariableChannelCostRate).toBe(2);
  });
});
