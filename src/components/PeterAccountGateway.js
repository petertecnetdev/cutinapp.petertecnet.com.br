import React, { useEffect, useMemo, useRef, useState } from "react";
import "./PeterAccountGateway.css";

const TOKEN_KEYS = ["token", "access_token", "auth_token"];
const getToken = () => TOKEN_KEYS.map((key) => localStorage.getItem(key)).find(Boolean) || null;
const messageOf = (payload, fallback) => payload?.message || payload?.error || fallback;
const isPeterUrl = (value) => { try { const url = new URL(value); const host = url.hostname.toLowerCase(); return url.protocol === "https:" && (host === "petertecnet.com.br" || host.endsWith(".petertecnet.com.br")); } catch { return false; } };

export default function PeterAccountGateway({ apiBaseUrl, appSlug, children }) {
  const api = String(apiBaseUrl || "").replace(/\/+$/, "");
  const slug = String(appSlug || "").trim().toLowerCase();
  const [transfer, setTransfer] = useState("idle");
  const [transferError, setTransferError] = useState("");
  const [ecosystem, setEcosystem] = useState(null);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState("");
  const [switchError, setSwitchError] = useState("");
  const panelRef = useRef(null);
  const handoff = useMemo(() => new URL(window.location.href).searchParams.get("peter_sso"), []);

  useEffect(() => {
    if (!handoff || !api || !slug) return undefined;
    let alive = true;
    setTransfer("loading");
    fetch(`${api}/account/sso/exchange`, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", "X-Peter-App": slug }, body: JSON.stringify({ handoff_code: handoff, application: slug }) })
      .then(async (response) => { const payload = await response.json().catch(() => ({})); if (!response.ok || !payload?.data?.access_token) throw new Error(messageOf(payload, "Não foi possível concluir o acesso entre aplicativos.")); return payload.data; })
      .then((data) => { if (!alive) return; localStorage.setItem("token", data.access_token); if (data.user) localStorage.setItem("user", JSON.stringify(data.user)); const url = new URL(window.location.href); url.searchParams.delete("peter_sso"); url.searchParams.delete("peter_from"); window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`); window.dispatchEvent(new Event("authChanged")); setTransfer("success"); })
      .catch((error) => { if (alive) { setTransferError(error?.message || "Código de acesso inválido ou expirado."); setTransfer("error"); } });
    return () => { alive = false; };
  }, [api, handoff, slug]);

  useEffect(() => {
    if (handoff && transfer !== "success") return undefined;
    const token = getToken();
    if (!token || !api) return undefined;
    const controller = new AbortController();
    fetch(`${api}/account/ecosystem`, { headers: { Accept: "application/json", Authorization: `Bearer ${token}`, "X-Peter-App": slug }, signal: controller.signal })
      .then(async (response) => { const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(); return payload?.data || null; })
      .then(setEcosystem).catch(() => setEcosystem(null));
    return () => controller.abort();
  }, [api, handoff, slug, transfer]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (event.key === "Escape") setOpen(false); if (event.type === "mousedown" && panelRef.current && !panelRef.current.contains(event.target)) setOpen(false); };
    document.addEventListener("keydown", close); document.addEventListener("mousedown", close);
    return () => { document.removeEventListener("keydown", close); document.removeEventListener("mousedown", close); };
  }, [open]);

  const openApp = async (application) => {
    if (!application?.has_access || application.slug === slug || switching) return;
    const token = getToken(); if (!token) return;
    setSwitchError(""); setSwitching(application.slug);
    try {
      const response = await fetch(`${api}/account/sso/handoff`, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}`, "X-Peter-App": slug }, body: JSON.stringify({ application: application.slug }) });
      const payload = await response.json().catch(() => ({}));
      const code = payload?.data?.handoff_code; const destination = payload?.data?.application?.url || application.url;
      if (!response.ok || !code) throw new Error(messageOf(payload, "Não foi possível abrir o aplicativo."));
      if (!isPeterUrl(destination)) throw new Error("O endereço deste aplicativo não está configurado com segurança.");
      const url = new URL(destination); url.searchParams.set("peter_sso", code); url.searchParams.set("peter_from", slug); window.location.assign(url.toString());
    } catch (error) { setSwitching(""); setSwitchError(error?.message || "Não foi possível trocar de aplicativo."); }
  };

  if (handoff && transfer !== "success") return <div className="peter-account-transfer" role="status" aria-live="polite"><div className="peter-account-transfer__card"><div className="peter-account-transfer__mark">P</div>{transfer === "error" ? <><h1>Não foi possível conectar sua conta</h1><p>{transferError}</p><a href="/login">Ir para o login</a></> : <><h1>Conta Peter Tecnet</h1><p>Conectando você com segurança a este aplicativo…</p><span className="peter-account-transfer__spinner" /></>}</div></div>;

  const applications = Array.isArray(ecosystem?.applications) ? ecosystem.applications : [];
  const account = ecosystem?.account;
  const initials = `${account?.first_name?.[0] || ""}${account?.last_name?.[0] || ""}`.toUpperCase() || "PT";
  return <>{children}{account && applications.length > 0 && <div className="peter-account-launcher" ref={panelRef}><button className="peter-account-launcher__button" type="button" aria-label="Abrir aplicativos Peter Tecnet" aria-expanded={open} onClick={() => setOpen((v) => !v)}><span className="peter-account-launcher__dots">{Array.from({ length: 9 }, (_, i) => <i key={i} />)}</span></button>{open && <div className="peter-account-launcher__panel"><div className="peter-account-launcher__account"><div className="peter-account-launcher__avatar">{account.avatar ? <img src={account.avatar} alt="" /> : initials}</div><div><strong>{[account.first_name, account.last_name].filter(Boolean).join(" ") || account.user_name}</strong><small>{account.email}</small></div></div><div className="peter-account-launcher__grid">{applications.map((application) => { const current = application.slug === slug; const enabled = application.has_access && !current; return <button key={application.id || application.slug} type="button" disabled={!enabled || Boolean(switching)} className={`peter-account-launcher__app${current ? " is-current" : ""}${!application.has_access ? " is-locked" : ""}`} onClick={() => openApp(application)}><span className="peter-account-launcher__appmark">{String(application.name || application.slug || "P").slice(0, 1).toUpperCase()}</span><strong>{application.name}</strong><small>{current ? "Atual" : application.has_access ? (switching === application.slug ? "Abrindo…" : "Abrir") : "Sem acesso"}</small></button>; })}</div>{switchError && <p className="peter-account-launcher__error" role="alert">{switchError}</p>}<a className="peter-account-launcher__home" href="https://petertecnet.com.br">Ecossistema Peter Tecnet</a></div>}</div>}</>;
}
