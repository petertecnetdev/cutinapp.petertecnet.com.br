import { addOnRevenueMateriality, compareAddOnOpportunities } from "./addOnOpportunity";

test("measures incremental net revenue materiality against current event net revenue", () => {
  expect(addOnRevenueMateriality({ incrementalNetRevenue: 25, netPlatformRevenue: 100 })).toBe(25);
  expect(addOnRevenueMateriality({ incrementalNetRevenue: 25, netPlatformRevenue: 0 })).toBe(100);
  expect(addOnRevenueMateriality({ incrementalNetRevenue: 0, netPlatformRevenue: 100 })).toBe(0);
  expect(addOnRevenueMateriality({ incrementalNetRevenue: 250, netPlatformRevenue: 100 })).toBe(100);
});

test("uses net revenue materiality before historical revenue when economics are otherwise tied", () => {
  const opportunities = [
    {
      id: "large-established-event",
      addOnProfitable: true,
      incrementalNetRevenue: 40,
      evidenceFactor: 1,
      incrementalNetMargin: 5,
      netRevenuePerIncrementalOrder: 10,
      netRevenuePerAttachmentPoint: 4,
      paidCount: 50,
      addOnOrders: 30,
      netPlatformRevenue: 400,
    },
    {
      id: "material-growth-event",
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
    "material-growth-event",
    "large-established-event",
  ]);
});
