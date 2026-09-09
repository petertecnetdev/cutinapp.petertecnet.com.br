import { CHECKOUT_RECOVERY_CHANGE_EVENT, CHECKOUT_RECOVERY_TTL_MS, clearCheckoutRecovery, readCheckoutRecovery, writeCheckoutRecovery } from "./checkoutRecovery";
import { trackTelemetry } from "./telemetry";

const CART_PREFIX = "cutinapp_checkout_";
const RECOVERY_PREFIX = "cutinapp_checkout_recovery_";
const CART_ID = "cutinapp-persistent-cart";

const parse = (storage, key) => {
  try { return JSON.parse(storage?.getItem?.(key) || "null"); } catch (_) { return null; }
};
const quantity = (value = {}) => [...(value.tickets || []), ...(value.items || [])]
  .reduce((sum, item) => sum + Math.max(0, Number(item?.quantity || 0)), 0);
const normalizedSelection = (value = {}) => ({
  tickets: (value.tickets || []).map((item) => ({ id: Number(item.id), quantity: Number(item.quantity) })).filter((item) => item.id > 0 && item.quantity > 0),
  items: (value.items || []).map((item) => ({ id: Number(item.id), quantity: Number(item.quantity) })).filter((item) => item.id > 0 && item.quantity > 0),
});
const sameSelection = (a, b) => JSON.stringify(normalizedSelection(a)) === JSON.stringify(normalizedSelection(b));
const remove = (storage, key) => { try { storage?.removeItem?.(key); return true; } catch (_) { return false; } };
const set = (storage, key, value) => { try { storage?.setItem?.(key, JSON.stringify(value)); return true; } catch (_) { return false; } };

const syncCart = (now = Date.now()) => {
  try {
    for (let i = window.sessionStorage.length - 1; i >= 0; i -= 1) {
      const key = window.sessionStorage.key(i);
      if (!key?.startsWith(CART_PREFIX) || key.startsWith(RECOVERY_PREFIX)) continue;
      const slug = key.slice(CART_PREFIX.length);
      const cart = parse(window.sessionStorage, key);
      if (!slug || quantity(cart) <= 0) continue;

      const eventAt = cart?.eventDate ? new Date(cart.eventDate).getTime() : null;
      const recovery = readCheckoutRecovery(slug, now);
      if (Number.isFinite(eventAt) && eventAt < now && !recovery?.orderPublicId) {
        remove(window.sessionStorage, key);
        clearCheckoutRecovery(slug);
        continue;
      }
      if (!recovery?.orderPublicId && (!recovery?.selection || !sameSelection(recovery.selection, cart))) {
        writeCheckoutRecovery(slug, { selection: cart, couponCode: recovery?.couponCode || null }, now);
      }
    }

    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key?.startsWith(RECOVERY_PREFIX)) continue;
      const slug = key.slice(RECOVERY_PREFIX.length);
      const recovery = readCheckoutRecovery(slug, now);
      if (!slug || !recovery?.selection || quantity(recovery.selection) <= 0) continue;
      const sessionKey = `${CART_PREFIX}${slug}`;
      if (quantity(parse(window.sessionStorage, sessionKey)) <= 0) set(window.sessionStorage, sessionKey, recovery.selection);
    }
  } catch (_) {
    // Checkout remains usable when browser storage is unavailable.
  }
};

const pendingCart = (now = Date.now()) => {
  const bySlug = new Map();
  try {
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const key = window.sessionStorage.key(i);
      if (!key?.startsWith(CART_PREFIX) || key.startsWith(RECOVERY_PREFIX)) continue;
      const slug = key.slice(CART_PREFIX.length);
      const cart = parse(window.sessionStorage, key);
      const count = quantity(cart);
      const eventAt = cart?.eventDate ? new Date(cart.eventDate).getTime() : null;
      if (!slug || count <= 0 || (Number.isFinite(eventAt) && eventAt < now)) continue;
      bySlug.set(slug, { slug, eventId: Number(cart?.eventId || 0) || null, quantity: count, eventAt, hasOrder: false, savedAt: 0 });
    }
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key?.startsWith(RECOVERY_PREFIX)) continue;
      const slug = key.slice(RECOVERY_PREFIX.length);
      const recovery = parse(window.localStorage, key);
      const savedAt = Number(recovery?.savedAt || 0);
      if (!slug || !savedAt || now - savedAt > CHECKOUT_RECOVERY_TTL_MS) continue;
      const existing = bySlug.get(slug);
      const count = quantity(recovery?.selection || {});
      const hasOrder = Boolean(String(recovery?.orderPublicId || "").trim());
      if (!existing && count <= 0 && !hasOrder) continue;
      bySlug.set(slug, { slug, eventId: existing?.eventId || null, quantity: Math.max(existing?.quantity || 0, count), eventAt: existing?.eventAt ?? null, hasOrder, savedAt });
    }
  } catch (_) { return null; }

  return [...bySlug.values()].sort((a, b) => {
    if (a.hasOrder !== b.hasOrder) return a.hasOrder ? -1 : 1;
    if (a.eventAt !== b.eventAt) return (a.eventAt || Number.MAX_SAFE_INTEGER) - (b.eventAt || Number.MAX_SAFE_INTEGER);
    return b.savedAt - a.savedAt;
  })[0] || null;
};

