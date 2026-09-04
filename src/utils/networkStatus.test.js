import { getNetworkStatus, subscribeToNetworkStatus } from "./networkStatus";

describe("networkStatus", () => {
  const originalOnLine = navigator.onLine;

  afterEach(() => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: originalOnLine });
  });

  test("reports the current browser connectivity", () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    expect(getNetworkStatus()).toBe("offline");

    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    expect(getNetworkStatus()).toBe("online");
  });

  test("subscribes to online and offline changes and cleans up", () => {
    const listener = jest.fn();
    const unsubscribe = subscribeToNetworkStatus(listener);

    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    window.dispatchEvent(new Event("offline"));
    expect(listener).toHaveBeenLastCalledWith("offline");

    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    window.dispatchEvent(new Event("online"));
    expect(listener).toHaveBeenLastCalledWith("online");

    const callCount = listener.mock.calls.length;
    unsubscribe();
    window.dispatchEvent(new Event("offline"));
    expect(listener).toHaveBeenCalledTimes(callCount);
  });
});
