import { addOnMarginGuard, addOnMonetizationEfficiency, compareAddOnOpportunities, confidenceAdjustedAddOnNetRevenue, estimateAddOnAttachmentOpportunity, suggestedAddOnStock, weightedAverageAddOnUnitPrice } from "./addOnOpportunity";

test("uses production benchmark for events without add-on history", () => {
  expect(estimateAddOnAttachmentOpportunity({ paidCount: 50, addOnOrders: 0, averageAddOnValue: 0, benchmarkAddOnValue: 20, takeRate: 8 }))
    .toMatchObject({ incrementalOrders: 5, incrementalGmv: 100, incrementalPlatformRevenue: 8, benchmarkUsed: true, evidenceFactor: 1, projectedOrders: 5, minimumActionableOrders: 1 });
});

test("prefers observed event value when available", () => {
  expect(estimateAddOnAttachmentOpportunity({ paidCount: 100, addOnOrders: 20, averageAddOnValue: 30, benchmarkAddOnValue: 15, takeRate: 10 }))
    .toMatchObject({ incrementalGmv: 300, incrementalPlatformRevenue: 30, benchmarkUsed: false, evidenceFactor: 1 });
});

test("waits for at least one actionable projected add-on order while evidence is thin", () => {
  expect(estimateAddOnAttachmentOpportunity({ paidCount: 5, addOnOrders: 0, averageAddOnValue: 20, takeRate: 10 }))
    .toMatchObject({ incrementalOrders: 0, incrementalGmv: 0, incrementalPlatformRevenue: 0, evidenceFactor: 0.25, projectedOrders: 0.125, minimumActionableOrders: 1 });
  expect(estimateAddOnAttachmentOpportunity({ paidCount: 10, addOnOrders: 0, averageAddOnValue: 20, takeRate: 10, fullEvidencePaidOrders: 10 }))
    .toMatchObject({ incrementalOrders: 1, evidenceFactor: 1, projectedOrders: 1 });
});

test("allows calibrating the minimum actionable add-on demand", () => {
  expect(estimateAddOnAttachmentOpportunity({ paidCount: 10, addOnOrders: 0, averageAddOnValue: 50, takeRate: 10, fullEvidencePaidOrders: 20, minimumActionableOrders: 0.5 }))
    .toMatchObject({ incrementalOrders: 0.5, incrementalGmv: 25, incrementalPlatformRevenue: 2.5, projectedOrders: 0.5, minimumActionableOrders: 0.5 });
  expect(estimateAddOnAttachmentOpportunity({ paidCount: 10, addOnOrders: 0, averageAddOnValue: 50, takeRate: 10, fullEvidencePaidOrders: 20, minimumActionableOrders: 2 }))
    .toMatchObject({ incrementalOrders: 0, incrementalGmv: 0, incrementalPlatformRevenue: 0, projectedOrders: 0.5, minimumActionableOrders: 2 });
});

test("suggests editable stock with a bounded demand buffer", () => {
  expect(suggestedAddOnStock(0)).toBe(0);
  expect(suggestedAddOnStock(0.2)).toBe(1);
  expect(suggestedAddOnStock(4.1)).toBe(5);
  expect(suggestedAddOnStock(5)).toBe(6);
  expect(suggestedAddOnStock(250)).toBe(100);
  expect(suggestedAddOnStock(10, 100, 0)).toBe(10);
  expect(suggestedAddOnStock(10, 100, 50)).toBe(15);
  expect(suggestedAddOnStock(10, 100, 500)).toBe(20);
});

test("calculates weighted unit price instead of add-on basket value", () => {
  expect(weightedAverageAddOnUnitPrice([
    { unit_price: 20, quantity: 2 },
    { unit_price: 35, quantity: 1 },
  ])).toBe(25);
});

test("ignores invalid add-on units when calculating suggested price", () => {
  expect(weightedAverageAddOnUnitPrice([
    { unit_price: 0, quantity: 2 },
    { unit_price: 15, quantity: 0 },
    { unit_price: 12, quantity: 3 },
  ])).toBe(12);
});

test("translates add-on upside into net revenue per attachment point and incremental order", () => {
  expect(addOnMonetizationEfficiency({ incrementalNetRevenue: 120, incrementalOrders: 6, attachmentUpliftPoints: 10 })).toEqual({
    netRevenuePerAttachmentPoint: 12,
    netRevenuePerIncrementalOrder: 20,
  });
});

test("keeps monetization efficiency finite when projected incremental orders are zero", () => {
  expect(addOnMonetizationEfficiency({ incrementalNetRevenue: 100 })).toEqual({
    netRevenuePerAttachmentPoint: 10,
    netRevenuePerIncrementalOrder: 0,
  });
});

