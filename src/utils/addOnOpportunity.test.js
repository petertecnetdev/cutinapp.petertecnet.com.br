import { estimateAddOnAttachmentOpportunity, suggestedAddOnStock, weightedAverageAddOnUnitPrice } from "./addOnOpportunity";

test("uses production benchmark for events without add-on history", () => {
  expect(estimateAddOnAttachmentOpportunity({ paidCount: 50, addOnOrders: 0, averageAddOnValue: 0, benchmarkAddOnValue: 20, takeRate: 8 }))
    .toMatchObject({ incrementalOrders: 5, incrementalGmv: 100, incrementalPlatformRevenue: 8, benchmarkUsed: true });
});

test("prefers observed event value when available", () => {
  expect(estimateAddOnAttachmentOpportunity({ paidCount: 100, addOnOrders: 20, averageAddOnValue: 30, benchmarkAddOnValue: 15, takeRate: 10 }))
    .toMatchObject({ incrementalGmv: 300, incrementalPlatformRevenue: 30, benchmarkUsed: false });
});

test("suggests conservative editable stock from projected incremental orders", () => {
  expect(suggestedAddOnStock(0)).toBe(0);
  expect(suggestedAddOnStock(0.2)).toBe(1);
  expect(suggestedAddOnStock(4.1)).toBe(5);
  expect(suggestedAddOnStock(250)).toBe(100);
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
