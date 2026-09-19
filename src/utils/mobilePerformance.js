const MOBILE_QUERY = "(max-width: 991.98px)";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const SLOW_CONNECTIONS = new Set(["slow-2g", "2g", "3g"]);

const mediaMatches = (query) => (
  typeof window !== "undefined"
  && typeof window.matchMedia === "function"
  && window.matchMedia(query).matches
);

export const getMobileRuntimeProfile = () => {
  if (typeof window === "undefined") {
    return {
      mobile: false,
      reducedMotion: false,
      saveData: false,
      effectiveType: "",
      constrainedNetwork: false,
    };
  }

  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const effectiveType = String(connection?.effectiveType || "").toLowerCase();
  const saveData = Boolean(connection?.saveData);
  const constrainedNetwork = saveData || SLOW_CONNECTIONS.has(effectiveType);

  return {
    mobile: mediaMatches(MOBILE_QUERY),
    reducedMotion: mediaMatches(REDUCED_MOTION_QUERY),
    saveData,
    effectiveType,
    constrainedNetwork,
  };
};

export const shouldPreloadSecondaryRoutes = () => {
  const profile = getMobileRuntimeProfile();
  return !profile.mobile && !profile.constrainedNetwork;
};

export const shouldEnableDecorativeEffects = () => {
  const profile = getMobileRuntimeProfile();
  return !profile.mobile && !profile.reducedMotion && !profile.constrainedNetwork;
};

export const scheduleIdleWork = (callback, { timeout = 1400, fallbackDelay = 450 } = {}) => {
  if (typeof window === "undefined" || typeof callback !== "function") return () => {};

  let cancelled = false;
  const run = () => {
    if (!cancelled) callback();
  };

  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(run, { timeout });
    return () => {
      cancelled = true;
      window.cancelIdleCallback?.(id);
    };
  }

  const id = window.setTimeout(run, fallbackDelay);
  return () => {
    cancelled = true;
    window.clearTimeout(id);
  };
};

const syncRuntimeClasses = () => {
  if (typeof document === "undefined") return;
  const profile = getMobileRuntimeProfile();
  const root = document.documentElement;
  const body = document.body;

  root.dataset.cutViewport = profile.mobile ? "mobile" : "desktop";
  root.dataset.cutNetwork = profile.constrainedNetwork ? "constrained" : "normal";
  body?.classList.toggle("cut-mobile-runtime", profile.mobile);
  body?.classList.toggle("cut-network-constrained", profile.constrainedNetwork);
  body?.classList.toggle("cut-reduced-motion", profile.reducedMotion);
};

export const installMobilePerformanceProfile = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};

  syncRuntimeClasses();

  const mobileMedia = window.matchMedia?.(MOBILE_QUERY);
  const motionMedia = window.matchMedia?.(REDUCED_MOTION_QUERY);
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const onChange = () => syncRuntimeClasses();

  mobileMedia?.addEventListener?.("change", onChange);
  motionMedia?.addEventListener?.("change", onChange);
  connection?.addEventListener?.("change", onChange);
  window.addEventListener("pageshow", onChange);

  return () => {
    mobileMedia?.removeEventListener?.("change", onChange);
    motionMedia?.removeEventListener?.("change", onChange);
    connection?.removeEventListener?.("change", onChange);
    window.removeEventListener("pageshow", onChange);
  };
};
