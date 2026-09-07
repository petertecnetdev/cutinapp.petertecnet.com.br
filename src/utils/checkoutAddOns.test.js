import { rankCheckoutAddOns, summarizeCheckoutAddOnOffer } from "./checkoutAddOns";

describe("rankCheckoutAddOns", () => {
  test("prioritizes explicit merchandising priority before the automatic value ladder", () => {
    const items = [
      { id: 1, name: "Premium", price: 80 },
      { id: 2, name: "Prioritário", price: 120, checkout_priority: 1 },
      { id: 3, name: "Econômico", price: 20 },
    ];

    expect(rankCheckoutAddOns(items, new Set(), 3).map((item) => item.id)).toEqual([2, 3, 1]);
  });

  test("keeps an affordable option while exposing mid and premium value", () => {
    const items = [
      { id: 1, price: 70 },
      { id: 2, price: 15 },
      { id: 3, price: 35 },
      { id: 4, price: 25 },
    ];

    expect(rankCheckoutAddOns(items, new Set(), 3).map((item) => item.id)).toEqual([2, 3, 1]);
  });

  test("does not override explicit producer priority when it fills the available slots", () => {
    const items = [
      { id: 1, price: 15, checkout_priority: 3 },
      { id: 2, price: 80, checkout_priority: 1 },
      { id: 3, price: 35, checkout_priority: 2 },
      { id: 4, price: 150 },
    ];

    expect(rankCheckoutAddOns(items, new Set(), 3).map((item) => item.id)).toEqual([2, 3, 1]);
  });

  test("excludes selected and non-positive items", () => {
    const items = [
      { id: 1, price: 10 },
      { id: 2, price: 0 },
      { id: 3, price: 20 },
    ];

    expect(rankCheckoutAddOns(items, new Set([1]), 3).map((item) => item.id)).toEqual([3]);
  });
});

describe("summarizeCheckoutAddOnOffer", () => {
  test("captures the exact items and value exposed to the buyer", () => {
    expect(summarizeCheckoutAddOnOffer([
      { id: 8, price: 12.5 },
      { id: 11, price: "30" },
      { id: 14, price: 7 },
    ])).toEqual({
      offered_items: 3,
      offered_item_ids: "8,11,14",
      offered_item_prices: "12.50,30.00,7.00",
      offered_value: 49.5,
      min_addon_price: 7,
    });
  });

  test("ignores invalid or free entries from monetization exposure", () => {
    expect(summarizeCheckoutAddOnOffer([
      { id: 1, price: 0 },
      { price: 20 },
      { id: 2, price: 15 },
    ])).toEqual({
      offered_items: 1,
      offered_item_ids: "2",
      offered_item_prices: "15.00",
      offered_value: 15,
      min_addon_price: 15,
    });
  });
});
