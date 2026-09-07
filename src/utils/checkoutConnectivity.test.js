import { waitForOnline } from "./checkoutConnectivity";

const createEventTarget = () => {
  const listeners = new Map();
  return {
    addEventListener: jest.fn((name, listener) => listeners.set(name, listener)),
    removeEventListener: jest.fn((name, listener) => {
      if (listeners.get(name) === listener) listeners.delete(name);
    }),
    dispatch(name) {
      listeners.get(name)?.();
    },
  };
};

describe("checkoutConnectivity", () => {
  test("returns immediately when the browser is already online", async () => {
    const eventTarget = createEventTarget();
    const setTimer = jest.fn();

    await expect(waitForOnline({
      eventTarget,
      setTimer,
      clearTimer: jest.fn(),
      isOffline: () => false,
    })).resolves.toEqual({ restored: true, waited: false });

    expect(eventTarget.addEventListener).not.toHaveBeenCalled();
    expect(setTimer).not.toHaveBeenCalled();
  });

  test("waits for connectivity and resolves as soon as the online event arrives", async () => {
    const eventTarget = createEventTarget();
    let timerCallback;
    const setTimer = jest.fn((callback) => {
      timerCallback = callback;
      return 99;
    });
    const clearTimer = jest.fn();
    let offline = true;

    const pending = waitForOnline({
      timeoutMs: 8000,
      eventTarget,
      setTimer,
      clearTimer,
      isOffline: () => offline,
    });

    expect(eventTarget.addEventListener).toHaveBeenCalledWith("online", expect.any(Function), { once: true });
    expect(setTimer).toHaveBeenCalledWith(expect.any(Function), 8000);

    offline = false;
    eventTarget.dispatch("online");

    await expect(pending).resolves.toEqual({ restored: true, waited: true });
    expect(clearTimer).toHaveBeenCalledWith(99);
    expect(eventTarget.removeEventListener).toHaveBeenCalledWith("online", expect.any(Function));
    expect(timerCallback).toEqual(expect.any(Function));
  });

  test("ends the bounded wait when connectivity does not return", async () => {
    const eventTarget = createEventTarget();
    let timerCallback;
    const setTimer = jest.fn((callback) => {
      timerCallback = callback;
      return 101;
    });

    const pending = waitForOnline({
      timeoutMs: 5000,
      eventTarget,
      setTimer,
      clearTimer: jest.fn(),
      isOffline: () => true,
    });

    timerCallback();

    await expect(pending).resolves.toEqual({ restored: false, waited: true });
    expect(eventTarget.removeEventListener).toHaveBeenCalledWith("online", expect.any(Function));
  });
});
