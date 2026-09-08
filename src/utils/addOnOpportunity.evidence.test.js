import { compareAddOnOpportunities, confidenceAdjustedAddOnNetRevenue, estimateAddOnAttachmentOpportunity } from "./addOnOpportunity";

test("marks attachment projections as already evidence-adjusted", () => {
  expect(estimateAddOnAttachmentOpportunity({
    paidCount: 10,
    addOnOrders: 0,
    averageAddOnValue: 100,
    takeRate: 10,
    minimumActionableOrders: 0,
  })).toMatchObject({
    evidenceFactor: 0.5,
    evidenceAdjusted: true,
    projectedOrders: 0.5,
    incrementalPlatformRevenue: 5,
  });
});

test("does not discount net revenue twice when projection already includes evidence", () => {
  expect(confidenceAdjustedAddOnNetRevenue({
    incrementalNetRevenue: 40,
    evidenceFactor: 0.25,
    evidenceAdjusted: true,
  })).toBe(40);
});

test("still discounts legacy or externally supplied projections when evidence was not applied", () => {
  expect(confidenceAdjustedAddOnNetRevenue({
    incrementalNetRevenue: 40,
    evidenceFactor: 0.25,
  })).toBe(10);
});

test("ranks already-adjusted opportunities by their economic net revenue without quadratic evidence penalty", () => {
  const opportunities = [
    {
      id: "new-event-strong-economics",
      addOnProfitable: true,
      incrementalNetRevenue: 40,
      evidenceFactor: 0.5,
      evidenceAdjusted: true,
      incrementalNetMargin: 8,
    },
    {
      id: "mature-event-lower-economics",
      addOnProfitable: true,
      incrementalNetRevenue: 30,
      evidenceFactor: 1,
      evidenceAdjusted: true,
      incrementalNetMargin: 8,
    },
  ];

  expect(opportunities.sort(compareAddOnOpportunities).map(({ id }) => id)).toEqual([
    "new-event-strong-economics",
    "mature-event-lower-economics",
  ]);
});
