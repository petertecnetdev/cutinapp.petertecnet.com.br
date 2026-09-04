import {
  AUTH_TOKEN_STORAGE_KEY,
  isAuthTokenStorageEvent,
  subscribeToAuthTokenChanges,
} from "./authSessionSync";

describe("authSessionSync", () => {
  test("recognizes only token storage events", () => {
    expect(isAuthTokenStorageEvent({ key: AUTH_TOKEN_STORAGE_KEY })).toBe(true);
    expect(isAuthTokenStorageEvent({ key: "cutinapp.discovery" })).toBe(false);
    expect(isAuthTokenStorageEvent(null)).toBe(false);
  });

  test("notifies when the token changes in another tab", () => {
    const listener = jest.fn();
    const unsubscribe = subscribeToAuthTokenChanges(listener);

    window.dispatchEvent(new StorageEvent("storage", {
      key: AUTH_TOKEN_STORAGE_KEY,
      oldValue: "old-token",
      newValue: "new-token",
    }));

    expect(listener).toHaveBeenCalledWith("new-token", "old-token");
    unsubscribe();
  });

  test("ignores unrelated storage keys and unsubscribes cleanly", () => {
    const listener = jest.fn();
    const unsubscribe = subscribeToAuthTokenChanges(listener);

    window.dispatchEvent(new StorageEvent("storage", {
      key: "cutinapp.discovery",
      oldValue: null,
      newValue: "{}",
    }));
    expect(listener).not.toHaveBeenCalled();

    unsubscribe();
    window.dispatchEvent(new StorageEvent("storage", {
      key: AUTH_TOKEN_STORAGE_KEY,
      oldValue: "token",
      newValue: null,
    }));
    expect(listener).not.toHaveBeenCalled();
  });
});
