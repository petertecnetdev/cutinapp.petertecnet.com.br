import {
  safeGetLocalItem,
  safeGetLocalJson,
  safeGetSessionItem,
  safeGetSessionJson,
  safeReadLocalItem,
  safeRemoveLocalItem,
  safeRemoveSessionItem,
  safeSetLocalItem,
  safeSetLocalJson,
  safeSetSessionItem,
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

  test("reads raw and JSON session values safely", () => {
    expect(safeSetSessionItem("return_to", "/passes")).toBe(true);
    expect(safeGetSessionItem("return_to")).toBe("/passes");

    expect(safeSetSessionJson("completion", { token: "abc" })).toBe(true);
    expect(safeGetSessionJson("completion")).toEqual({ token: "abc" });
  });

  test("hides and protects payment snapshots while commerce identity is unresolved", () => {
    window.localStorage.setItem("cutinapp_commerce_scope_v1", "user:41");
    window.sessionStorage.setItem("cutinapp_commerce_session_scope_v1", "user:41");
    expect(safeSetSessionJson("cutinapp_payment_evento", { order: { public_id: "owner-order" } })).toBe(true);
    const persisted = window.sessionStorage.getItem("cutinapp_payment_evento");

    window.sessionStorage.removeItem("cutinapp_commerce_session_scope_v1");

    expect(safeGetSessionJson("cutinapp_payment_evento")).toBeNull();
    expect(safeSetSessionJson("cutinapp_payment_evento", { order: { public_id: "racing-order" } })).toBe(false);
    expect(safeRemoveSessionItem("cutinapp_payment_evento")).toBe(false);
    expect(window.sessionStorage.getItem("cutinapp_payment_evento")).toBe(persisted);
  });

  test("restores payment snapshot access only when the tab resolves the same commerce scope", () => {
    window.localStorage.setItem("cutinapp_commerce_scope_v1", "user:41");
    window.sessionStorage.setItem("cutinapp_commerce_session_scope_v1", "user:41");
    expect(safeSetSessionJson("cutinapp_payment_evento", { order: { public_id: "owner-order" } })).toBe(true);

    window.sessionStorage.setItem("cutinapp_commerce_session_scope_v1", "user:99");
    expect(safeGetSessionJson("cutinapp_payment_evento")).toBeNull();

    window.sessionStorage.setItem("cutinapp_commerce_session_scope_v1", "user:41");
    expect(safeGetSessionJson("cutinapp_payment_evento")).toEqual({ order: { public_id: "owner-order" } });
  });

  test("keeps unrelated session keys available during commerce identity resolution", () => {
    window.localStorage.setItem("cutinapp_commerce_scope_v1", "user:41");
    expect(safeSetSessionItem("return_to", "/passes")).toBe(true);
    expect(safeGetSessionItem("return_to")).toBe("/passes");
  });

  test("returns safe fallbacks when sessionStorage reads are blocked", () => {
    jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });

    expect(() => safeGetSessionItem("return_to")).not.toThrow();
    expect(safeGetSessionItem("return_to")).toBeNull();
    expect(safeGetSessionJson("completion")).toBeNull();
  });

  test("clears malformed session JSON without throwing", () => {
    window.sessionStorage.setItem("completion", "{broken");
    expect(safeGetSessionJson("completion")).toBeNull();
    expect(window.sessionStorage.getItem("completion")).toBeNull();
  });

  test("does not throw when raw sessionStorage writes are blocked", () => {
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });

    expect(safeSetSessionItem("return_to", "/passes")).toBe(false);
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

  test("reports whether localStorage can actually be read", () => {
    window.localStorage.setItem("preference", "value");
    expect(safeReadLocalItem("preference")).toEqual({ available: true, value: "value" });

    jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });

    expect(safeReadLocalItem("preference")).toEqual({ available: false, value: null });
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

  test("stores and reads local JSON safely", () => {
    expect(safeSetLocalJson("location", { city: "Belo Horizonte", uf: "MG" })).toBe(true);
    expect(safeGetLocalJson("location")).toEqual({ city: "Belo Horizonte", uf: "MG" });
  });

  test("clears malformed local JSON and returns the requested fallback", () => {
    window.localStorage.setItem("location", "{broken");
    expect(safeGetLocalJson("location", {})).toEqual({});
    expect(window.localStorage.getItem("location")).toBeNull();
  });

  test("returns safe JSON fallbacks when localStorage is blocked", () => {
    const getSpy = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    expect(safeGetLocalJson("location", [])).toEqual([]);
    getSpy.mockRestore();

    const setSpy = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    expect(safeSetLocalJson("location", { city: "Recife" })).toBe(false);
    setSpy.mockRestore();
  });
});
