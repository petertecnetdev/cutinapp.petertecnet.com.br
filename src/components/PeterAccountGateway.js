/* eslint-disable react/prop-types */
import React, { useEffect, useRef } from "react";

const SDK_VERSION = "3.0.0";
const TELEMETRY_VERSION = "3.1.0";
const SDK_URL = `https://petertecnet.com.br/ecosystem/peter-ecosystem-v3.js?v=${SDK_VERSION}`;
const TELEMETRY_URL = `https://petertecnet.com.br/ecosystem/peter-telemetry-v3.js?v=${TELEMETRY_VERSION}`;
let sdkPromise;
let telemetryPromise;

function loadTelemetry(apiBaseUrl, appSlug) {
  if (window.PeterTecnetTelemetry?.version === TELEMETRY_VERSION) {
    window.PeterTecnetTelemetry.start({ apiBaseUrl, appSlug });
    return Promise.resolve();
  }
  if (telemetryPromise) return telemetryPromise.then(() => window.PeterTecnetTelemetry?.start({ apiBaseUrl, appSlug }));
  telemetryPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector("script[data-peter-telemetry-sdk]");
    const ready = () => { window.PeterTecnetTelemetry?.start({ apiBaseUrl, appSlug }); resolve(); };
    if (existing) {
      if (window.PeterTecnetTelemetry) ready();
      else {
        existing.addEventListener("load", ready, { once: true });
        existing.addEventListener("error", () => reject(new Error("Não foi possível carregar a telemetria Peter Tecnet.")), { once: true });
      }
      return;
    }
    const script = document.createElement("script");
    script.src = TELEMETRY_URL;
    script.async = true;
    script.dataset.peterTelemetrySdk = TELEMETRY_VERSION;
    script.dataset.appSlug = appSlug || "";
    script.dataset.apiBase = apiBaseUrl || "https://api.petertecnet.com.br/api";
    script.addEventListener("load", ready, { once: true });
    script.addEventListener("error", () => reject(new Error("Não foi possível carregar a telemetria Peter Tecnet.")), { once: true });
    document.head.appendChild(script);
  });
  return telemetryPromise;
}

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

export default function PeterAccountGateway({ apiBaseUrl, appSlug, children }) {
  const hostRef = useRef(null);

  useEffect(() => {
    let active = true;
    const host = hostRef.current;
    const api = apiBaseUrl || "https://api.petertecnet.com.br/api";

    loadTelemetry(api, appSlug || "")
      .catch((error) => console.error("[Peter Tecnet Telemetry]", error))
      .finally(() => loadSdk().then(() => {
        if (!active || !host) return;
        const launcher = document.createElement("peter-ecosystem-launcher");
        launcher.setAttribute("api-base", api);
        launcher.setAttribute("app-slug", appSlug || "");
        launcher.setAttribute("sdk-version", SDK_VERSION);
        host.replaceChildren(launcher);
      }).catch((error) => console.error("[Peter Tecnet Ecosystem]", error)));

    return () => {
      active = false;
      host?.replaceChildren();
    };
  }, [apiBaseUrl, appSlug]);

  return <>{children}<span ref={hostRef} style={{ display: "contents" }} /></>;
}
