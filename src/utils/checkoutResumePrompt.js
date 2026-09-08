import { trackTelemetry } from "./telemetry";

const CHECKOUT_PREFIX = "cutinapp_checkout_";
const DISMISS_PREFIX = "cutinapp_checkout_resume_dismissed_";
const PROMPT_ID = "cutinapp-checkout-resume-prompt";
const shown = new Set();

const quantityOf = (checkout = {}) => [...(checkout.tickets || []), ...(checkout.items || [])]
  .reduce((sum, item) => sum + Math.max(0, Number(item?.quantity || 0)), 0);

const parseDate = (value) => {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
};

export const isResumePromptRoute = (pathname = "") => pathname === "/" || pathname === "/home" || pathname === "/event";

export const findPendingCheckout = (storage, now = Date.now()) => {
  if (!storage) return null;
  const candidates = [];

  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key?.startsWith(CHECKOUT_PREFIX)) continue;
      const slug = key.slice(CHECKOUT_PREFIX.length);
      if (!slug || storage.getItem(`${DISMISS_PREFIX}${slug}`) === "1") continue;

      let checkout;
      try {
        checkout = JSON.parse(storage.getItem(key) || "null");
      } catch (_) {
        continue;
      }

      const quantity = quantityOf(checkout);
      if (quantity <= 0) continue;
      const eventAt = parseDate(checkout?.eventDate);
      if (eventAt !== null && eventAt < now) continue;

      candidates.push({
        slug,
        eventId: Number(checkout?.eventId || 0) || null,
        quantity,
        eventAt,
      });
    }
  } catch (_) {
    return null;
  }

  candidates.sort((a, b) => {
    if (a.eventAt === null && b.eventAt !== null) return 1;
    if (a.eventAt !== null && b.eventAt === null) return -1;
    return (a.eventAt || 0) - (b.eventAt || 0);
  });
  return candidates[0] || null;
};

const removePrompt = () => document.getElementById(PROMPT_ID)?.remove();

const renderPrompt = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  removePrompt();
  if (!isResumePromptRoute(window.location.pathname)) return;

  let pending;
  try {
    pending = findPendingCheckout(window.sessionStorage);
  } catch (_) {
    pending = null;
  }
  if (!pending) return;

  const prompt = document.createElement("aside");
  prompt.id = PROMPT_ID;
  prompt.setAttribute("role", "status");
  prompt.setAttribute("aria-label", "Compra em andamento");
  Object.assign(prompt.style, {
    position: "fixed",
    left: "max(12px, env(safe-area-inset-left))",
    right: "max(12px, env(safe-area-inset-right))",
    bottom: "calc(78px + env(safe-area-inset-bottom))",
    zIndex: "1045",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    maxWidth: "720px",
    margin: "0 auto",
    padding: "12px 14px",
    border: "1px solid rgba(255,255,255,.16)",
    borderRadius: "16px",
    background: "rgba(14,17,24,.96)",
    boxShadow: "0 16px 40px rgba(0,0,0,.32)",
    color: "#fff",
    backdropFilter: "blur(14px)",
  });

  const copy = document.createElement("div");
  copy.style.minWidth = "0";
  const title = document.createElement("strong");
  title.textContent = "Compra em andamento";
  title.style.display = "block";
  const detail = document.createElement("small");
  detail.textContent = `${pending.quantity} selecionado${pending.quantity === 1 ? "" : "s"}. Preço e disponibilidade serão revalidados.`;
  detail.style.opacity = ".78";
  copy.append(title, detail);

  const actions = document.createElement("div");
  Object.assign(actions.style, { display: "flex", alignItems: "center", gap: "8px", flexShrink: "0" });

  const continueButton = document.createElement("button");
  continueButton.type = "button";
  continueButton.textContent = "Continuar";
  continueButton.setAttribute("aria-label", "Continuar compra em andamento");
  Object.assign(continueButton.style, {
    minHeight: "44px",
    padding: "0 16px",
    border: "0",
    borderRadius: "12px",
    fontWeight: "700",
    cursor: "pointer",
  });
  continueButton.addEventListener("click", () => {
    trackTelemetry("checkout_resume_prompt_clicked", {
      event_id: pending.eventId,
      quantity: pending.quantity,
      target: pending.slug,
    });
    window.location.assign(`/event/${encodeURIComponent(pending.slug)}`);
  });

  const dismissButton = document.createElement("button");
  dismissButton.type = "button";
  dismissButton.textContent = "×";
  dismissButton.setAttribute("aria-label", "Ocultar lembrete de compra");
  Object.assign(dismissButton.style, {
    width: "44px",
    height: "44px",
    border: "0",
    borderRadius: "12px",
    background: "transparent",
    color: "inherit",
    fontSize: "24px",
    cursor: "pointer",
  });
  dismissButton.addEventListener("click", () => {
    try { window.sessionStorage.setItem(`${DISMISS_PREFIX}${pending.slug}`, "1"); } catch (_) {}
    removePrompt();
  });

  actions.append(continueButton, dismissButton);
  prompt.append(copy, actions);
  document.body.appendChild(prompt);

  if (!shown.has(pending.slug)) {
    shown.add(pending.slug);
    trackTelemetry("checkout_resume_prompt_shown", {
      event_id: pending.eventId,
      quantity: pending.quantity,
      target: pending.slug,
    });
  }
};

export const installCheckoutResumePrompt = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  const schedule = () => window.setTimeout(renderPrompt, 0);
  window.addEventListener("cutinapp:route-change", schedule);
  window.addEventListener("popstate", schedule);
  window.addEventListener("pageshow", schedule);
  window.addEventListener("storage", schedule);
  schedule();

  return () => {
    window.removeEventListener("cutinapp:route-change", schedule);
    window.removeEventListener("popstate", schedule);
    window.removeEventListener("pageshow", schedule);
    window.removeEventListener("storage", schedule);
    removePrompt();
  };
};
