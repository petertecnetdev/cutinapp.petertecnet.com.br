import {
  getPwaInstallState,
  requestPwaInstall,
  PWA_INSTALL_AVAILABLE_EVENT,
  PWA_INSTALL_STATE_EVENT,
} from "./pwaInstallPrompt";

const MOBILE_MEDIA_QUERY = "(max-width: 820px)";

const emitInstallState = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("petertecnet:pwa-install-state"));
};

export const isMobileDevice = () => {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;

  if (navigator.userAgentData && typeof navigator.userAgentData.mobile === "boolean") {
    return navigator.userAgentData.mobile;
  }

  return /Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && window.matchMedia?.(MOBILE_MEDIA_QUERY)?.matches);
};

export const isPwaInstalled = () => {
  if (typeof window === "undefined") return false;

  if (getPwaInstallState().installed) return true;

  try {
    return Boolean(window.PeterTecnetInstall?.isInstalled?.());
  } catch (_) {
    return false;
  }
};

export const canPromptPwaInstall = () => getPwaInstallState().available;

export const requiresPwaInstallForPurchase = () => isMobileDevice() && !isPwaInstalled();

export const openPwaInstall = async () => {
  if (typeof window === "undefined" || isPwaInstalled()) return false;

  // The canonical lifecycle in pwaInstallPrompt owns beforeinstallprompt.
  // Consumers request the prompt through it instead of registering a second
  // listener and racing for the same one-shot browser event.
  if (canPromptPwaInstall()) {
    const { outcome } = await requestPwaInstall();
    emitInstallState();
    return outcome === "accepted";
  }

  // Shared ecosystem UI remains the fallback for browsers/webviews where the
  // native beforeinstallprompt event is unavailable (for example iOS or an
  // in-app browser). It must not replace a native prompt when one exists.
  if (window.PeterTecnetInstall?.open) {
    window.PeterTecnetInstall.open();
    return true;
  }

  window.dispatchEvent(new CustomEvent("cutinapp:request-install"));
  return false;
};

export const subscribeToPwaInstallState = (callback) => {
  if (typeof window === "undefined") return () => {};

  const refresh = () => callback({
    installed: isPwaInstalled(),
    mobile: isMobileDevice(),
    required: requiresPwaInstallForPurchase(),
    canPrompt: canPromptPwaInstall(),
  });

  const media = window.matchMedia?.("(display-mode: standalone)");
  const mobileMedia = window.matchMedia?.(MOBILE_MEDIA_QUERY);

  window.addEventListener("appinstalled", refresh);
  window.addEventListener("pageshow", refresh);
  window.addEventListener("focus", refresh);
  window.addEventListener("petertecnet:pwa-install-state", refresh);
  window.addEventListener(PWA_INSTALL_AVAILABLE_EVENT, refresh);
  window.addEventListener(PWA_INSTALL_STATE_EVENT, refresh);
  media?.addEventListener?.("change", refresh);
  mobileMedia?.addEventListener?.("change", refresh);

  const handleVisibility = () => {
    if (!document.hidden) refresh();
  };
  document.addEventListener("visibilitychange", handleVisibility);

  refresh();

  return () => {
    window.removeEventListener("appinstalled", refresh);
    window.removeEventListener("pageshow", refresh);
    window.removeEventListener("focus", refresh);
    window.removeEventListener("petertecnet:pwa-install-state", refresh);
    window.removeEventListener(PWA_INSTALL_AVAILABLE_EVENT, refresh);
    window.removeEventListener(PWA_INSTALL_STATE_EVENT, refresh);
    media?.removeEventListener?.("change", refresh);
    mobileMedia?.removeEventListener?.("change", refresh);
    document.removeEventListener("visibilitychange", handleVisibility);
  };
};
