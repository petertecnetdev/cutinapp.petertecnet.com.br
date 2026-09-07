import { commissionDealPreview } from "./commissionDealPreview";

describe("commissionDealPreview", () => {
  it("projects paid-ticket GMV and economic reserves at sellout", () => {
    expect(commissionDealPreview({
      tickets: [
        { quantity: 100, price: 25 },
        { quantity: 50, price: 40 },
        { quantity: 20, price: 0 },
      ],
      commissionPercentage: 8,
      minimumRetainedMarginPercentage: 3,
      processingReservePercentage: 4.5,
    })).toEqual({
      selloutGmv: 4500,
      paidCapacity: 150,
      averagePaidTicket: 30,
      agentCommissionAtSellout: 360,
      minimumPeterRetainedAtSellout: 135,
      processingReserveAtSellout: 202.5,
    });
  });

  it("ignores free, invalid and negative ticket values", () => {
    expect(commissionDealPreview({
      tickets: [
        { quantity: 100, price: 0 },
        { quantity: -2, price: 50 },
        { quantity: 10, price: "invalid" },
      ],
      commissionPercentage: 10,
      minimumRetainedMarginPercentage: 2,
    })).toMatchObject({ selloutGmv: 0, paidCapacity: 0, agentCommissionAtSellout: 0, minimumPeterRetainedAtSellout: 0 });
  });
});
