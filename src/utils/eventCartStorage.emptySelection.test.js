import { readEventCart, writeEventCart } from "./eventCartStorage";
import { readCheckoutRecovery } from "./checkoutRecovery";

describe("empty event cart persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  test("clears persisted cart and draft recovery when quantities reach zero", () => {
    const slug = "evento-esvaziado";
    const cartKey = `cutinapp_checkout_${slug}`;

    writeEventCart(slug, {
      eventId: 77,
      tickets: [{ id: 5, quantity: 2 }],
      items: [],
    });
    expect(readEventCart(slug)).not.toBeNull();
    expect(readCheckoutRecovery(slug)).not.toBeNull();

    expect(writeEventCart(slug, {
      eventId: 77,
      tickets: [{ id: 5, quantity: 0 }],
      items: [],
    })).toBeNull();

    expect(readEventCart(slug)).toBeNull();
    expect(window.sessionStorage.getItem(cartKey)).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(cartKey))?.cleared).toBe(true);
    expect(readCheckoutRecovery(slug)).toBeNull();
  });

  test("keeps an item-only cart when it still has a positive quantity", () => {
    const slug = "evento-item";
    const cart = writeEventCart(slug, {
      eventId: 88,
      tickets: [],
      items: [{ id: 9, quantity: 1 }],
    });

    expect(cart?.items).toEqual([{ id: 9, quantity: 1 }]);
    expect(readEventCart(slug)?.items).toEqual([{ id: 9, quantity: 1 }]);
  });
});
