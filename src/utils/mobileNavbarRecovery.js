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

export const installMobileNavbarRecovery = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  if (window.__cutinappMobileNavbarRecoveryInstalled) return () => {};
  window.__cutinappMobileNavbarRecoveryInstalled = true;

  const onToggle = (event) => {
    const toggle = event.target?.closest?.(".cut-navbar .navbar-toggler");
    if (!toggle || !window.matchMedia(MOBILE_QUERY).matches) return;

    const collapse = collapseForToggle(toggle);
    if (!collapse) return;
    const wasOpen = collapse.classList.contains("show") || collapse.dataset.cutinappRecoveryOpen === "1";
    const expectedOpen = !wasOpen;

    // Apply the drawer state synchronously on pointer/click. React-Bootstrap
    // still receives the same click and keeps component state authoritative,
    // but slow Android WebViews and conflicting legacy collapse handlers can
    // no longer leave the menu visually closed after the user taps it.
    forceState(toggle, collapse, expectedOpen);

    // Reassert once after React/Bootstrap handlers have completed. This is a
    // recovery guard only; it deliberately mirrors the state chosen above.
    window.setTimeout(() => forceState(toggle, collapse, expectedOpen), 60);
  };

  const onDestination = (event) => {
    const destination = event.target?.closest?.(".cut-navbar .navbar-collapse a, .cut-navbar .navbar-collapse .dropdown-item");
    if (!destination || !window.matchMedia(MOBILE_QUERY).matches) return;
    const collapse = destination.closest(".navbar-collapse");
    const navbar = destination.closest(".cut-navbar");
    const toggle = navbar?.querySelector(".navbar-toggler");
    if (collapse && toggle) forceState(toggle, collapse, false);
  };

  document.addEventListener("click", onToggle, true);
  document.addEventListener("click", onDestination, false);

  return () => {
    document.removeEventListener("click", onToggle, true);
    document.removeEventListener("click", onDestination, false);
    delete window.__cutinappMobileNavbarRecoveryInstalled;
  };
};
