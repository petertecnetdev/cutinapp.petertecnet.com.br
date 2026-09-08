const MOBILE_BREAKPOINT = 991.98;
const SHELL_MARK = "data-cut-instagram-shell";
const NAV_RELEVANT_SELECTOR = ".cut-mobile-bottom-nav, .cut-capability-nav, .cut-navbar";

const isMobile = () => typeof window !== "undefined" && window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;

const routeOf = (node) => {
  if (!(node instanceof Element)) return "";
  const anchor = node.matches("a[href]") ? node : node.querySelector("a[href]");
  if (!anchor) return "";
  try { return new URL(anchor.href, window.location.origin).pathname; } catch (_) { return anchor.getAttribute("href") || ""; }
};

const labelOf = (node) => node?.querySelector?.("span")?.textContent?.trim() || node?.textContent?.trim() || "";

const iconFor = (route, label) => {
  if (route.startsWith("/event")) return "fa-regular fa-calendar-days";
  if (route.startsWith("/feed")) return "fa-solid fa-house";
  if (route.startsWith("/passes")) return "fa-solid fa-ticket";
  if (route.startsWith("/profile")) return "fa-regular fa-circle-user";
  if (/áreas|areas|produção|producao/i.test(label)) return "fa-solid fa-plus";
  return "fa-regular fa-circle";
};

const rank = (node) => {
  const route = routeOf(node);
  const label = labelOf(node);
  if (route.startsWith("/event")) return 1;
  if (route.startsWith("/feed")) return 2;
  if (/áreas|areas|produção|producao/i.test(label)) return 3;
  if (route.startsWith("/passes")) return 4;
  if (route.startsWith("/profile")) return 5;
  return 20;
};

const haptic = (duration = 8) => {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(duration);
  } catch (_) { /* progressive enhancement only */ }
};

const prepareBottomNav = () => {
  const nav = document.querySelector(".cut-mobile-bottom-nav");
  if (!nav) return;
  nav.setAttribute(SHELL_MARK, "bottom");

  const current = Array.from(nav.children);
  const desired = [...current].sort((a, b) => rank(a) - rank(b));
  const needsReorder = current.some((node, index) => node !== desired[index]);
  if (needsReorder) desired.forEach((node) => nav.appendChild(node));

  Array.from(nav.children).forEach((node) => {
    const route = routeOf(node);
    const label = labelOf(node);
    const itemRank = rank(node);
    node.classList.toggle("cut-mobile-bottom-nav__primary", itemRank === 3);
    const icon = node.querySelector("i");
    const desiredIcon = iconFor(route, label);
    if (icon && icon.className !== desiredIcon) icon.className = desiredIcon;
    if (!node.getAttribute("aria-label") && label) node.setAttribute("aria-label", label);
    if (node.getAttribute("title") !== (label || "Navegação")) node.setAttribute("title", label || "Navegação");
    if (itemRank === 3 && node.querySelector("span")) node.querySelector("span").textContent = "Criar";
    if (node.dataset.cutNavInteraction !== "true") {
      node.dataset.cutNavInteraction = "true";
      node.addEventListener("pointerdown", () => haptic(itemRank === 3 ? 12 : 7), { passive: true });
    }
  });
};

const ensureTopActions = () => {
  const navbar = document.querySelector(".cut-capability-nav .cut-navbar__inner");
  if (!navbar) return;

  if (!navbar.querySelector(".cut-instagram-mobile-actions")) {
    const actions = document.createElement("div");
    actions.className = "cut-instagram-mobile-actions";
    actions.setAttribute("aria-label", "Ações rápidas mobile");
    actions.innerHTML = `
      <a class="cut-instagram-mobile-action" href="/feed#composer" aria-label="Criar publicação" title="Criar publicação">
        <i class="fa-regular fa-square-plus" aria-hidden="true"></i>
      </a>
      <a class="cut-instagram-mobile-action" href="/notifications" aria-label="Notificações" title="Notificações">
        <i class="fa-regular fa-heart" aria-hidden="true"></i>
      </a>
    `;

    const toggle = navbar.querySelector(".navbar-toggler");
    navbar.insertBefore(actions, toggle || null);
  }

  navbar.querySelectorAll(".cut-instagram-mobile-action").forEach((action) => {
    if (action.dataset.cutNavInteraction === "true") return;
    action.dataset.cutNavInteraction = "true";
    action.addEventListener("pointerdown", () => haptic(7), { passive: true });
  });

  const brand = navbar.querySelector(".cut-navbar__brand");
  if (brand) {
    if (brand.getAttribute("href") !== "/event") brand.setAttribute("href", "/event");
    if (brand.getAttribute("aria-label") !== "Cutinapp — Eventos") brand.setAttribute("aria-label", "Cutinapp — Eventos");
  }
};

