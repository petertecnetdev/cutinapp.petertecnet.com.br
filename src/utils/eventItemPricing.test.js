import { effectiveEventItemPrice, hasEventItemDiscount, isEventItemPromotionEnabled } from "./eventItemPricing";

test("uses the active promotional price in the public item flow", () => {
  const item = { price: "25.00", promotion_enabled: true, promotion_price: "19.90" };
  expect(isEventItemPromotionEnabled(item)).toBe(true);
  expect(effectiveEventItemPrice(item)).toBe(19.9);
  expect(hasEventItemDiscount(item)).toBe(true);
});

test("falls back to the regular price when promotion is disabled", () => expect(effectiveEventItemPrice({ price: "25.00", promotion_enabled: false, promotion_price: "10.00" })).toBe(25));

test("supports a zero-price promotion", () => expect(effectiveEventItemPrice({ price: 12, promotion_enabled: true, promotion_price: 0 })).toBe(0));
test("ignores a negative promotion price", () => expect(effectiveEventItemPrice({ price: 12, promotion_enabled: true, promotion_price: -1 })).toBe(12));
