import { rankCheckoutAddOns } from "./checkoutAddOns";

describe("rankCheckoutAddOns", () => {
  test("prioritizes explicit merchandising priority before price", () => {
    const items = [
      { id: 1, name: "Premium", price: 80 },
      { id: 2, name: "Prioritário", price: 120, checkout_priority: 1 },
      { id: 3, name: "Econômico", price: 20 },
    ];

    expect(rankCheckoutAddOns(items, new Set(), 3).map((item) => item.id)).toEqual([2, 3, 1]);
  });

  test("uses lower-friction price ordering when no priority is configured", () => {
    const items = [
      { id: 1, price: 70 },
      { id: 2, price: 15 },
      { id: 3, price: 35 },
      { id: 4, price: 25 },
    ];

    expect(rankCheckoutAddOns(items, new Set(), 3).map((item) => item.id)).toEqual([2, 4, 3]);
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
