import { clearCheckoutRecovery, readCheckoutRecovery, writeCheckoutRecovery } from "./checkoutRecovery";
import { invalidateCommerceScopeReadiness, synchronizeCommerceScope } from "./commerceSessionScope";

describe("checkout recovery storage identity", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
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

  test("hides and protects persisted recovery while auth identity is unresolved", () => {
    const recovery = {
      selection: { tickets: [{ id: 9, quantity: 1 }], items: [] },
      orderPublicId: "order-owner",
      couponCode: "OWNER",
      paymentMethod: "pix",
    };

    synchronizeCommerceScope({ id: 41, email: "owner@example.com" });
    expect(writeCheckoutRecovery("evento", recovery, 1000)).toBe(true);
    const persisted = window.localStorage.getItem("cutinapp_checkout_recovery_evento");

    invalidateCommerceScopeReadiness();

    expect(readCheckoutRecovery("evento", 1000)).toBeNull();
    expect(writeCheckoutRecovery("evento", { ...recovery, orderPublicId: "racing-write" }, 1001)).toBe(false);
    expect(clearCheckoutRecovery("evento")).toBe(false);
    expect(window.localStorage.getItem("cutinapp_checkout_recovery_evento")).toBe(persisted);

    synchronizeCommerceScope({ id: 41, email: "owner@example.com" });
    expect(readCheckoutRecovery("evento", 1000)).toMatchObject({ orderPublicId: "order-owner" });
  });

  test("removes previous recovery when identity resolves to another user", () => {
    synchronizeCommerceScope({ id: 41 });
    expect(writeCheckoutRecovery("evento", {
      selection: { tickets: [{ id: 9, quantity: 1 }], items: [] },
      orderPublicId: "order-owner",
      paymentMethod: "card",
    }, 1000)).toBe(true);

    invalidateCommerceScopeReadiness();
    synchronizeCommerceScope({ id: 99 });

    expect(window.localStorage.getItem("cutinapp_checkout_recovery_evento")).toBeNull();
    expect(readCheckoutRecovery("evento", 1000)).toBeNull();
  });
});
