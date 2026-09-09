const ROUTE_CHANGE_EVENT = "cutinapp:route-change";

const scrollPageToTop = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
};

// Legacy export name retained to avoid import churn. The reset is intentionally
// global so every Cutinapp route starts at the beginning of the page.
export const installEventViewScrollReset = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};

  let timer = null;
  let frame = null;
  let lastPathname = window.location.pathname;
  const originalPushState = window.history.pushState;
  const originalReplaceState = window.history.replaceState;
  const previousScrollRestoration = window.history.scrollRestoration;

  if ("scrollRestoration" in window.history) {
    window.history.scrollRestoration = "manual";
  }

  const scheduleReset = () => {
    window.clearTimeout(timer);
    if (frame !== null) window.cancelAnimationFrame(frame);

    scrollPageToTop();
    frame = window.requestAnimationFrame(() => {
      scrollPageToTop();
      frame = window.requestAnimationFrame(scrollPageToTop);
    });
    timer = window.setTimeout(scrollPageToTop, 120);
  };

  const dispatchRouteChangeIfPathChanged = (previousPathname) => {
    const currentPathname = window.location.pathname;
    if (currentPathname === previousPathname) return;
    lastPathname = currentPathname;
    window.dispatchEvent(new Event(ROUTE_CHANGE_EVENT));
  };

  window.history.pushState = function patchedPushState(...args) {
    const previousPathname = window.location.pathname;
    const result = originalPushState.apply(this, args);
    dispatchRouteChangeIfPathChanged(previousPathname);
    return result;
  };

  window.history.replaceState = function patchedReplaceState(...args) {
    const previousPathname = window.location.pathname;
    const result = originalReplaceState.apply(this, args);
    dispatchRouteChangeIfPathChanged(previousPathname);
    return result;
  };

  const handlePopState = () => {
    const currentPathname = window.location.pathname;
    if (currentPathname === lastPathname) return;
    lastPathname = currentPathname;
    scheduleReset();
  };

  window.addEventListener(ROUTE_CHANGE_EVENT, scheduleReset);
  window.addEventListener("popstate", handlePopState);
  window.addEventListener("pageshow", scheduleReset);

  scheduleReset();

  return () => {
    window.clearTimeout(timer);
    if (frame !== null) window.cancelAnimationFrame(frame);
    window.history.pushState = originalPushState;
    window.history.replaceState = originalReplaceState;
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = previousScrollRestoration;
    }
    window.removeEventListener(ROUTE_CHANGE_EVENT, scheduleReset);
    window.removeEventListener("popstate", handlePopState);
    window.removeEventListener("pageshow", scheduleReset);
  };
};
