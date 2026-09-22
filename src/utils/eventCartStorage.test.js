import { clearEventCart, isFulfilledCheckoutResult, mergeEventCartTickets, readEventCart, writeEventCart } from "./eventCartStorage";
import { readCheckoutRecovery, writeCheckoutRecovery } from "./checkoutRecovery";

describe("fulfilled checkout storage cleanup", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  test("merges production ticket selections into the same canonical event cart", () => {
    const result = mergeEventCartTickets({
      eventId: 77,
      eventDate: "2026-09-20T20:00:00-03:00",
      tickets: [{ id: 1, quantity: 2 }],
      items: [{ id: 9, quantity: 1 }],
    }, [
      { id: 1, quantity: 3, maxQuantity: 4 },
      { id: 2, quantity: 2, maxQuantity: 5 },
    ]);

    expect(result.selection.tickets).toEqual([
      { id: 1, quantity: 4 },
      { id: 2, quantity: 2 },
    ]);
    expect(result.selection.items).toEqual([{ id: 9, quantity: 1 }]);
    expect(result.addedQuantity).toBe(4);
    expect(result.itemCount).toBe(7);
  });

  test("prefers a newer local cart and repairs a stale tab session snapshot", () => {
    const slug = "evento-multitab";
    const cartKey = `cutinapp_checkout_${slug}`;
    const staleCart = { tickets: [{ id: 1, quantity: 3 }], items: [], savedAt: 1000 };
    const freshCart = { tickets: [{ id: 1, quantity: 1 }], items: [], savedAt: 2000 };
    window.sessionStorage.setItem(cartKey, JSON.stringify(staleCart));
    window.localStorage.setItem(cartKey, JSON.stringify(freshCart));

    expect(readEventCart(slug)).toEqual(freshCart);
    expect(JSON.parse(window.sessionStorage.getItem(cartKey))).toEqual(freshCart);
  });

  test("prefers shared local cart when cross-tab writes have the same timestamp", () => {
    const slug = "evento-multitab-mesmo-ms";
    const cartKey = `cutinapp_checkout_${slug}`;
    const sessionCart = { tickets: [{ id: 1, quantity: 3 }], items: [], savedAt: 2000 };
    const sharedCart = { tickets: [{ id: 1, quantity: 1 }], items: [], savedAt: 2000 };
    window.sessionStorage.setItem(cartKey, JSON.stringify(sessionCart));
    window.localStorage.setItem(cartKey, JSON.stringify(sharedCart));

    expect(readEventCart(slug)).toEqual(sharedCart);
    expect(JSON.parse(window.sessionStorage.getItem(cartKey))).toEqual(sharedCart);
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

  test("keeps draft recovery synchronized with cart changes", () => {
    const slug = "evento-edicao";

    writeCheckoutRecovery(slug, {
      selection: { tickets: [{ id: 1, quantity: 3 }] },
      couponCode: "VIP10",
      paymentMethod: "card",
    });

    writeEventCart(slug, {
      eventId: 77,
      tickets: [{ id: 1, quantity: 1 }],
      items: [{ id: 9, quantity: 2 }],
    });

    expect(readCheckoutRecovery(slug)?.selection).toEqual({
      tickets: [{ id: 1, quantity: 1 }],
      items: [{ id: 9, quantity: 2 }],
    });
    expect(readCheckoutRecovery(slug)?.couponCode).toBe("VIP10");
    expect(readCheckoutRecovery(slug)?.paymentMethod).toBe("card");
  });

  test("clears draft recovery when the participant empties the cart", () => {
    const slug = "evento-vazio";
    writeEventCart(slug, { tickets: [{ id: 5, quantity: 1 }], items: [] });
    expect(readCheckoutRecovery(slug)).not.toBeNull();

    clearEventCart(slug);

    expect(readCheckoutRecovery(slug)).toBeNull();
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