let lastScrollY = 0;
const syncNavbarScrollState = () => {
  const navbar = document.querySelector(".cut-capability-nav");
  if (!navbar) return;
  const y = Math.max(0, window.scrollY || 0);
  const delta = y - lastScrollY;
  navbar.classList.toggle("cut-mobile-nav--scrolled", y > 10);
  navbar.classList.toggle("cut-mobile-nav--compact", y > 56);

  const canHide = y > 160 && Math.abs(delta) > 4 && !document.body.classList.contains("cut-mobile-keyboard-open");
  if (canHide && delta > 0) navbar.classList.add("cut-mobile-nav--hidden");
  if (delta < 0 || y < 80) navbar.classList.remove("cut-mobile-nav--hidden");
  lastScrollY = y;
};

const isTextInput = (target) => target instanceof Element && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));

const syncKeyboardState = () => {
  if (!isMobile()) return;
  const focused = isTextInput(document.activeElement);
  const viewport = window.visualViewport;
  const viewportShrunk = viewport ? window.innerHeight - viewport.height > 140 : false;
  document.body.classList.toggle("cut-mobile-keyboard-open", focused && viewportShrunk);
  document.body.classList.toggle("cut-mobile-focus-mode", focused && viewportShrunk);
};

const focusComposer = () => {
  if (window.location.hash !== "#composer") return;
  const textarea = document.querySelector(".cut-feed textarea, main textarea, form textarea");
  if (!textarea || textarea.dataset.cutComposerFocused === "true") return;
  textarea.dataset.cutComposerFocused = "true";
  textarea.id = textarea.id || "composer";
  textarea.scrollIntoView({ behavior: "smooth", block: "center" });
  window.setTimeout(() => textarea.focus({ preventScroll: true }), 180);
};

const prepareShell = () => {
  if (!isMobile()) {
    document.documentElement.removeAttribute(SHELL_MARK);
    document.body.classList.remove("cut-mobile-keyboard-open", "cut-mobile-focus-mode");
    const navbar = document.querySelector(".cut-capability-nav");
    navbar?.classList.remove("cut-mobile-nav--scrolled", "cut-mobile-nav--compact", "cut-mobile-nav--hidden");
    return;
  }
  document.documentElement.setAttribute(SHELL_MARK, "active");
  prepareBottomNav();
  ensureTopActions();
  syncNavbarScrollState();
  syncKeyboardState();
  focusComposer();
};

const mutationTouchesNavigation = (mutation) => {
  const nodes = [...mutation.addedNodes, ...mutation.removedNodes];
  return nodes.some((node) => {
    if (!(node instanceof Element)) return false;
    return node.matches(NAV_RELEVANT_SELECTOR) || Boolean(node.querySelector?.(NAV_RELEVANT_SELECTOR));
  });
};

export const installInstagramMobileShell = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};

  let queued = false;
  let scrollQueued = false;
  const queue = () => {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(() => {
      queued = false;
      prepareShell();
    });
  };

  const onScroll = () => {
    if (!isMobile() || scrollQueued) return;
    scrollQueued = true;
    window.requestAnimationFrame(() => {
      scrollQueued = false;
      syncNavbarScrollState();
    });
  };

  const onFocusChange = () => window.setTimeout(syncKeyboardState, 80);
  const onViewportChange = () => window.requestAnimationFrame(syncKeyboardState);
  const onNavigation = () => queue();

  queue();
  lastScrollY = Math.max(0, window.scrollY || 0);

  // React can mutate large feeds/lists many times per second. Re-running the shell on
  // every DOM mutation was unnecessary and expensive, so only navigation mount/unmount
  // changes trigger a full shell preparation now.
  const observer = new MutationObserver((mutations) => {
    if (mutations.some(mutationTouchesNavigation)) queue();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  window.addEventListener("resize", queue, { passive: true });
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("popstate", onNavigation);
  window.addEventListener("hashchange", onNavigation);
  window.addEventListener("pageshow", onNavigation);
  document.addEventListener("focusin", onFocusChange);
  document.addEventListener("focusout", onFocusChange);
  window.visualViewport?.addEventListener("resize", onViewportChange, { passive: true });

  return () => {
    observer.disconnect();
    window.removeEventListener("resize", queue);
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("popstate", onNavigation);
    window.removeEventListener("hashchange", onNavigation);
    window.removeEventListener("pageshow", onNavigation);
    document.removeEventListener("focusin", onFocusChange);
    document.removeEventListener("focusout", onFocusChange);
    window.visualViewport?.removeEventListener("resize", onViewportChange);
  };
};
