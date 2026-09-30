import { trackTelemetry } from "./telemetry";

const INSTALL_AVAILABLE_EVENT = "cutinapp:pwa-install-available";
const INSTALL_STATE_EVENT = "cutinapp:pwa-install-state";

let deferredPrompt = null;
let installed = false;
let initialized = false;

const emit = (name, detail) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
};

const isStandalone = () => {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)")?.matches
    || window.navigator?.standalone === true;
};

export const getPwaInstallState = () => ({
  available: Boolean(deferredPrompt) && !installed && !isStandalone(),
  installed: installed || isStandalone(),
});

export const requestPwaInstall = async () => {
  if (!deferredPrompt || installed || isStandalone()) {
    return { outcome: "unavailable" };
  }

  const promptEvent = deferredPrompt;
  deferredPrompt = null;
  emit(INSTALL_STATE_EVENT, getPwaInstallState());

  try {
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    const outcome = choice?.outcome || "dismissed";
    trackTelemetry("pwa_install_prompt_result", { outcome });
    return { outcome };
  } catch (error) {
    trackTelemetry("pwa_install_prompt_failed", {
      message: error?.message || "unknown",
    });
    return { outcome: "error" };
  }
};

export const installPwaInstallPromptLifecycle = () => {
  if (typeof window === "undefined" || initialized) return;
  initialized = true;
  installed = isStandalone();

  window.addEventListener("beforeinstallprompt", (event) => {
    // Only expose install UI after the browser itself confirms eligibility.
    event.preventDefault();
    deferredPrompt = event;
    const state = getPwaInstallState();
    trackTelemetry("pwa_install_available", { available: state.available });
    emit(INSTALL_AVAILABLE_EVENT, state);
    emit(INSTALL_STATE_EVENT, state);
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    installed = true;
    trackTelemetry("pwa_installed", { source: "native_prompt" });
    emit(INSTALL_STATE_EVENT, getPwaInstallState());
  });
};

export const PWA_INSTALL_AVAILABLE_EVENT = INSTALL_AVAILABLE_EVENT;
export const PWA_INSTALL_STATE_EVENT = INSTALL_STATE_EVENT;
