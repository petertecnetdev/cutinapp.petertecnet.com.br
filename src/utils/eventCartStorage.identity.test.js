import { clearEventCart, readEventCart, writeEventCart } from "./eventCartStorage";
import { invalidateCommerceScopeReadiness, synchronizeCommerceScope } from "./commerceSessionScope";

describe("event cart storage identity", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  test("does not persist or read a cart without an event identity", () => {
    const selection = { tickets: [{ id: 1, quantity: 1 }], items: [] };

    expect(writeEventCart(undefined, selection)).toBeNull();
    expect(writeEventCart("   ", selection)).toBeNull();
    expect(readEventCart(undefined)).toBeNull();
    expect(readEventCart("   ")).toBeNull();
    expect(window.localStorage.getItem("cutinapp_checkout_")).toBeNull();
    expect(window.sessionStorage.getItem("cutinapp_checkout_")).toBeNull();
  });

  test("does not create a shared clear marker without an event identity", () => {
    clearEventCart(undefined);
    clearEventCart("   ");

    expect(window.localStorage.getItem("cutinapp_checkout_")).toBeNull();
    expect(window.sessionStorage.getItem("cutinapp_checkout_")).toBeNull();
  });

  test("hides and protects a persisted cart while the current identity is unresolved", () => {
    synchronizeCommerceScope({ id: 70 });
    const selection = { tickets: [{ id: 7, quantity: 1 }], items: [] };
    const original = writeEventCart("evento-identity", selection);
    expect(original).not.toBeNull();

    invalidateCommerceScopeReadiness();

    expect(readEventCart("evento-identity")).toBeNull();
    expect(writeEventCart("evento-identity", { tickets: [{ id: 8, quantity: 2 }], items: [] })).toBeNull();

    synchronizeCommerceScope({ id: 70 });
    expect(readEventCart("evento-identity")?.tickets).toEqual([{ id: 7, quantity: 1 }]);
  });

  test("does not expose the previous account cart when auth resolves to another user", () => {
    synchronizeCommerceScope({ id: 80 });
    writeEventCart("evento-switch", { tickets: [{ id: 9, quantity: 1 }], items: [] });

    invalidateCommerceScopeReadiness();
    expect(readEventCart("evento-switch")).toBeNull();

    synchronizeCommerceScope({ id: 81 });
    expect(readEventCart("evento-switch")).toBeNull();
    expect(window.localStorage.getItem("cutinapp_checkout_evento-switch")).toBeNull();
  });
});
