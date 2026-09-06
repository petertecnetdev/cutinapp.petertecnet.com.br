import {
  safeGetLocalItem,
  safeRemoveLocalItem,
  safeRemoveSessionItem,
  safeSetLocalItem,
  safeSetSessionJson,
} from "./safeStorage";

describe("safeStorage", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    window.localStorage.clear();
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

  test("reads, writes and removes localStorage safely", () => {
    expect(safeSetLocalItem("preference", "value")).toBe(true);
    expect(safeGetLocalItem("preference")).toBe("value");
    expect(safeRemoveLocalItem("preference")).toBe(true);
    expect(safeGetLocalItem("preference")).toBeNull();
  });

  test("returns safe fallbacks when localStorage operations are blocked", () => {
    const getSpy = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    expect(safeGetLocalItem("preference")).toBeNull();
    getSpy.mockRestore();

    const setSpy = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    expect(safeSetLocalItem("preference", "value")).toBe(false);
    setSpy.mockRestore();

    const removeSpy = jest.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    expect(safeRemoveLocalItem("preference")).toBe(false);
    removeSpy.mockRestore();
  });
});
