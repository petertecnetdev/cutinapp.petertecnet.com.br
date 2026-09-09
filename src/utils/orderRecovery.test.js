import { checkoutSelectionFromOrder, latestPaymentFromOrder, latestPendingPaymentFromOrder, paymentMethodFromOrder } from "./orderRecovery";

describe("orderRecovery", () => {
  test("rebuilds a checkout selection from persisted order lines", () => {
    expect(checkoutSelectionFromOrder({
      items: [
        { type: "ticket", ticket_id: 12, quantity: 2 },
        { type: "item", event_item_id: 31, quantity: 1 },
      ],
    })).toEqual({ tickets: [{ id: 12, quantity: 2 }], items: [{ id: 31, quantity: 1 }] });
  });

  test("uses the newest persisted payment when resuming PIX", () => {
    expect(latestPendingPaymentFromOrder({ payments: [{ id: 2 }, { id: 9 }, { id: 4 }] })).toEqual({ id: 9 });
  });

  test("uses the newest persisted payment for purchase status and recovery decisions", () => {
    expect(latestPaymentFromOrder({
      payments: [
        { id: 11, method: "card", status: "rejected" },
        { id: 14, method: "pix", status: "pending" },
        { id: 12, method: "card", status: "cancelled" },
      ],
    })).toEqual({ id: 14, method: "pix", status: "pending" });
  });

  test("prefers the newest attempt method over a stale order-level method", () => {
    expect(paymentMethodFromOrder({
      payment_method: "card",
      payments: [
        { id: 11, method: "card", status: "rejected" },
        { id: 14, method: "PIX", status: "pending" },
      ],
    })).toBe("pix");
  });

  test("falls back to the order-level payment method when no payment exists", () => {
    expect(paymentMethodFromOrder({ payment_method: "CARD", payments: [] })).toBe("card");
  });

  test("returns null when the order has no payments", () => {
    expect(latestPaymentFromOrder({ payments: [] })).toBeNull();
  });
});
