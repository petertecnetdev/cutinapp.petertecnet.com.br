import { CHECKOUT_RECOVERY_TTL_MS } from "./checkoutRecovery";
import { trackTelemetry } from "./telemetry";

const CHECKOUT_PREFIX = "cutinapp_checkout_";
const RECOVERY_PREFIX = "cutinapp_checkout_recovery_";
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

const safeJson = (storage, key) => {
  try {
    return JSON.parse(storage?.getItem?.(key) || "null");
  } catch (_) {
    return null;
  }
};

const isDismissed = (storage, slug) => {
  try {
    return storage?.getItem?.(`${DISMISS_PREFIX}${slug}`) === "1";
  } catch (_) {
    return false;
  }
};

export const resumePromptSlugForRoute = (pathname = "") => {
  const match = String(pathname).match(/^\/event\/([^/]+)\/?$/);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch (_) {
    return match[1];
  }
};

export const isResumePromptRoute = (pathname = "") => pathname === "/"
  || pathname === "/home"
  || pathname === "/event"
  || pathname === "/feed"
  || Boolean(resumePromptSlugForRoute(pathname));

export const findPendingCheckout = (storage, now = Date.now(), recoveryStorage = null, targetSlug = null) => {
  const candidatesBySlug = new Map();
  const matchesTarget = (slug) => !targetSlug || slug === targetSlug;

  try {
    if (storage) {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (!key?.startsWith(CHECKOUT_PREFIX) || key.startsWith(RECOVERY_PREFIX) || key.startsWith(DISMISS_PREFIX)) continue;
        const slug = key.slice(CHECKOUT_PREFIX.length);
        if (!slug || !matchesTarget(slug) || isDismissed(storage, slug)) continue;

        const checkout = safeJson(storage, key);
        const quantity = quantityOf(checkout);
        if (quantity <= 0) continue;
        const eventAt = parseDate(checkout?.eventDate);
        if (eventAt !== null && eventAt < now) continue;

        candidatesBySlug.set(slug, {
          slug,
          eventId: Number(checkout?.eventId || 0) || null,
          quantity,
          eventAt,
          hasOrder: false,
          source: "session",
        });
      }
    }

    if (recoveryStorage) {
      for (let index = 0; index < recoveryStorage.length; index += 1) {
        const key = recoveryStorage.key(index);
        if (!key?.startsWith(RECOVERY_PREFIX)) continue;
        const slug = key.slice(RECOVERY_PREFIX.length);
        if (!slug || !matchesTarget(slug) || isDismissed(storage, slug)) continue;

        const recovery = safeJson(recoveryStorage, key);
        const savedAt = Number(recovery?.savedAt || 0);
        if (!savedAt || savedAt > now + 5 * 60 * 1000 || now - savedAt > CHECKOUT_RECOVERY_TTL_MS) continue;

        const quantity = quantityOf(recovery?.selection || {});
        const hasOrder = typeof recovery?.orderPublicId === "string" && Boolean(recovery.orderPublicId.trim());
        if (quantity <= 0 && !hasOrder) continue;

        const existing = candidatesBySlug.get(slug);
        candidatesBySlug.set(slug, {
          slug,
          eventId: existing?.eventId || null,
          quantity: Math.max(existing?.quantity || 0, quantity),
          eventAt: existing?.eventAt ?? null,
          hasOrder: Boolean(existing?.hasOrder || hasOrder),
          source: existing ? "session+recovery" : "recovery",
          savedAt,
        });
      }
    }
  } catch (_) {
    return null;
  }

  const candidates = [...candidatesBySlug.values()];
  candidates.sort((a, b) => {
    if (a.hasOrder !== b.hasOrder) return a.hasOrder ? -1 : 1;
    if (a.eventAt === null && b.eventAt !== null) return 1;
    if (a.eventAt !== null && b.eventAt === null) return -1;
    if ((a.eventAt || 0) !== (b.eventAt || 0)) return (a.eventAt || 0) - (b.eventAt || 0);
    return Number(b.savedAt || 0) - Number(a.savedAt || 0);
  });
  return candidates[0] || null;
};

const removePrompt = () => document.getElementById(PROMPT_ID)?.remove();

const renderPrompt = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  removePrompt();
  const pathname = window.location.pathname;
  if (!isResumePromptRoute(pathname)) return;

  const contextualSlug = resumePromptSlugForRoute(pathname);
  let pending;
  try {
    pending = findPendingCheckout(window.sessionStorage, Date.now(), window.localStorage, contextualSlug);
  } catch (_) {
    pending = null;
  }
  if (!pending) return;

  const surface = contextualSlug ? "event_detail" : pathname === "/feed" ? "feed" : "discovery";
  const prompt = document.createElement("aside");
  prompt.id = PROMPT_ID;
  prompt.setAttribute("role", "status");
  prompt.setAttribute("aria-label", pending.hasOrder ? "Pagamento em andamento" : "Compra em andamento");
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
  title.textContent = pending.hasOrder ? "Pagamento em andamento" : "Sua compra ainda está aqui";
  title.style.display = "block";
  const detail = document.createElement("small");
  detail.textContent = pending.hasOrder
    ? "Retome o checkout para acompanhar a confirmação sem criar uma nova cobrança."
    : `${pending.quantity} selecionado${pending.quantity === 1 ? "" : "s"}. Preço e disponibilidade serão revalidados antes do pagamento.`;
  detail.style.opacity = ".78";
  copy.append(title, detail);

  const actions = document.createElement("div");
  Object.assign(actions.style, { display: "flex", alignItems: "center", gap: "8px", flexShrink: "0" });

  const continueButton = document.createElement("button");
  continueButton.type = "button";
  continueButton.textContent = pending.hasOrder ? "Acompanhar" : "Retomar";
  continueButton.setAttribute("aria-label", pending.hasOrder ? "Acompanhar pagamento em andamento" : "Retomar checkout em andamento");
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
      source: pending.source,
      surface,
      has_pending_order: pending.hasOrder,
    });
    window.location.assign(`/checkout/${encodeURIComponent(pending.slug)}`);
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
    trackTelemetry("checkout_resume_prompt_dismissed", {
      event_id: pending.eventId,
      quantity: pending.quantity,
      target: pending.slug,
      source: pending.source,
      surface,
      has_pending_order: pending.hasOrder,
    });
    try {
      window.sessionStorage.setItem(`${DISMISS_PREFIX}${pending.slug}`, "1");
    } catch (_) {
      removePrompt();
      return;
    }
    removePrompt();
  });

  actions.append(continueButton, dismissButton);
  prompt.append(copy, actions);
  document.body.appendChild(prompt);

  const shownKey = `${pending.slug}:${pending.hasOrder ? "order" : "selection"}:${pending.source}:${surface}`;
  if (!shown.has(shownKey)) {
    shown.add(shownKey);
    trackTelemetry("checkout_resume_prompt_shown", {
      event_id: pending.eventId,
      quantity: pending.quantity,
      target: pending.slug,
      source: pending.source,
      surface,
      has_pending_order: pending.hasOrder,
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