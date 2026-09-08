const NAVBAR_SELECTOR = ".cut-navbar .navbar-collapse";
const ACTIVE_NAV_SELECTOR = `${NAVBAR_SELECTOR}.show, ${NAVBAR_SELECTOR}.collapsing`;
const ACTIVE_BLOCKING_UI_SELECTOR = ".modal.show, .offcanvas.show, .offcanvas.showing";

const clearStaleBodyLock = () => {
  if (typeof document === "undefined") return;
  const navigationOpen = Boolean(document.querySelector(ACTIVE_NAV_SELECTOR));
  const blockingUiOpen = Boolean(document.querySelector(ACTIVE_BLOCKING_UI_SELECTOR));
  if (navigationOpen || blockingUiOpen) return;

  if (document.body.style.overflow === "hidden") document.body.style.removeProperty("overflow");
  if (document.body.style.overscrollBehavior === "none") document.body.style.removeProperty("overscroll-behavior");
  document.body.classList.remove("modal-open", "offcanvas-open");

  document.querySelectorAll(".modal-backdrop, .offcanvas-backdrop").forEach((backdrop) => {
    if (!document.querySelector(ACTIVE_BLOCKING_UI_SELECTOR)) backdrop.remove();
  });
};

export const installNavigationRecovery = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};

  let recoveryTimer = null;
  const scheduleRecovery = (delay = 260) => {
    window.clearTimeout(recoveryTimer);
    recoveryTimer = window.setTimeout(clearStaleBodyLock, delay);
  };

  const onClick = (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    if (target.closest(".cut-navbar .navbar-toggler")) {
      scheduleRecovery(420);
      return;
    }

    if (target.closest(`${NAVBAR_SELECTOR} a, ${NAVBAR_SELECTOR} .dropdown-item`)) {
      scheduleRecovery(120);
    }
  };

  const onPageRestore = () => scheduleRecovery(0);
  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") scheduleRecovery(0);
  };

  document.addEventListener("click", onClick, true);
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("pageshow", onPageRestore);
  window.addEventListener("popstate", onPageRestore);

  const observer = new MutationObserver(() => scheduleRecovery(80));
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ["class", "style"],
    childList: true,
    subtree: true,
  });

  scheduleRecovery(0);

  return () => {
    window.clearTimeout(recoveryTimer);
    observer.disconnect();
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("pageshow", onPageRestore);
    window.removeEventListener("popstate", onPageRestore);
  };
};
