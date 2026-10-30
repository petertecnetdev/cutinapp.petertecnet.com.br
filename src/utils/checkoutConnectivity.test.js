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

    expect(eventTarget.addEventListener).toHaveBeenCalledWith("online", expect.any(Function));
    expect(setTimer).toHaveBeenCalledWith(expect.any(Function), 8000);

    offline = false;
    eventTarget.dispatch("online");

    await expect(pending).resolves.toEqual({ restored: true, waited: true });
    expect(clearTimer).toHaveBeenCalledWith(99);
    expect(eventTarget.removeEventListener).toHaveBeenCalledWith("online", expect.any(Function));
    expect(timerCallback).toEqual(expect.any(Function));
  });

  test("ignora evento online prematuro e só retoma quando a conexão é confirmada", async () => {
    const eventTarget = createEventTarget();
    let timerCallback;
    const setTimer = jest.fn((callback) => {
      timerCallback = callback;
      return 102;
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

    eventTarget.dispatch("online");
    expect(eventTarget.removeEventListener).not.toHaveBeenCalled();
    expect(clearTimer).not.toHaveBeenCalled();

    offline = false;
    eventTarget.dispatch("online");

    await expect(pending).resolves.toEqual({ restored: true, waited: true });
    expect(clearTimer).toHaveBeenCalledWith(102);
    expect(eventTarget.removeEventListener).toHaveBeenCalledWith("online", expect.any(Function));
    expect(timerCallback).toEqual(expect.any(Function));
  });

  test("retoma ao voltar à aba após reconexão sem evento online, sem antecipar pagamento offline", async () => {
    const eventTarget = createEventTarget();
    let offline = true;
    const setTimer = jest.fn(() => 103);
    const clearTimer = jest.fn();

    const pending = waitForOnline({
      timeoutMs: 8000,
      eventTarget,
      setTimer,
      clearTimer,
      isOffline: () => offline,
    });

    eventTarget.dispatch("focus");
    expect(eventTarget.removeEventListener).not.toHaveBeenCalled();
    expect(clearTimer).not.toHaveBeenCalled();

    offline = false;
    eventTarget.dispatch("focus");

    await expect(pending).resolves.toEqual({ restored: true, waited: true });
    expect(eventTarget.removeEventListener).toHaveBeenCalledWith("online", expect.any(Function));
    expect(eventTarget.removeEventListener).toHaveBeenCalledWith("focus", expect.any(Function));
    expect(clearTimer).toHaveBeenCalledWith(103);
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

    eventTarget.dispatch("online"); // Evento espúrio não deve cancelar o timeout.
    timerCallback();

    await expect(pending).resolves.toEqual({ restored: false, waited: true });
    expect(eventTarget.removeEventListener).toHaveBeenCalledWith("online", expect.any(Function));
    expect(eventTarget.removeEventListener).toHaveBeenCalledWith("focus", expect.any(Function));
  });
});
