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
      eventTarget.removeEventListener("focus", onOnline);
      if (timerId !== null && typeof clearTimer === "function") clearTimer(timerId);
      resolve({ restored, waited: true });
    };

    const onOnline = () => {
      // O evento pode chegar antes de navigator.onLine refletir a reconexão.
      // Não retomar uma tentativa de pagamento enquanto o navegador indicar offline.
      if (!isOffline()) finish(true);
    };

    eventTarget.addEventListener("online", onOnline);
    // Em abas móveis suspensas, o navegador pode atualizar onLine sem emitir "online".
    // Reavaliar no foco evita aguardar todo o timeout antes de retomar o checkout.
    eventTarget.addEventListener("focus", onOnline);
    timerId = setTimer(() => finish(!isOffline()), Math.max(0, Number(timeoutMs) || 0));

    if (!isOffline()) finish(true);
  });
};