test("only prioritizes add-on upside with positive net platform contribution", () => {
  expect(addOnMarginGuard({ incrementalGmv: 200, incrementalNetRevenue: 18 })).toMatchObject({ profitable: true, netMargin: 9, minimumNetRevenue: 5 });
  expect(addOnMarginGuard({ incrementalGmv: 200, incrementalNetRevenue: 0 })).toMatchObject({ profitable: false, netMargin: 0, minimumNetRevenue: 5 });
  expect(addOnMarginGuard({ incrementalGmv: 0, incrementalNetRevenue: 20 })).toMatchObject({ profitable: false, netMargin: 0, minimumNetRevenue: 5 });
});

test("requires a minimum net margin before recommending add-on expansion", () => {
  expect(addOnMarginGuard({ incrementalGmv: 1000, incrementalNetRevenue: 15 })).toMatchObject({ profitable: false, netMargin: 1.5 });
  expect(addOnMarginGuard({ incrementalGmv: 1000, incrementalNetRevenue: 25 })).toMatchObject({ profitable: true, netMargin: 2.5 });
  expect(addOnMarginGuard({ incrementalGmv: 1000, incrementalNetRevenue: 15, minimumNetMargin: 1 })).toMatchObject({ profitable: true, netMargin: 1.5 });
});

test("requires projected net revenue to justify producer attention", () => {
  expect(addOnMarginGuard({ incrementalGmv: 100, incrementalNetRevenue: 4.99 }))
    .toMatchObject({ profitable: false, netMargin: 4.99, minimumNetRevenue: 5 });
  expect(addOnMarginGuard({ incrementalGmv: 100, incrementalNetRevenue: 5 }))
    .toMatchObject({ profitable: true, netMargin: 5, minimumNetRevenue: 5 });
  expect(addOnMarginGuard({ incrementalGmv: 1000, incrementalNetRevenue: 25, minimumNetRevenue: 30 }))
    .toMatchObject({ profitable: false, netMargin: 2.5, minimumNetRevenue: 30 });
  const strongOpportunity = addOnMarginGuard({ incrementalGmv: 1000, incrementalNetRevenue: 35, minimumNetRevenue: 30 });
  expect(strongOpportunity).toMatchObject({ profitable: true, minimumNetRevenue: 30 });
  expect(strongOpportunity.netMargin).toBeCloseTo(3.5, 8);
});

test("discounts projected net revenue when evidence is still thin", () => {
  expect(confidenceAdjustedAddOnNetRevenue({ incrementalNetRevenue: 80, evidenceFactor: 0.25 })).toBe(20);
  expect(confidenceAdjustedAddOnNetRevenue({ incrementalNetRevenue: 80, evidenceFactor: 1 })).toBe(80);
  expect(confidenceAdjustedAddOnNetRevenue({ incrementalNetRevenue: 80, evidenceFactor: 2 })).toBe(80);
});

test("ranks profitable add-on opportunities by confidence-adjusted net revenue", () => {
  const opportunities = [
    { id: "thin-evidence", addOnProfitable: true, incrementalNetRevenue: 80, evidenceFactor: 0.25, netPlatformRevenue: 500 },
    { id: "proven", addOnProfitable: true, incrementalNetRevenue: 30, evidenceFactor: 1, netPlatformRevenue: 100 },
    { id: "low-margin", addOnProfitable: false, incrementalNetRevenue: 100, evidenceFactor: 1, netPlatformRevenue: 500 },
  ];

  expect(opportunities.sort(compareAddOnOpportunities).map(({ id }) => id)).toEqual([
    "proven",
    "thin-evidence",
    "low-margin",
  ]);
});

test("preserves raw net revenue as tie-breaker after confidence adjustment", () => {
  const opportunities = [
    { id: "higher-raw", addOnProfitable: true, incrementalNetRevenue: 40, evidenceFactor: 0.5, netPlatformRevenue: 80 },
    { id: "lower-raw", addOnProfitable: true, incrementalNetRevenue: 20, evidenceFactor: 1, netPlatformRevenue: 200 },
  ];

  expect(opportunities.sort(compareAddOnOpportunities).map(({ id }) => id)).toEqual(["higher-raw", "lower-raw"]);
});

test("uses net revenue per incremental order before historical revenue when upside is tied", () => {
  const opportunities = [
    { id: "higher-history", addOnProfitable: true, incrementalNetRevenue: 40, evidenceFactor: 1, netRevenuePerIncrementalOrder: 8, netPlatformRevenue: 500 },
    { id: "higher-unit-contribution", addOnProfitable: true, incrementalNetRevenue: 40, evidenceFactor: 1, netRevenuePerIncrementalOrder: 20, netPlatformRevenue: 100 },
  ];

  expect(opportunities.sort(compareAddOnOpportunities).map(({ id }) => id)).toEqual(["higher-unit-contribution", "higher-history"]);
});
