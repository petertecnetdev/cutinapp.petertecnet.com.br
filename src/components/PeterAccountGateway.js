/* eslint-disable react/prop-types */
import React, { useEffect, useRef, useState } from "react";

const SDK_VERSION = "2.0.0";
const AUTH_SESSION_VERSION = "2.0.0";
const SDK_URL = `https://petertecnet.com.br/ecosystem/peter-ecosystem.js?v=${SDK_VERSION}`;
const AUTH_SESSION_URL = `https://petertecnet.com.br/ecosystem/peter-auth-session.js?v=${AUTH_SESSION_VERSION}`;
let sdkPromise;
let authSessionPromise;

function loadSdk() {
  if (window.PeterTecnetEcosystem?.version === SDK_VERSION && customElements.get("peter-ecosystem-launcher")) return Promise.resolve();
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector("script[data-peter-ecosystem-sdk]");
    if (existing) {
      if (customElements.get("peter-ecosystem-launcher")) resolve();
      else {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("Não foi possível carregar o Peter Tecnet Ecosystem SDK.")), { once: true });
      }
      return;
    }
    const script = document.createElement("script");
    script.src = SDK_URL;
    script.async = true;
    script.dataset.peterEcosystemSdk = SDK_VERSION;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("Não foi possível carregar o Peter Tecnet Ecosystem SDK.")), { once: true });
    document.head.appendChild(script);
  });
  return sdkPromise;
}

function loadAuthSession(apiBaseUrl, appSlug) {
  const configure = () => window.PeterTecnetAuthSession?.configure({ apiBaseUrl: apiBaseUrl || "https://api.petertecnet.com.br/api", appSlug: appSlug || "" });
  if (window.PeterTecnetAuthSession?.version === AUTH_SESSION_VERSION) return Promise.resolve(configure());
  if (!authSessionPromise) {
    authSessionPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector("script[data-peter-auth-session]");
      if (existing) {
        if (window.PeterTecnetAuthSession) resolve();
        else {
          existing.addEventListener("load", () => resolve(), { once: true });
          existing.addEventListener("error", () => reject(new Error("Não foi possível carregar a sessão global Peter Tecnet.")), { once: true });
        }
        return;
      }
      const script = document.createElement("script");
      script.src = AUTH_SESSION_URL;
      script.async = true;
      script.dataset.peterAuthSession = AUTH_SESSION_VERSION;
      script.dataset.apiBase = apiBaseUrl || "https://api.petertecnet.com.br/api";
      script.dataset.appSlug = appSlug || "";
      script.addEventListener("load", () => resolve(), { once: true });
      script.addEventListener("error", () => reject(new Error("Não foi possível carregar a sessão global Peter Tecnet.")), { once: true });
      document.head.appendChild(script);
    });
  }
  return authSessionPromise.then(() => configure());
}

function IdentityBootstrap() {
  return <div role="status" aria-live="polite" style={{ minHeight: "100dvh", display: "grid", placeItems: "center" }}><strong>Conectando sua Conta Peter Tecnet…</strong></div>;
}

export default function PeterAccountGateway({ apiBaseUrl, appSlug, children }) {
  const hostRef = useRef(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let active = true;
    const host = hostRef.current;
    loadAuthSession(apiBaseUrl, appSlug)
      .then(async (session) => {
        if (!active) return;
        if (!session?.getAccessToken?.()) await session?.recover?.();
        if (active) setAuthReady(true);
      })
      .catch((error) => {
        console.error("[Peter Tecnet Auth]", error);
        if (active) setAuthReady(true);
      });
    loadSdk().then(() => {
      if (!active || !host) return;
      const launcher = document.createElement("peter-ecosystem-launcher");
      launcher.setAttribute("api-base", apiBaseUrl || "https://api.petertecnet.com.br/api");
      launcher.setAttribute("app-slug", appSlug || "");
      launcher.setAttribute("sdk-version", SDK_VERSION);
      host.replaceChildren(launcher);
    }).catch((error) => console.error("[Peter Tecnet Ecosystem]", error));
    return () => { active = false; host?.replaceChildren(); };
  }, [apiBaseUrl, appSlug]);

  return <>{authReady ? children : <IdentityBootstrap />}<span ref={hostRef} style={{ display: "contents" }} /></>;
}
