import {
  clearCommerceClientState,
  invalidateCommerceScopeReadiness,
  isCommerceScopeReady,
  synchronizeCommerceScope,
} from "./commerceSessionScope";

describe("commerceSessionScope", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  test("clears legacy unowned commerce state on the first safe migration", () => {
    localStorage.setItem("cutinapp_checkout_evento-a", JSON.stringify({ items: [{ id: 1, quantity: 1 }] }));
    localStorage.setItem("cutinapp_checkout_recovery_evento-a", JSON.stringify({ orderPublicId: "old" }));
    sessionStorage.setItem("cutinapp_payment_evento-a", JSON.stringify({ order: { public_id: "old" } }));
    localStorage.setItem("cutinapp_commerce_cart_v1", JSON.stringify({ version: 1, events: [] }));

    const result = synchronizeCommerceScope({ id: 10 });

    expect(result.scope).toBe("user:10");
    expect(isCommerceScopeReady()).toBe(true);
    expect(localStorage.getItem("cutinapp_checkout_evento-a")).toBeNull();
    expect(localStorage.getItem("cutinapp_checkout_recovery_evento-a")).toBeNull();
    expect(sessionStorage.getItem("cutinapp_payment_evento-a")).toBeNull();
    expect(localStorage.getItem("cutinapp_commerce_cart_v1")).toBeNull();
  });

  test("preserves a guest cart when that guest authenticates", () => {
    synchronizeCommerceScope(null);
    localStorage.setItem("cutinapp_checkout_evento-b", JSON.stringify({ tickets: [{ id: 2, quantity: 1 }] }));

    const result = synchronizeCommerceScope({ id: 20 });

    expect(result.scope).toBe("user:20");
    expect(localStorage.getItem("cutinapp_checkout_evento-b")).not.toBeNull();
  });

  test("temporarily hides commerce state while a new auth token is being resolved", () => {
    synchronizeCommerceScope({ id: 25 });
    localStorage.setItem("cutinapp_checkout_evento-pending-auth", JSON.stringify({ tickets: [{ id: 5, quantity: 1 }] }));

    invalidateCommerceScopeReadiness();

    expect(isCommerceScopeReady()).toBe(false);
    expect(localStorage.getItem("cutinapp_checkout_evento-pending-auth")).not.toBeNull();

    synchronizeCommerceScope({ id: 25 });
    expect(isCommerceScopeReady()).toBe(true);
    expect(localStorage.getItem("cutinapp_checkout_evento-pending-auth")).not.toBeNull();
  });

  test("clears hidden commerce state if the resolved identity is a different user", () => {
    synchronizeCommerceScope({ id: 26 });
    localStorage.setItem("cutinapp_checkout_evento-account-switch", JSON.stringify({ tickets: [{ id: 6, quantity: 1 }] }));

    invalidateCommerceScopeReadiness();
    synchronizeCommerceScope({ id: 27 });

    expect(isCommerceScopeReady()).toBe(true);
    expect(localStorage.getItem("cutinapp_checkout_evento-account-switch")).toBeNull();
  });

  test("clears commerce state when switching between authenticated users", () => {
    synchronizeCommerceScope({ id: 30 });
    localStorage.setItem("cutinapp_checkout_evento-c", JSON.stringify({ items: [{ id: 3, quantity: 1 }] }));
    sessionStorage.setItem("cutinapp_payment_evento-c", JSON.stringify({ order: { public_id: "order-c" } }));

    synchronizeCommerceScope({ id: 31 });

    expect(localStorage.getItem("cutinapp_checkout_evento-c")).toBeNull();
    expect(sessionStorage.getItem("cutinapp_payment_evento-c")).toBeNull();
  });

  test("clears authenticated commerce state on logout", () => {
    synchronizeCommerceScope({ id: 40 });
    localStorage.setItem("cutinapp_checkout_evento-d", JSON.stringify({ tickets: [{ id: 4, quantity: 1 }] }));

    synchronizeCommerceScope(null);

    expect(localStorage.getItem("cutinapp_checkout_evento-d")).toBeNull();
  });

  test("can clear commerce artifacts without touching unrelated storage", () => {
    synchronizeCommerceScope(null);
    localStorage.setItem("cutinapp_checkout_evento-e", "{}");
    localStorage.setItem("unrelated_key", "keep");

    clearCommerceClientState();

    expect(localStorage.getItem("cutinapp_checkout_evento-e")).toBeNull();
    expect(localStorage.getItem("unrelated_key")).toBe("keep");
  });
});
