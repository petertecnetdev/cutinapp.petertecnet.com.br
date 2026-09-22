import React from "react";
import ReactDOM from "react-dom/client";
import "bootstrap/dist/css/bootstrap.min.css";
import "@fortawesome/fontawesome-free/css/all.min.css";
import "./styles/app.css";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import AppErrorBoundary from "./components/AppErrorBoundary";
import PeterAccountGateway from "./components/PeterAccountGateway";
import { apiBaseUrl, appSlug } from "./config";
import reportWebVitals from "./reportWebVitals";
import { installGlobalImageFallbacks } from "./utils/imageFallback";
import { installNavigationRecovery } from "./utils/navigationRecovery";
import { installEventViewScrollReset } from "./utils/eventViewScrollReset";
import { installCartCompletionCleanup } from "./utils/cartCompletionCleanup";
import { installPersistentCart } from "./utils/persistentCart";
import { trackTelemetry } from "./utils/telemetry";
import { installOverlayLayoutManager } from "./utils/overlayLayoutManager";
import { installGlobalSweetAlertBridge } from "./utils/sweetAlert";
import { installFrontendErrorMonitoring } from "./utils/frontendErrorMonitoring";

installGlobalSweetAlertBridge();
installGlobalImageFallbacks();
installNavigationRecovery();
installEventViewScrollReset();
installCartCompletionCleanup();
installPersistentCart();
installOverlayLayoutManager();
installFrontendErrorMonitoring();

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

  // Keep optional convenience chunks out of the network/main-thread path on
  // constrained phones. Core image performance still installs above; these
  // progressive enhancers remain available on devices with enough headroom.
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
    installDeferredEnhancers().catch(() => {
      // Enhancers are progressive; a failed optional chunk must never block app boot.
    });
  };

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(startDeferredEnhancers, { timeout: 1200 });
  } else {
    window.setTimeout(startDeferredEnhancers, 350);
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