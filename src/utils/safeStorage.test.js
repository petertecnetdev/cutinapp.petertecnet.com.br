import { safeRemoveSessionItem, safeSetSessionJson } from "./safeStorage";

describe("safeStorage", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    window.sessionStorage.clear();
  });

  test("stores JSON in sessionStorage", () => {
    expect(safeSetSessionJson("checkout", { eventId: 42 })).toBe(true);
    expect(JSON.parse(window.sessionStorage.getItem("checkout"))).toEqual({ eventId: 42 });
  });

  test("does not throw when sessionStorage write is blocked", () => {
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });

    expect(() => safeSetSessionJson("checkout", { eventId: 42 })).not.toThrow();
    expect(safeSetSessionJson("checkout", { eventId: 42 })).toBe(false);
  });

  test("does not throw when sessionStorage removal is blocked", () => {
    jest.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });

    expect(() => safeRemoveSessionItem("payment")).not.toThrow();
    expect(safeRemoveSessionItem("payment")).toBe(false);
  });
});
