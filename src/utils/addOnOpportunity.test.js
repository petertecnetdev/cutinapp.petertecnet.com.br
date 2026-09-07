import { estimateAddOnAttachmentOpportunity, suggestedAddOnStock } from "./addOnOpportunity";

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
