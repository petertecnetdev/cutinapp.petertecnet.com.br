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
import { installPasswordFieldEnhancer } from "./utils/passwordFieldEnhancer";
import { installClipboardFallback } from "./utils/clipboard";
import { installPeterWhatsappFallback } from "./utils/peterWhatsappFallback";
import { installGlobalImagePerformance } from "./utils/imagePerformance";
import { installInstagramMobileShell } from "./utils/instagramMobileShell";
import { installNavigationRecovery } from "./utils/navigationRecovery";
import { installEventViewScrollReset } from "./utils/eventViewScrollReset";
import { installCartCompletionCleanup } from "./utils/cartCompletionCleanup";
import { installPersistentCart } from "./utils/persistentCart";
import { installEventFlyerBackground } from "./utils/eventFlyerBackground";
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

if (typeof window !== "undefined") {
  let scrollTimer;
  let isScrolling = false;
  const markScrollEnd = () => {
    isScrolling = false;
    document.body.classList.remove("is-scrolling");
  };
  window.addEventListener("scroll", () => {
    if (!isScrolling) {
      isScrolling = true;
      document.body.classList.add("is-scrolling");
    }
    window.clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(markScrollEnd, 120);
  }, { passive: true });
}

if (typeof window !== "undefined" && !window.location.pathname.startsWith("/checkout/")) {
  installInstagramMobileShell();
}

const installDeferredEnhancers = () => {
  installClipboardFallback();
  installGlobalImagePerformance();

  if (!window.location.pathname.startsWith("/checkout/")) {
    installPasswordFieldEnhancer();
    installPeterWhatsappFallback();
    installEventFlyerBackground();
  }
};

if (typeof window !== "undefined") {
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(installDeferredEnhancers, { timeout: 1200 });
  } else {
    window.setTimeout(installDeferredEnhancers, 350);
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

reportWebVitals((metric) => trackTelemetry("web_vital", {
  name: metric.name,
  value: Math.round(metric.value * 100) / 100,
  delta: Math.round((metric.delta || 0) * 100) / 100,
  rating: metric.rating || null,
  navigation_type: metric.navigationType || null,
  metric_id: metric.id || null,
  path: typeof window !== "undefined" ? window.location.pathname : null,
}));