const skipRoute = () => /^\/(?:checkout|login|cadastro|register|auth)(?:\/|$)/i.test(window.location.pathname);
const removeBanner = () => document.getElementById(CART_ID)?.remove();

const render = () => {
  syncCart();
  removeBanner();
  const cart = pendingCart();
  if (!cart || skipRoute()) return;

  const banner = document.createElement("aside");
  banner.id = CART_ID;
  banner.setAttribute("role", "status");
  banner.setAttribute("aria-live", "polite");
  Object.assign(banner.style, { position: "fixed", left: "12px", right: "12px", bottom: "calc(76px + env(safe-area-inset-bottom))", zIndex: "1038", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", maxWidth: "760px", margin: "0 auto", padding: "13px 14px", border: `1px solid ${cart.hasOrder ? "rgba(255,193,7,.72)" : "rgba(13,110,253,.68)"}`, borderRadius: "18px", background: "rgba(7,15,30,.97)", boxShadow: "0 18px 52px rgba(0,0,0,.42)", color: "#fff", backdropFilter: "blur(16px)" });

  const copy = document.createElement("div");
  copy.style.minWidth = "0";
  const title = document.createElement("strong");
  title.style.display = "block";
  title.textContent = cart.hasOrder ? "Pagamento pendente" : "Seu carrinho está esperando";
  const detail = document.createElement("small");
  detail.style.opacity = ".8";
  detail.textContent = cart.hasOrder
    ? "Esta cobrança já foi criada. Retome o pagamento para acompanhar a confirmação."
    : `${cart.quantity} item${cart.quantity === 1 ? "" : "s"} no carrinho. Ingressos e itens do evento serão pagos juntos.`;
  copy.append(title, detail);

  const actions = document.createElement("div");
  Object.assign(actions.style, { display: "flex", alignItems: "center", gap: "8px", flexShrink: "0" });
  if (!cart.hasOrder) {
    const clear = document.createElement("button");
    clear.type = "button";
    clear.textContent = "Esvaziar";
    Object.assign(clear.style, { minHeight: "44px", border: "0", background: "transparent", color: "rgba(255,255,255,.75)", fontWeight: "700" });
    clear.addEventListener("click", () => {
      remove(window.sessionStorage, `${CART_PREFIX}${cart.slug}`);
      clearCheckoutRecovery(cart.slug);
      trackTelemetry("checkout_cart_cleared", { event_id: cart.eventId, quantity: cart.quantity, target: cart.slug });
      render();
    });
    actions.appendChild(clear);
  }

  const checkout = document.createElement("button");
  checkout.type = "button";
  checkout.textContent = cart.hasOrder ? "Retomar pagamento" : "Finalizar carrinho";
  Object.assign(checkout.style, { minHeight: "44px", padding: "0 16px", border: "0", borderRadius: "12px", background: "#fff", color: "#081329", fontWeight: "800" });
  checkout.addEventListener("click", () => {
    trackTelemetry("checkout_cart_opened", { event_id: cart.eventId, quantity: cart.quantity, target: cart.slug, has_pending_order: cart.hasOrder });
    window.location.assign(`/checkout/${encodeURIComponent(cart.slug)}`);
  });
  actions.appendChild(checkout);
  banner.append(copy, actions);
  document.body.appendChild(banner);
};

export const installPersistentCart = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  let timer = null;
  const schedule = () => { window.clearTimeout(timer); timer = window.setTimeout(render, 0); };
  const visible = () => { if (document.visibilityState === "visible") schedule(); };
  ["cutinapp:route-change", CHECKOUT_RECOVERY_CHANGE_EVENT, "popstate", "pageshow", "focus", "storage"].forEach((event) => window.addEventListener(event, schedule));
  document.addEventListener("visibilitychange", visible);
  document.addEventListener("click", schedule);
  document.addEventListener("change", schedule);
  schedule();
  return () => {
    window.clearTimeout(timer);
    ["cutinapp:route-change", CHECKOUT_RECOVERY_CHANGE_EVENT, "popstate", "pageshow", "focus", "storage"].forEach((event) => window.removeEventListener(event, schedule));
    document.removeEventListener("visibilitychange", visible);
    document.removeEventListener("click", schedule);
    document.removeEventListener("change", schedule);
    removeBanner();
  };
};
