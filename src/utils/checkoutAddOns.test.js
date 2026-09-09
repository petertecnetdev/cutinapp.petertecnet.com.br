import {
  CHECKOUT_QUANTITY_LIMITS,
  checkoutQuantityLimit,
  rankCheckoutAddOns,
  resolveCheckoutQuantity,
  summarizeCheckoutAddOnOffer,
} from "./checkoutAddOns";

describe("checkout quantity policy", () => {
  test("keeps technical limits explicit without imposing a 20-ticket business cap", () => {
    expect(CHECKOUT_QUANTITY_LIMITS).toEqual({ ticket: 100000, item: 50 });
    expect(checkoutQuantityLimit("ticket")).toBe(100000);
    expect(checkoutQuantityLimit("item")).toBe(50);
    expect(checkoutQuantityLimit("unknown")).toBe(0);
  });
});

describe("rankCheckoutAddOns", () => {
  test("prioritizes explicit merchandising priority before the automatic value ladder", () => {
    const items = [
      { id: 1, name: "Premium", price: 80, remaining: 5 },
      { id: 2, name: "Prioritário", price: 120, checkout_priority: 1, remaining: 5 },
      { id: 3, name: "Econômico", price: 20, remaining: 5 },
    ];

    expect(rankCheckoutAddOns(items, new Set(), 3).map((item) => item.id)).toEqual([2, 3, 1]);
  });

  test("keeps an affordable option while exposing mid and premium value", () => {
    const items = [
      { id: 1, price: 70, remaining: 5 },
      { id: 2, price: 15, remaining: 5 },
      { id: 3, price: 35, remaining: 5 },
      { id: 4, price: 25, remaining: 5 },
    ];

    expect(rankCheckoutAddOns(items, new Set(), 3).map((item) => item.id)).toEqual([2, 3, 1]);
  });

  test("does not override explicit producer priority when it fills the available slots", () => {
    const items = [
      { id: 1, price: 15, checkout_priority: 3, remaining: 5 },
      { id: 2, price: 80, checkout_priority: 1, remaining: 5 },
      { id: 3, price: 35, checkout_priority: 2, remaining: 5 },
      { id: 4, price: 150, remaining: 5 },
    ];

    expect(rankCheckoutAddOns(items, new Set(), 3).map((item) => item.id)).toEqual([2, 3, 1]);
  });

  test("excludes selected and non-positive items", () => {
    const items = [
      { id: 1, price: 10, remaining: 5 },
      { id: 2, price: 0, remaining: 5 },
      { id: 3, price: 20, remaining: 5 },
    ];

    expect(rankCheckoutAddOns(items, new Set([1]), 3).map((item) => item.id)).toEqual([3]);
  });

  test("never offers unavailable, expired or sold-out add-ons", () => {
    const items = [
      { id: 1, price: 10, remaining: 0 },
      { id: 2, price: 20, remaining: 5, available: false },
      { id: 3, price: 30, remaining: 5, expired: true },
      { id: 4, price: 40, remaining: 2 },
    ];

    expect(rankCheckoutAddOns(items, new Set(), 3).map((item) => item.id)).toEqual([4]);
  });

  test("keeps valid add-ons that do not use explicit stock tracking", () => {
    const items = [
      { id: 1, price: 15, available: true },
      { id: 2, price: 30, quantity: null },
      { id: 3, price: 45, remaining: 0 },
    ];

    expect(rankCheckoutAddOns(items, new Set(), 3).map((item) => item.id)).toEqual([1, 2]);
  });

  test("does not offer a ticket when the authenticated user reached the producer limit", () => {
    const items = [
      { id: 1, price: 30, remaining: 10, remaining_per_user: 0 },
      { id: 2, price: 40, remaining: 10, remaining_per_user: 2 },
    ];

    expect(rankCheckoutAddOns(items, new Set(), 3).map((item) => item.id)).toEqual([2]);
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

describe("resolveCheckoutQuantity", () => {
  test("keeps unmanaged-stock items selectable up to the checkout limit", () => {
    expect(resolveCheckoutQuantity({ id: 1, available: true }, 3, 10)).toBe(3);
    expect(resolveCheckoutQuantity({ id: 1, quantity: null }, 12, 10)).toBe(10);
  });

  test("still respects explicit stock and availability", () => {
    expect(resolveCheckoutQuantity({ id: 1, remaining: 2 }, 5, 10)).toBe(2);
    expect(resolveCheckoutQuantity({ id: 1, remaining: 0 }, 1, 10)).toBe(0);
    expect(resolveCheckoutQuantity({ id: 1, available: false }, 1, 10)).toBe(0);
    expect(resolveCheckoutQuantity({ id: 1, expired: true }, 1, 10)).toBe(0);
  });

  test("respects the producer cumulative allowance for the current user", () => {
    expect(resolveCheckoutQuantity({ id: 1, remaining: 20, remaining_per_user: 3 }, 8, 100000)).toBe(3);
    expect(resolveCheckoutQuantity({ id: 1, remaining: 20, remaining_per_user: 0 }, 1, 100000)).toBe(0);
    expect(resolveCheckoutQuantity({ id: 1, remaining: 2, remaining_per_user: 8 }, 8, 100000)).toBe(2);
  });

  test("normalizes malformed quantities before they can reach checkout totals or payment payloads", () => {
    expect(resolveCheckoutQuantity({ id: 1, remaining: 8 }, "not-a-number", 10)).toBe(0);
    expect(resolveCheckoutQuantity({ id: 1, remaining: 8 }, Number.NaN, 10)).toBe(0);
    expect(resolveCheckoutQuantity({ id: 1, remaining: 8 }, Number.POSITIVE_INFINITY, 10)).toBe(0);
    expect(resolveCheckoutQuantity({ id: 1, remaining: 8 }, -3, 10)).toBe(0);
  });

  test("keeps quantities integer-safe across requested values, limits and stock", () => {
    expect(resolveCheckoutQuantity({ id: 1, remaining: 8 }, 3.9, 10)).toBe(3);
    expect(resolveCheckoutQuantity({ id: 1, remaining: 8.7 }, 9, 10)).toBe(8);
    expect(resolveCheckoutQuantity({ id: 1, remaining: 20 }, 9, 4.8)).toBe(4);
  });
});
