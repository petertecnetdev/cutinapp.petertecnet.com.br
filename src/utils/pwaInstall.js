const MOBILE_MEDIA_QUERY = "(max-width: 820px)";

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

  const standalone = window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.navigator?.standalone === true;

  if (standalone) return true;

  try {
    return Boolean(window.PeterTecnetInstall?.isInstalled?.());
  } catch (_) {
    return false;
  }
};

export const requiresPwaInstallForPurchase = () => isMobileDevice() && !isPwaInstalled();

export const openPwaInstall = () => {
  if (typeof window === "undefined") return false;

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
  });

  const media = window.matchMedia?.("(display-mode: standalone)");
  const mobileMedia = window.matchMedia?.(MOBILE_MEDIA_QUERY);

  window.addEventListener("appinstalled", refresh);
  window.addEventListener("pageshow", refresh);
  window.addEventListener("focus", refresh);
  window.addEventListener("petertecnet:pwa-install-state", refresh);
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
    media?.removeEventListener?.("change", refresh);
    mobileMedia?.removeEventListener?.("change", refresh);
    document.removeEventListener("visibilitychange", handleVisibility);
  };
};
