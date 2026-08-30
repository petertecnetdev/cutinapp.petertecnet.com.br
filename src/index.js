import { startTelemetry } from "./telemetry";
import { apiBaseUrl, appSlug } from "./config";
import React from "react";
import ReactDOM from "react-dom/client";
import { GoogleOAuthProvider } from "@react-oauth/google";
import "./index.css";
import "./App.css";
import "./pages/LegacyPages.css";
import "./pages/LegacyRasoioOverrides.css";
import App from "./App";
import reportWebVitals from "./reportWebVitals";

startTelemetry({ apiBaseUrl, appSlug });

const googleClientId = String(process.env.REACT_APP_GOOGLE_CLIENT_ID || "").trim();
const root = ReactDOM.createRoot(document.getElementById("root"));

const application = (
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

root.render(
  googleClientId ? (
    <GoogleOAuthProvider clientId={googleClientId}>{application}</GoogleOAuthProvider>
  ) : application
);

reportWebVitals();
