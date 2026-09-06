import {
  clearAuthToken,
  getAuthToken,
  resetAuthTokenMemoryForTests,
  setAuthToken,
} from "./authTokenStorage";

describe("authTokenStorage", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    window.localStorage.clear();
    resetAuthTokenMemoryForTests();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    window.localStorage.clear();
    resetAuthTokenMemoryForTests();
  });

  test("persists and reads the authentication token when localStorage is available", () => {
    expect(setAuthToken(" token-123 ")).toBe(true);
    expect(window.localStorage.getItem("token")).toBe("token-123");
    expect(getAuthToken()).toBe("token-123");
  });

  test("hydrates the in-memory session from an existing persisted token", () => {
    window.localStorage.setItem("token", "persisted-token");
    resetAuthTokenMemoryForTests();

    expect(getAuthToken()).toBe("persisted-token");
  });

  test("keeps the current session usable when localStorage writes are blocked", () => {
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });

    expect(setAuthToken("memory-token")).toBe(false);
    expect(getAuthToken()).toBe("memory-token");
  });

  test("keeps an already hydrated session when localStorage later becomes unreadable", () => {
    window.localStorage.setItem("token", "persisted-token");
    expect(getAuthToken()).toBe("persisted-token");

    jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });

    expect(getAuthToken()).toBe("persisted-token");
  });

  test("returns a safe unauthenticated state when localStorage reads are blocked", () => {
    window.localStorage.setItem("token", "persisted-token");
    resetAuthTokenMemoryForTests();
    jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });

    expect(() => getAuthToken()).not.toThrow();
    expect(getAuthToken()).toBeNull();
  });

  test("clears the active in-memory session even when localStorage removal is blocked", () => {
    setAuthToken("memory-token");
    jest.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });

    expect(() => clearAuthToken()).not.toThrow();
    expect(getAuthToken()).toBeNull();
  });
});
