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
import "./styles/responsive.css";
import "./styles/logo-theme.css";
import "./styles/interactive-effects.css";
import "./pages/HomeDiscovery.css";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import PeterAccountGateway from "./components/PeterAccountGateway";
import { apiBaseUrl, appSlug } from "./config";
import reportWebVitals from "./reportWebVitals";
import { installGlobalImageFallbacks } from "./utils/imageFallback";

installGlobalImageFallbacks();

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <PeterAccountGateway apiBaseUrl={apiBaseUrl} appSlug={appSlug}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </PeterAccountGateway>
  </React.StrictMode>
);

reportWebVitals();
