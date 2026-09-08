const EVENT_PAGE_SELECTOR = ".cut-event-view-page";
const FLYER_SELECTOR = ".cut-event-banner-frame img";
const BACKGROUND_VARIABLE = "--cut-event-flyer-bg";

const applyEventFlyerBackground = () => {
  const page = document.querySelector(EVENT_PAGE_SELECTOR);
  if (!page) return;

  const flyer = page.querySelector(FLYER_SELECTOR);
  const src = flyer?.currentSrc || flyer?.src || "";

  if (!src) {
    page.style.removeProperty(BACKGROUND_VARIABLE);
    page.classList.remove("cut-event-view-page--flyer-background");
    return;
  }

  const safeUrl = String(src).replace(/["\\]/g, "\\$&");
  page.style.setProperty(BACKGROUND_VARIABLE, `url("${safeUrl}")`);
  page.classList.add("cut-event-view-page--flyer-background");
};

export const installEventFlyerBackground = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};

  let frame = null;
  const scheduleApply = () => {
    if (frame) window.cancelAnimationFrame(frame);
    frame = window.requestAnimationFrame(() => {
      frame = null;
      applyEventFlyerBackground();
    });
  };

  const observer = new MutationObserver(scheduleApply);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src", "class"],
  });

  window.addEventListener("popstate", scheduleApply);
  window.addEventListener("hashchange", scheduleApply);
  scheduleApply();

  return () => {
    observer.disconnect();
    window.removeEventListener("popstate", scheduleApply);
    window.removeEventListener("hashchange", scheduleApply);
    if (frame) window.cancelAnimationFrame(frame);
  };
};
