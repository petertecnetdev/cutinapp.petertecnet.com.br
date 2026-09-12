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
  afterEach(() => jest.restoreAllMocks());

  test("persists only the minimal cart, coupon code and order reference needed to recover checkout", () => {
    expect(writeCheckoutRecovery(slug, {
      selection: {
        tickets: [{ id: "7", quantity: "2", name: "VIP", price: 100 }],
        items: [{ id: 9, quantity: 1, secret: "discard-me" }],
      },
      orderPublicId: "order-public-123",
      couponCode: " cutvip20 ",
      paymentMethod: " CARD ",
    }, now)).toBe(true);

    expect(readCheckoutRecovery(slug, now + 1000)).toEqual({
      selection: { tickets: [{ id: 7, quantity: 2 }], items: [{ id: 9, quantity: 1 }] },
      orderPublicId: "order-public-123",
      couponCode: "CUTVIP20",
      paymentMethod: "card",
      savedAt: now,
    });
  });

  test("does not persist malformed coupon data or financial values", () => {
    writeCheckoutRecovery(slug, {
      selection: { tickets: [{ id: 7, quantity: 1 }] },
      couponCode: "<script>alert(1)</script>",
      discountAmount: 999,
      total: 1,
    }, now);

    expect(readCheckoutRecovery(slug, now)).toEqual({
      selection: { tickets: [{ id: 7, quantity: 1 }], items: [] },
      orderPublicId: null,
      couponCode: null,
      paymentMethod: null,
      savedAt: now,
    });
  });

  test("keeps a valid payment method when subsequent recovery writes omit it", () => {
    writeCheckoutRecovery(slug, {
      selection: { tickets: [{ id: 7, quantity: 1 }] },
      paymentMethod: "card",
    }, now);

    writeCheckoutRecovery(slug, {
      selection: { tickets: [{ id: 7, quantity: 2 }] },
      couponCode: "VIP10",
    }, now + 1000);

    expect(readCheckoutRecovery(slug, now + 1001)?.paymentMethod).toBe("card");
  });

  test("ignores unsupported persisted payment methods", () => {
    writeCheckoutRecovery(slug, {
      selection: { tickets: [{ id: 7, quantity: 1 }] },
      paymentMethod: "crypto",
    }, now);

    expect(readCheckoutRecovery(slug, now)?.paymentMethod).toBeNull();
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
    expect(clearCheckoutRecovery(slug)).toBe(true);
    expect(readCheckoutRecovery(slug, now)).toBeNull();
  });

  test("reports failure when localStorage cannot be accessed", () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("Blocked", "SecurityError");
      },
    });

    try {
      expect(writeCheckoutRecovery(slug, { orderPublicId: "order-public-123" }, now)).toBe(false);
      expect(readCheckoutRecovery(slug, now)).toBeNull();
      expect(clearCheckoutRecovery(slug)).toBe(false);
    } finally {
      Object.defineProperty(window, "localStorage", descriptor);
    }
  });

  test("reports failure when localStorage rejects writes", () => {
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });

    expect(writeCheckoutRecovery(slug, { orderPublicId: "order-public-123" }, now)).toBe(false);
  });
});
