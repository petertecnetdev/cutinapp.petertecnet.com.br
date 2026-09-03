/* eslint-disable react/prop-types */
import React, { useEffect, useRef } from "react";

const SDK_VERSION = "2.0.0";
const INSIGHTS_VERSION = "1.0.0";
const SDK_URL = `https://petertecnet.com.br/ecosystem/peter-ecosystem.js?v=${SDK_VERSION}`;
const INSIGHTS_URL = `https://petertecnet.com.br/ecosystem/peter-insights.js?v=${INSIGHTS_VERSION}`;
let sdkPromise;
let insightsPromise;

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

function loadInsights() {
  if (window.PeterTecnetInsights?.version === INSIGHTS_VERSION && customElements.get("peter-insight-chart")) return Promise.resolve();
  if (insightsPromise) return insightsPromise;
  insightsPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector("script[data-peter-insights-sdk]");
    if (existing) {
      if (customElements.get("peter-insight-chart")) resolve();
      else {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("Não foi possível carregar o Peter Tecnet Insights SDK.")), { once: true });
      }
      return;
    }
    const script = document.createElement("script");
    script.src = INSIGHTS_URL;
    script.async = true;
    script.dataset.peterInsightsSdk = INSIGHTS_VERSION;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("Não foi possível carregar o Peter Tecnet Insights SDK.")), { once: true });
    document.head.appendChild(script);
  });
  return insightsPromise;
}

export default function PeterAccountGateway({ apiBaseUrl, appSlug, children }) {
  const hostRef = useRef(null);

  useEffect(() => {
    let active = true;
    const host = hostRef.current;

    loadInsights().catch((error) => console.error("[Peter Tecnet Insights]", error));
    loadSdk()
      .then(() => {
        if (!active || !host) return;
        const launcher = document.createElement("peter-ecosystem-launcher");
        launcher.setAttribute("api-base", apiBaseUrl || "https://api.petertecnet.com.br/api");
        launcher.setAttribute("app-slug", appSlug || "");
        launcher.setAttribute("sdk-version", SDK_VERSION);
        host.replaceChildren(launcher);
      })
      .catch((error) => console.error("[Peter Tecnet Ecosystem]", error));

    return () => {
      active = false;
      host?.replaceChildren();
    };
  }, [apiBaseUrl, appSlug]);

  return <>{children}<span ref={hostRef} style={{ display: "contents" }} /></>;
}