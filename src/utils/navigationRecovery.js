const NAVBAR_SELECTOR = ".cut-navbar .navbar-collapse";
const ACTIVE_NAV_SELECTOR = `${NAVBAR_SELECTOR}.show, ${NAVBAR_SELECTOR}.collapsing`;
const ACTIVE_BLOCKING_UI_SELECTOR = ".modal.show, .offcanvas.show, .offcanvas.showing";
const STALE_BACKDROP_SELECTOR = ".modal-backdrop, .offcanvas-backdrop";

const clearStaleBodyLock = () => {
  if (typeof document === "undefined") return;

  const navigationOpen = Boolean(document.querySelector(ACTIVE_NAV_SELECTOR));
  const blockingUiOpen = Boolean(document.querySelector(ACTIVE_BLOCKING_UI_SELECTOR));
  if (navigationOpen || blockingUiOpen) return;

  if (document.body.style.overflow === "hidden") document.body.style.removeProperty("overflow");
  if (document.body.style.overscrollBehavior === "none") document.body.style.removeProperty("overscroll-behavior");
  document.body.classList.remove("modal-open", "offcanvas-open");

  document.querySelectorAll(STALE_BACKDROP_SELECTOR).forEach((backdrop) => backdrop.remove());
};

const collapseStaleNavbar = () => {
  if (typeof document === "undefined") return;
  if (document.querySelector(ACTIVE_BLOCKING_UI_SELECTOR)) return;

  document.querySelectorAll(`${NAVBAR_SELECTOR}.show, ${NAVBAR_SELECTOR}.collapsing`).forEach((collapse) => {
    collapse.classList.remove("show", "collapsing");
  });
  document.querySelectorAll(".cut-navbar .navbar-toggler[aria-expanded='true']").forEach((toggle) => {
    toggle.setAttribute("aria-expanded", "false");
    toggle.classList.add("collapsed");
  });
};

export const installNavigationRecovery = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};

  let recoveryTimer = null;
  const scheduleRecovery = (delay = 180, { collapseNavbar = false } = {}) => {
    window.clearTimeout(recoveryTimer);
    recoveryTimer = window.setTimeout(() => {
      if (collapseNavbar) collapseStaleNavbar();
      clearStaleBodyLock();
    }, delay);
  };

  const onClick = (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    if (target.closest(".cut-navbar .navbar-toggler")) {
      scheduleRecovery(420);
      return;
    }

    // Dropdown toggles are disclosure controls, not navigation destinations.
    // They must only expand/collapse their option list and keep the fullscreen
    // hamburger open. Closing here caused actor areas such as Administrativo,
    // Produtor and Promoter to disappear immediately after the user tapped them.
    if (target.closest(`${NAVBAR_SELECTOR} .dropdown-toggle`)) {
      scheduleRecovery(120);
      return;
    }

    const navbarDestination = target.closest(`${NAVBAR_SELECTOR} a[href]:not(.dropdown-toggle), ${NAVBAR_SELECTOR} .dropdown-item`);
    const bottomDestination = target.closest(".cut-mobile-bottom-nav a[href], .cut-mobile-bottom-nav button");
    if (navbarDestination || bottomDestination) {
      scheduleRecovery(220, { collapseNavbar: Boolean(navbarDestination) });
    }
  };

  const onPageRestore = () => scheduleRecovery(0, { collapseNavbar: true });
  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") scheduleRecovery(0);
  };

  document.addEventListener("click", onClick, true);
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("pageshow", onPageRestore);
  window.addEventListener("popstate", onPageRestore);
  window.addEventListener("hashchange", onPageRestore);

  // Only watch body-level lock changes and backdrop insertion/removal. Observing the
  // full subtree made every React render schedule recovery work and degraded mobile UI.
  const bodyObserver = new MutationObserver((mutations) => {
    const relevant = mutations.some((mutation) => {
      if (mutation.type === "attributes") return mutation.target === document.body;
      return [...mutation.addedNodes, ...mutation.removedNodes].some((node) =>
        node instanceof Element && (node.matches(STALE_BACKDROP_SELECTOR) || node.querySelector?.(STALE_BACKDROP_SELECTOR))
      );
    });
    if (relevant) scheduleRecovery(120);
  });
  bodyObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ["class", "style"],
    childList: true,
  });

  scheduleRecovery(0);

  return () => {
    window.clearTimeout(recoveryTimer);
    bodyObserver.disconnect();
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("pageshow", onPageRestore);
    window.removeEventListener("popstate", onPageRestore);
    window.removeEventListener("hashchange", onPageRestore);
  };
};
