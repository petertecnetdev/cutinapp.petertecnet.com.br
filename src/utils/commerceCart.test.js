import {
  COMMERCE_CART_STORAGE_KEY,
  addTicketsToCommerceCart,
  getCommerceCart,
  getCommerceCartItemCount,
} from "./commerceCart";

describe("commerce cart", () => {
  beforeEach(() => localStorage.clear());

  test("stores tickets from more than one event without replacing previous selections", () => {
    addTicketsToCommerceCart({
      event: { id: 10, slug: "evento-a", title: "Evento A", start_date: "2026-09-10T20:00:00-03:00" },
      production: { id: 5, slug: "producao-x", name: "Produção X" },
      tickets: [{ id: 101, name: "Pista", price: 25, quantity: 2, maxQuantity: 20 }],
    });

    addTicketsToCommerceCart({
      event: { id: 11, slug: "evento-b", title: "Evento B", start_date: "2026-09-11T20:00:00-03:00" },
      production: { id: 5, slug: "producao-x", name: "Produção X" },
      tickets: [{ id: 201, name: "VIP", price: 50, quantity: 1, maxQuantity: 20 }],
    });

    const cart = getCommerceCart();
    expect(cart.events).toHaveLength(2);
    expect(getCommerceCartItemCount(cart)).toBe(3);
  });

  test("merges the same ticket and respects the available maximum", () => {
    addTicketsToCommerceCart({
      event: { id: 10, slug: "evento-a", title: "Evento A" },
      production: { id: 5, slug: "producao-x", name: "Produção X" },
      tickets: [{ id: 101, name: "Pista", price: 25, quantity: 3, maxQuantity: 5 }],
    });

    const result = addTicketsToCommerceCart({
      event: { id: 10, slug: "evento-a", title: "Evento A" },
      production: { id: 5, slug: "producao-x", name: "Produção X" },
      tickets: [{ id: 101, name: "Pista", price: 25, quantity: 4, maxQuantity: 5 }],
    });

    expect(result.addedQuantity).toBe(2);
    expect(result.itemCount).toBe(5);
    expect(getCommerceCart().events[0].tickets[0].quantity).toBe(5);
  });

  test("preserves event items when tickets are added to the same event", () => {
    localStorage.setItem(COMMERCE_CART_STORAGE_KEY, JSON.stringify({
      version: 1,
      updatedAt: "2026-09-08T20:00:00.000Z",
      events: [{
        eventId: 10,
        eventSlug: "evento-a",
        eventTitle: "Evento A",
        tickets: [],
        items: [{ id: 301, name: "Drink", quantity: 2, unitPrice: 12 }],
      }],
    }));

    const result = addTicketsToCommerceCart({
      event: { id: 10, slug: "evento-a", title: "Evento A" },
      production: { id: 5, slug: "producao-x", name: "Produção X" },
      tickets: [{ id: 101, name: "Pista", price: 25, quantity: 1, maxQuantity: 20 }],
    });

    expect(result.cart.events[0].items).toEqual([{ id: 301, name: "Drink", quantity: 2, unitPrice: 12 }]);
    expect(result.itemCount).toBe(3);
  });

  test("keeps a versioned persistent payload", () => {
    addTicketsToCommerceCart({
      event: { id: 10, slug: "evento-a", title: "Evento A" },
      production: { id: 5, slug: "producao-x", name: "Produção X" },
      tickets: [{ id: 101, name: "Pista", price: 25, quantity: 1, maxQuantity: 20 }],
    });

    const stored = JSON.parse(localStorage.getItem(COMMERCE_CART_STORAGE_KEY));
    expect(stored.version).toBe(1);
    expect(stored.updatedAt).toBeTruthy();
    expect(stored.events[0].productionSlug).toBe("producao-x");
  });
});