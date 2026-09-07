export const isBrowserOffline = () => (
  typeof navigator !== "undefined" && navigator.onLine === false
);

export const waitForOnline = ({
  timeoutMs = 8000,
  eventTarget = typeof window !== "undefined" ? window : null,
  setTimer = typeof window !== "undefined" ? window.setTimeout.bind(window) : null,
  clearTimer = typeof window !== "undefined" ? window.clearTimeout.bind(window) : null,
  isOffline = isBrowserOffline,
} = {}) => {
  if (!isOffline()) return Promise.resolve({ restored: true, waited: false });
  if (!eventTarget?.addEventListener || !eventTarget?.removeEventListener || typeof setTimer !== "function") {
    return Promise.resolve({ restored: false, waited: false });
  }

  return new Promise((resolve) => {
    let settled = false;
    let timerId = null;

    const finish = (restored) => {
      if (settled) return;
      settled = true;
      eventTarget.removeEventListener("online", onOnline);
      if (timerId !== null && typeof clearTimer === "function") clearTimer(timerId);
      resolve({ restored, waited: true });
    };

    const onOnline = () => finish(true);

    eventTarget.addEventListener("online", onOnline, { once: true });
    timerId = setTimer(() => finish(!isOffline()), Math.max(0, Number(timeoutMs) || 0));

    if (!isOffline()) finish(true);
  });
};
