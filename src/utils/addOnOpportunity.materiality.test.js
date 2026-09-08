import { addOnRevenueMateriality, compareAddOnOpportunities } from "./addOnOpportunity";

test("measures incremental net revenue as a bounded share of post-uplift net revenue", () => {
  expect(addOnRevenueMateriality({ incrementalNetRevenue: 25, netPlatformRevenue: 100 })).toBe(20);
  expect(addOnRevenueMateriality({ incrementalNetRevenue: 25, netPlatformRevenue: 0 })).toBe(100);
  expect(addOnRevenueMateriality({ incrementalNetRevenue: 0, netPlatformRevenue: 100 })).toBe(0);
  expect(addOnRevenueMateriality({ incrementalNetRevenue: 250, netPlatformRevenue: 100 })).toBeCloseTo(71.428571, 5);
});

test("keeps high-uplift events distinguishable without allowing an unbounded small-base score", () => {
  const moderateUplift = addOnRevenueMateriality({ incrementalNetRevenue: 100, netPlatformRevenue: 100 });
  const highUplift = addOnRevenueMateriality({ incrementalNetRevenue: 300, netPlatformRevenue: 100 });

  expect(moderateUplift).toBe(50);
  expect(highUplift).toBe(75);
  expect(highUplift).toBeLessThan(100);
  expect(highUplift).toBeGreaterThan(moderateUplift);
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
