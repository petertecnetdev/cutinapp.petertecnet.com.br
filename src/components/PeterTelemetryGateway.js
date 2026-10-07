/* eslint-disable react/prop-types */
import React, { useEffect } from "react";
import { installTelemetryEnrichment } from "../utils/telemetry";

const TELEMETRY_VERSION = "3.3.3";
const TELEMETRY_URL = `https://petertecnet.com.br/ecosystem/peter-telemetry-v3.js?v=${TELEMETRY_VERSION}`;
let telemetryPromise;

function startTelemetry(apiBaseUrl, appSlug) {
  window.PeterTecnetTelemetry?.start({ apiBaseUrl, appSlug });
  installTelemetryEnrichment();
}

function loadTelemetry(apiBaseUrl, appSlug) {
  if (window.PeterTecnetTelemetry?.version === TELEMETRY_VERSION) {
    startTelemetry(apiBaseUrl, appSlug);
    return Promise.resolve();
  }

  if (telemetryPromise) {
    return telemetryPromise.then(() => startTelemetry(apiBaseUrl, appSlug));
  }

  telemetryPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector("script[data-peter-telemetry-sdk]");
    const ready = () => {
      startTelemetry(apiBaseUrl, appSlug);
      resolve();
    };

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

export default function PeterTelemetryGateway({ apiBaseUrl, appSlug, children }) {
  useEffect(() => {
    let active = true;
    let telemetryHandle = null;
    const api = apiBaseUrl || "https://api.petertecnet.com.br/api";

    const start = () => {
      if (!active) return;
      loadTelemetry(api, appSlug || "").catch((error) => console.error("[Peter Tecnet Telemetry]", error));
    };

    const isCheckoutRoute = window.location.pathname.startsWith("/checkout/");
    if (isCheckoutRoute) start();
    else if (typeof window.requestIdleCallback === "function") telemetryHandle = window.requestIdleCallback(start, { timeout: 1800 });
    else telemetryHandle = window.setTimeout(start, 600);

    return () => {
      active = false;
      if (telemetryHandle != null) {
        if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(telemetryHandle);
        else window.clearTimeout(telemetryHandle);
      }
    };
  }, [apiBaseUrl, appSlug]);

  return <>{children}</>;
}
