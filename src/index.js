import React from "react";
import ReactDOM from "react-dom/client";
import "bootstrap/dist/css/bootstrap.min.css";
import "@fortawesome/fontawesome-free/css/all.min.css";
import "./styles/tokens.css";
import "./styles/global.css";
import "./styles/layout.css";
import "./styles/components.css";
import "./styles/domains.css";
import "./styles/community.css";
import "./styles/social-network.css";
import "./styles/profile-actors.css";
import "./styles/responsive.css";
import "./styles/nexus-mobile-nav.css";
import "./styles/logo-theme.css";
import "./styles/interactive-effects.css";
import "./styles/error-boundary.css";
import "./pages/HomeDiscovery.css";
import "./styles/mobile-stability.css";
import "./styles/peter-navbar-standard.css";
import "./styles/cutinapp-mobile-final.css";
import "./styles/advanced-navbar.css";
import "./styles/peter-branding-bridge.css";
import "./styles/instagram-mobile-shell.css";
import "./styles/mobile-footer-regression-fixes.css";
import "./styles/event-view-mobile-cleanup.css";
import "./styles/mobile-navigation-v2.css";
import "./styles/event-view-polish.css";
import "./styles/event-flyer-background.css";
import "./styles/mobile-hamburger-recovery.css";
import "./styles/desktop-navbar-overflow-fix.css";
import "./styles/responsive-hardening.css";
import "./styles/performance.css";
import "./styles/event-view-shotgun-layout.css";
import "./styles/messages-mobile-composer-spacing.css";
import "./pages/checkout/Coupon.css";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import MediaLibraryInputEnhancer from "./components/MediaLibraryInputEnhancer";
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

installGlobalImageFallbacks();
installNavigationRecovery();
installEventViewScrollReset();
installCartCompletionCleanup();
installPersistentCart();

const installDeferredEnhancers = () => {
  installClipboardFallback();
  installGlobalImagePerformance();

  if (!window.location.pathname.startsWith("/checkout/")) {
    installPasswordFieldEnhancer();
    installPeterWhatsappFallback();
    installInstagramMobileShell();
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
    <PeterAccountGateway apiBaseUrl={apiBaseUrl} appSlug={appSlug}>
      <AuthProvider>
        <App />
        <MediaLibraryInputEnhancer />
      </AuthProvider>
    </PeterAccountGateway>
  </React.StrictMode>
);

reportWebVitals((metric) => trackTelemetry("web_vital", { name: metric.name, value: Math.round(metric.value * 100) / 100, rating: metric.rating || null }));