const EVENT_VIEW_SELECTOR = ".cut-event-view-page";
const ROUTE_CHANGE_EVENT = "cutinapp:route-change";

const scrollEventViewToTop = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (!document.querySelector(EVENT_VIEW_SELECTOR)) return;

  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
};

export const installEventViewScrollReset = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};

  let timer = null;
  let frame = null;
  const originalPushState = window.history.pushState;
  const originalReplaceState = window.history.replaceState;

  const scheduleReset = () => {
    window.clearTimeout(timer);
    if (frame !== null) window.cancelAnimationFrame(frame);

    scrollEventViewToTop();
    frame = window.requestAnimationFrame(() => {
      scrollEventViewToTop();
      frame = window.requestAnimationFrame(scrollEventViewToTop);
    });
    timer = window.setTimeout(scrollEventViewToTop, 120);
  };

  const dispatchRouteChange = () => window.dispatchEvent(new Event(ROUTE_CHANGE_EVENT));

  window.history.pushState = function patchedPushState(...args) {
    const result = originalPushState.apply(this, args);
    dispatchRouteChange();
    return result;
  };

  window.history.replaceState = function patchedReplaceState(...args) {
    const result = originalReplaceState.apply(this, args);
    dispatchRouteChange();
    return result;
  };

  window.addEventListener(ROUTE_CHANGE_EVENT, scheduleReset);
  window.addEventListener("popstate", scheduleReset);
  window.addEventListener("pageshow", scheduleReset);

  scheduleReset();

  return () => {
    window.clearTimeout(timer);
    if (frame !== null) window.cancelAnimationFrame(frame);
    window.history.pushState = originalPushState;
    window.history.replaceState = originalReplaceState;
    window.removeEventListener(ROUTE_CHANGE_EVENT, scheduleReset);
    window.removeEventListener("popstate", scheduleReset);
    window.removeEventListener("pageshow", scheduleReset);
  };
};
