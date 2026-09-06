import { resolveCheckoutPaymentMethod } from "./paymentMethod";

describe("resolveCheckoutPaymentMethod", () => {
  test("restores card from an order recovered after reopening", () => {
    expect(resolveCheckoutPaymentMethod({ order: { payment_method: "card" } })).toBe("card");
  });

  test("falls back to the payment record when the order omits the method", () => {
    expect(resolveCheckoutPaymentMethod({ payment: { method: "pix" } }, "card")).toBe("pix");
  });

  test("ignores unsupported or malformed methods", () => {
    expect(resolveCheckoutPaymentMethod({ order: { payment_method: "cash" } }, "card")).toBe("card");
    expect(resolveCheckoutPaymentMethod(null)).toBe("pix");
  });
});
