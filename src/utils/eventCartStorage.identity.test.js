import { clearEventCart, readEventCart, writeEventCart } from "./eventCartStorage";

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
});
