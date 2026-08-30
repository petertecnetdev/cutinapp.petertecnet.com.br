import { startTelemetry } from "./telemetry";
import { apiBaseUrl, appId, appSlug } from "./config";
import React from "react";
import ReactDOM from "react-dom/client";
import axios from "axios";
import { GoogleOAuthProvider } from "@react-oauth/google";
import "./index.css";
import "./App.css";
import "./pages/LegacyPages.css";
import "./pages/LegacyRasoioOverrides.css";
import App from "./App";
import reportWebVitals from "./reportWebVitals";

startTelemetry({ apiBaseUrl, appSlug, appId });

axios.defaults.headers.common["X-Peter-App"] = appSlug;
axios.defaults.headers.common["X-App-ID"] = String(appId);

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
