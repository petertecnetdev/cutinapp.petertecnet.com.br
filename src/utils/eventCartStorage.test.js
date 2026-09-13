import { clearEventCart, isFulfilledCheckoutResult } from "./eventCartStorage";

describe("fulfilled checkout storage cleanup", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  test("recognizes only paid orders with completed fulfillment", () => {
    expect(isFulfilledCheckoutResult({ order: { status: "paid", metadata: { fulfillment_status: "completed" } } })).toBe(true);
    expect(isFulfilledCheckoutResult({ order: { status: "paid", metadata: { fulfillment_status: "pending" } } })).toBe(false);
    expect(isFulfilledCheckoutResult({ order: { status: "pending", metadata: { fulfillment_status: "completed" } } })).toBe(false);
  });

  test("clears terminal payment and recovery when the fulfilled cart is cleared", () => {
    const slug = "evento-finalizado";
    const cartKey = `cutinapp_checkout_${slug}`;
    const paymentKey = `cutinapp_payment_${slug}`;
    const recoveryKey = `cutinapp_checkout_recovery_${slug}`;
    window.sessionStorage.setItem(cartKey, JSON.stringify({ tickets: [{ id: 1, quantity: 1 }] }));
    window.localStorage.setItem(cartKey, JSON.stringify({ tickets: [{ id: 1, quantity: 1 }] }));
    window.sessionStorage.setItem(paymentKey, JSON.stringify({ order: { status: "paid", metadata: { fulfillment_status: "completed" } } }));
    window.localStorage.setItem(recoveryKey, JSON.stringify({ orderPublicId: "ord_123", savedAt: Date.now() }));

    clearEventCart(slug);

    expect(window.sessionStorage.getItem(cartKey)).toBeNull();
    expect(window.localStorage.getItem(cartKey)).toBeNull();
    expect(window.sessionStorage.getItem(paymentKey)).toBeNull();
    expect(window.localStorage.getItem(recoveryKey)).toBeNull();
  });

  test("keeps pending payment recovery intact when only the cart is cleared", () => {
    const slug = "evento-pendente";
    const paymentKey = `cutinapp_payment_${slug}`;
    const recoveryKey = `cutinapp_checkout_recovery_${slug}`;
    window.sessionStorage.setItem(paymentKey, JSON.stringify({ order: { status: "pending", metadata: { fulfillment_status: "pending" } } }));
    window.localStorage.setItem(recoveryKey, JSON.stringify({ orderPublicId: "ord_pending", savedAt: Date.now() }));

    clearEventCart(slug);

    expect(window.sessionStorage.getItem(paymentKey)).not.toBeNull();
    expect(window.localStorage.getItem(recoveryKey)).not.toBeNull();
  });
});
