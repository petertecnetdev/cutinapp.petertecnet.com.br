/* eslint-disable react/prop-types */
import React, { useEffect, useRef, useState } from "react";

const ECOSYSTEM_VERSION = "2.0.0";
const IDENTITY_VERSION = "3.0.0";
const ECOSYSTEM_URL = `https://petertecnet.com.br/ecosystem/peter-ecosystem.js?v=${ECOSYSTEM_VERSION}`;
const IDENTITY_URL = `https://petertecnet.com.br/ecosystem/peter-identity.js?v=${IDENTITY_VERSION}`;
let ecosystemPromise;
let identityPromise;

function loadScript({ selector, src, datasetKey, datasetValue, ready, message }) {
  if (ready()) return Promise.resolve();
  const existing = document.querySelector(selector);
  if (existing) return new Promise((resolve, reject) => {
    if (ready()) return resolve();
    existing.addEventListener("load", resolve, { once: true });
    existing.addEventListener("error", () => reject(new Error(message)), { once: true });
  });
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset[datasetKey] = datasetValue;
    script.addEventListener("load", resolve, { once: true });
    script.addEventListener("error", () => reject(new Error(message)), { once: true });
    document.head.appendChild(script);
  });
}

function loadIdentity() {
  if (!identityPromise) identityPromise = loadScript({ selector: "script[data-peter-identity-sdk]", src: IDENTITY_URL, datasetKey: "peterIdentitySdk", datasetValue: IDENTITY_VERSION, ready: () => window.PeterIdentity?.version === IDENTITY_VERSION, message: "Não foi possível carregar o Peter Identity SDK." });
  return identityPromise;
}

function loadEcosystem() {
  if (!ecosystemPromise) ecosystemPromise = loadScript({ selector: "script[data-peter-ecosystem-sdk]", src: ECOSYSTEM_URL, datasetKey: "peterEcosystemSdk", datasetValue: ECOSYSTEM_VERSION, ready: () => Boolean(customElements.get("peter-ecosystem-launcher")), message: "Não foi possível carregar o Peter Tecnet Ecosystem SDK." });
  return ecosystemPromise;
}

export default function PeterAccountGateway({ apiBaseUrl, appSlug, children }) {
  const hostRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    const base = apiBaseUrl || "https://api.petertecnet.com.br/api";
    loadIdentity().then(() => window.PeterIdentity?.initialize({ apiBaseUrl: base, appSlug: appSlug || "" })).catch((error) => console.error("[Peter Identity]", error)).finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, [apiBaseUrl, appSlug]);

  useEffect(() => {
    let active = true;
    const host = hostRef.current;
    loadEcosystem().then(() => {
      if (!active || !host) return;
      const launcher = document.createElement("peter-ecosystem-launcher");
      launcher.setAttribute("api-base", apiBaseUrl || "https://api.petertecnet.com.br/api");
      launcher.setAttribute("app-slug", appSlug || "");
      launcher.setAttribute("sdk-version", ECOSYSTEM_VERSION);
      host.replaceChildren(launcher);
    }).catch((error) => console.error("[Peter Tecnet Ecosystem]", error));
    return () => { active = false; host?.replaceChildren(); };
  }, [apiBaseUrl, appSlug]);

  if (!ready) return <div role="status" aria-live="polite" style={{ minHeight: "100dvh", display: "grid", placeItems: "center" }}>Conectando sua Conta Peter Tecnet…</div>;
  return <>{children}<span ref={hostRef} style={{ display: "contents" }} /></>;
}
