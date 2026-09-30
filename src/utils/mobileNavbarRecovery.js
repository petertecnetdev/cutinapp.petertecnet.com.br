const MOBILE_QUERY = "(max-width: 991.98px)";

const collapseForToggle = (toggle) => {
  const controls = toggle?.getAttribute("aria-controls");
  if (controls) {
    const controlled = document.getElementById(controls);
    if (controlled) return controlled;
  }
  return toggle?.closest(".cut-navbar")?.querySelector(".navbar-collapse") || null;
};

const forceState = (toggle, collapse, open) => {
  if (!toggle || !collapse) return;
  collapse.classList.remove("collapsing");
  collapse.classList.toggle("show", open);
  toggle.classList.toggle("collapsed", !open);
  toggle.setAttribute("aria-expanded", open ? "true" : "false");
  collapse.dataset.cutinappRecoveryOpen = open ? "1" : "0";
};

const isOpen = (collapse) => collapse?.classList.contains("show") === true;

export const installMobileNavbarRecovery = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  if (window.__cutinappMobileNavbarRecoveryInstalled) return () => {};
  window.__cutinappMobileNavbarRecoveryInstalled = true;

  const onToggle = (event) => {
    const toggle = event.target?.closest?.(".cut-navbar .navbar-toggler");
    if (!toggle || !window.matchMedia(MOBILE_QUERY).matches) return;

    const collapse = collapseForToggle(toggle);
    if (!collapse) return;

    const beforeOpen = isOpen(collapse);
    const expectedOpen = !beforeOpen;

    // Let React/Bootstrap own the click first. Previous recovery code changed
    // the DOM in capture phase before the framework handler ran, which could
    // race with a later React render and make the drawer close again.
    window.setTimeout(() => {
      const frameworkOpen = isOpen(collapse);
      const frameworkExpanded = toggle.getAttribute("aria-expanded") === "true";

      // Framework handled the click. Only normalize class/ARIA if one of them
      // lagged behind; do not compete with component state.
      if (frameworkOpen === expectedOpen || frameworkExpanded === expectedOpen) {
        if (frameworkOpen !== frameworkExpanded) forceState(toggle, collapse, expectedOpen);
        return;
      }

      // No state transition happened: recover the drawer as a fallback.
      forceState(toggle, collapse, expectedOpen);

      // Some mobile WebViews flush a delayed Bootstrap/React update after the
      // first task. Verify once more, without installing a competing loop.
      window.setTimeout(() => {
        if (isOpen(collapse) !== expectedOpen) forceState(toggle, collapse, expectedOpen);
      }, 220);
    }, 100);
  };

  const onDestination = (event) => {
    const destination = event.target?.closest?.(".cut-navbar .navbar-collapse a, .cut-navbar .navbar-collapse .dropdown-item");
    if (!destination || !window.matchMedia(MOBILE_QUERY).matches) return;
    const collapse = destination.closest(".navbar-collapse");
    const navbar = destination.closest(".cut-navbar");
    const toggle = navbar?.querySelector(".navbar-toggler");
    if (collapse && toggle) forceState(toggle, collapse, false);
  };

  // Bubble phase is intentional: framework handlers get the first chance to
  // update the controlled navbar state. Recovery only verifies afterwards.
  document.addEventListener("click", onToggle, false);
  document.addEventListener("click", onDestination, false);

  return () => {
    document.removeEventListener("click", onToggle, false);
    document.removeEventListener("click", onDestination, false);
    delete window.__cutinappMobileNavbarRecoveryInstalled;
  };
};
