import React from "react";
import ReactDOM from "react-dom/client";
import { GoogleOAuthProvider } from "@react-oauth/google";
import "./index.css";
import App from "./App";
import reportWebVitals from "./reportWebVitals";

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
