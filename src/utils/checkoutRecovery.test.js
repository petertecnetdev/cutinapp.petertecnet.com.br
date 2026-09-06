import {
  CHECKOUT_RECOVERY_TTL_MS,
  clearCheckoutRecovery,
  readCheckoutRecovery,
  writeCheckoutRecovery,
} from "./checkoutRecovery";

const slug = "festival-teste";
const now = 1_800_000_000_000;

describe("checkoutRecovery", () => {
  beforeEach(() => localStorage.clear());

  test("persists only the minimal cart and order reference needed to recover checkout", () => {
    expect(writeCheckoutRecovery(slug, {
      selection: {
        tickets: [{ id: "7", quantity: "2", name: "VIP", price: 100 }],
        items: [{ id: 9, quantity: 1, secret: "discard-me" }],
      },
      orderPublicId: "order-public-123",
    }, now)).toBe(true);

    expect(readCheckoutRecovery(slug, now + 1000)).toEqual({
      selection: { tickets: [{ id: 7, quantity: 2 }], items: [{ id: 9, quantity: 1 }] },
      orderPublicId: "order-public-123",
      savedAt: now,
    });
  });

  test("expires stale checkout recovery automatically", () => {
    writeCheckoutRecovery(slug, { selection: { tickets: [{ id: 7, quantity: 1 }] } }, now);

    expect(readCheckoutRecovery(slug, now + CHECKOUT_RECOVERY_TTL_MS + 1)).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  test("ignores corrupt or unusable persisted data", () => {
    localStorage.setItem(`cutinapp_checkout_recovery_${slug}`, "not-json");
    expect(readCheckoutRecovery(slug, now)).toBeNull();

    writeCheckoutRecovery(slug, { selection: { tickets: [{ id: 0, quantity: -1 }] } }, now);
    expect(readCheckoutRecovery(slug, now)).toBeNull();
  });

  test("clears a recovery record explicitly", () => {
    writeCheckoutRecovery(slug, { orderPublicId: "order-public-123" }, now);
    clearCheckoutRecovery(slug);
    expect(readCheckoutRecovery(slug, now)).toBeNull();
  });
});
