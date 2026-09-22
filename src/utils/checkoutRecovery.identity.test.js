import { clearCheckoutRecovery, readCheckoutRecovery, writeCheckoutRecovery } from "./checkoutRecovery";

describe("checkout recovery storage identity", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test("does not persist, read or clear recovery without an event identity", () => {
    const recovery = {
      selection: { tickets: [{ id: 1, quantity: 1 }], items: [] },
      orderPublicId: null,
      couponCode: null,
      paymentMethod: "pix",
    };

    expect(writeCheckoutRecovery(undefined, recovery)).toBe(false);
    expect(writeCheckoutRecovery("   ", recovery)).toBe(false);
    expect(readCheckoutRecovery(undefined)).toBeNull();
    expect(readCheckoutRecovery("   ")).toBeNull();
    expect(clearCheckoutRecovery(undefined)).toBe(false);
    expect(clearCheckoutRecovery("   ")).toBe(false);
    expect(window.localStorage.getItem("cutinapp_checkout_recovery_")).toBeNull();
  });

  test("uses the trimmed event identity consistently", () => {
    const recovery = {
      selection: { tickets: [{ id: 7, quantity: 2 }], items: [] },
      orderPublicId: null,
      couponCode: " vip ",
      paymentMethod: "PIX",
    };

    expect(writeCheckoutRecovery("  festa-2026  ", recovery, 1000)).toBe(true);
    expect(window.localStorage.getItem("cutinapp_checkout_recovery_festa-2026")).not.toBeNull();
    expect(window.localStorage.getItem("cutinapp_checkout_recovery_  festa-2026  ")).toBeNull();
    expect(readCheckoutRecovery("festa-2026", 1000)).toMatchObject({
      selection: { tickets: [{ id: 7, quantity: 2 }], items: [] },
      couponCode: "VIP",
      paymentMethod: "pix",
    });
  });
});
