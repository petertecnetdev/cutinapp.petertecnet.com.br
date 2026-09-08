import { addOnNetRevenuePerEligibleBuyer, compareAddOnOpportunities } from "./addOnOpportunity";

test("measures incremental net revenue per buyer still eligible for an add-on", () => {
  expect(addOnNetRevenuePerEligibleBuyer({ incrementalNetRevenue: 60, paidCount: 100, addOnOrders: 40 })).toBe(1);
  expect(addOnNetRevenuePerEligibleBuyer({ incrementalNetRevenue: 60, paidCount: 40, addOnOrders: 40 })).toBe(0);
});

test("uses eligible-buyer efficiency before historical revenue when other economics are tied", () => {
  const opportunities = [
    {
      id: "larger-base",
      addOnProfitable: true,
      incrementalNetRevenue: 40,
      evidenceFactor: 1,
      incrementalNetMargin: 5,
      netRevenuePerIncrementalOrder: 10,
      netRevenuePerAttachmentPoint: 4,
      paidCount: 100,
      addOnOrders: 20,
      netPlatformRevenue: 500,
    },
    {
      id: "smaller-eligible-base",
      addOnProfitable: true,
      incrementalNetRevenue: 40,
      evidenceFactor: 1,
      incrementalNetMargin: 5,
      netRevenuePerIncrementalOrder: 10,
      netRevenuePerAttachmentPoint: 4,
      paidCount: 50,
      addOnOrders: 30,
      netPlatformRevenue: 100,
    },
  ];

  expect(opportunities.sort(compareAddOnOpportunities).map(({ id }) => id)).toEqual([
    "smaller-eligible-base",
    "larger-base",
  ]);
});
