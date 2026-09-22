import { readEventCart } from "./eventCartStorage";
import { readCheckoutRecovery, writeCheckoutRecovery } from "./checkoutRecovery";

describe("invalid persisted event cart", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  test("clears a legacy persisted cart without purchasable quantities", () => {
    const slug = "evento-legado-vazio";
    const key = `cutinapp_checkout_${slug}`;
    const invalidCart = {
      eventId: 91,
      tickets: [{ id: 5, quantity: 0 }],
      items: [],
      savedAt: Date.now(),
    };

    window.sessionStorage.setItem(key, JSON.stringify(invalidCart));
    window.localStorage.setItem(key, JSON.stringify(invalidCart));
    writeCheckoutRecovery(slug, { selection: invalidCart, orderPublicId: null });

    expect(readEventCart(slug)).toBeNull();
    expect(window.sessionStorage.getItem(key)).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(key))?.cleared).toBe(true);
    expect(readCheckoutRecovery(slug)).toBeNull();
  });
});
