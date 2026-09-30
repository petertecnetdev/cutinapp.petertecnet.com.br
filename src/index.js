import React from "react";
import ReactDOM from "react-dom/client";
import "bootstrap/dist/css/bootstrap.min.css";
import "@fortawesome/fontawesome-free/css/all.min.css";
import "./styles/app.css";
import "./styles/mobile-hamburger-emergency.css";
import "./pages/production/production-public-polish.css";
import "./styles/mobileFeedTouchTargets.css";
import "./components/event/EventPosterThumbnail.css";
import "./styles/event-ticket-purchase.css";
import "./styles/ticket-purchase-brand-mobile.css";
import "./components/WhatsAppFloatingButton.css";
import "./components/event/EventDiscoveryRail.css";
import "./styles/mobile-bottom-nav-fix.css";
import "./styles/checkout-mobile-hardening.css";
import "./styles/wallet-mobile-brand-hardening.css";
// Must stay after every legacy/navigation stylesheet. This is the authoritative
// mobile drawer layer and prevents older navbar CSS from hiding the collapse.
import "./styles/mobile-hamburger-recovery.css";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import AppErrorBoundary from "./components/AppErrorBoundary";
import PeterAccountGateway from "./components/PeterAccountGateway";
import { apiBaseUrl, appSlug } from "./config";
import reportWebVitals from "./reportWebVitals";
import { installGlobalImageFallbacks } from "./utils/imageFallback";
import { installNavigationRecovery } from "./utils/navigationRecovery";
import { installMobileNavbarRecovery } from "./utils/mobileNavbarRecovery";
import { installEventViewScrollReset } from "./utils/eventViewScrollReset";
import { installCartCompletionCleanup } from "./utils/cartCompletionCleanup";
import { installPersistentCart } from "./utils/persistentCart";
import { trackTelemetry } from "./utils/telemetry";
import { installOverlayLayoutManager } from "./utils/overlayLayoutManager";
import { installGlobalSweetAlertBridge } from "./utils/sweetAlert";
import { installFrontendErrorMonitoring } from "./utils/frontendErrorMonitoring";
import { installPwaInstallPromptLifecycle } from "./utils/pwaInstallPrompt";

installGlobalSweetAlertBridge();
installGlobalImageFallbacks();
installNavigationRecovery();
installMobileNavbarRecovery();
installEventViewScrollReset();
installCartCompletionCleanup();
installPersistentCart();
installOverlayLayoutManager();
installFrontendErrorMonitoring();
installPwaInstallPromptLifecycle();

const getServiceWorkerReleaseVersion = () => {
  if (typeof document === "undefined") return "app-v6";

  const assetUrls = [
    ...Array.from(document.querySelectorAll("script[src]"), (node) => node.src),
    ...Array.from(document.querySelectorAll('link[rel="stylesheet"][href]'), (node) => node.href),
  ];

  for (const assetUrl of assetUrls) {
    const match = assetUrl.match(/\/static\/(?:js|css)\/[^/?]*?\.([a-f0-9]{8,})\.(?:js|css)(?:\?|$)/i);
    if (match?.[1]) return match[1].toLowerCase();
  }

  return "app-v6";
};

if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  const isLocalhost = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
  const isSecureOrigin = window.location.protocol === "https:" || isLocalhost;

  if (isSecureOrigin) {
    window.addEventListener("load", () => {
      const releaseVersion = getServiceWorkerReleaseVersion();
      navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(releaseVersion)}`, { scope: "/" }).then((registration) => {
        trackTelemetry("pwa_service_worker_registered", {
          scope: registration.scope,
          controlled: Boolean(navigator.serviceWorker.controller),
          release_version: releaseVersion,
        });
      }).catch((error) => {
        trackTelemetry("pwa_service_worker_registration_failed", {
          message: error?.message || "unknown",
        });
      });
    }, { once: true });
  }
}

const installDeferredEnhancers = async () => {
  const { installGlobalImagePerformance } = await import("./utils/imagePerformance");
  installGlobalImagePerformance();

  const connection = typeof navigator !== "undefined" ? navigator.connection : null;
  const constrainedNetwork = Boolean(
    connection?.saveData
    || connection?.effectiveType === "slow-2g"
    || connection?.effectiveType === "2g"
  );
  const constrainedDevice = Boolean(
    (Number.isFinite(navigator?.deviceMemory) && navigator.deviceMemory <= 4)
    || (Number.isFinite(navigator?.hardwareConcurrency) && navigator.hardwareConcurrency <= 4)
  );

  if (constrainedNetwork || constrainedDevice) return;

  if (!window.location.pathname.startsWith("/checkout/")) {
    const [
      { installInstagramMobileShell },
      { installClipboardFallback },
      { installPasswordFieldEnhancer },
      { installPeterWhatsappFallback },
      { installEventFlyerBackground },
    ] = await Promise.all([
      import("./utils/instagramMobileShell"),
      import("./utils/clipboard"),
      import("./utils/passwordFieldEnhancer"),
      import("./utils/peterWhatsappFallback"),
      import("./utils/eventFlyerBackground"),
    ]);

    installInstagramMobileShell();
    installClipboardFallback();
    installPasswordFieldEnhancer();
    installPeterWhatsappFallback();
    installEventFlyerBackground();
  }
};

if (typeof window !== "undefined") {
  const startDeferredEnhancers = () => {
    installDeferredEnhancers().catch(() => {});
  };

  const scheduleDeferredEnhancers = () => {
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(startDeferredEnhancers, { timeout: 1800 });
    } else {
      window.setTimeout(startDeferredEnhancers, 500);
    }
  };

  if (document.readyState === "complete") {
    scheduleDeferredEnhancers();
  } else {
    window.addEventListener("load", scheduleDeferredEnhancers, { once: true });
  }
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <AppErrorBoundary>
      <PeterAccountGateway apiBaseUrl={apiBaseUrl} appSlug={appSlug}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </PeterAccountGateway>
    </AppErrorBoundary>
  </React.StrictMode>
);

const enqueueWebVitalTelemetry = (metric) => {
  const send = () => trackTelemetry("web_vital", {
    name: metric.name,
    value: Math.round(metric.value * 100) / 100,
    delta: Math.round((metric.delta || 0) * 100) / 100,
    rating: metric.rating || null,
    navigation_type: metric.navigationType || null,
    metric_id: metric.id || null,
    path: typeof window !== "undefined" ? window.location.pathname : null,
  });

  if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(send, { timeout: 2000 });
    return;
  }

  window.setTimeout(send, 0);
};

reportWebVitals(enqueueWebVitalTelemetry);