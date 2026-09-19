import { trackTelemetry } from "./telemetry";

const MOBILE_BREAKPOINT = 991.98;
const ROOT = document.documentElement;
const BODY = document.body;
const OVERLAYS = [
  { name: "bottom-nav", selector: ".cut-mobile-bottom-nav", zone: "bottom", priority: 20 },
  { name: "event-actions", selector: ".cev2-mobile-actions", zone: "bottom", priority: 40 },
  { name: "cart", selector: ".cut-persistent-cart__bar", zone: "bottom", priority: 60 },
  { name: "whatsapp", selector: ".cut-whatsapp-fab", zone: "bottom-right", priority: 30 },
  { name: "share", selector: "button[title='Compartilhar este evento']", zone: "bottom-right", priority: 35 },
  { name: "flyer", selector: ".cut-floating-flyer-button", zone: "bottom-right", priority: 38 },
  { name: "buy", selector: ".cut-event-buy-cta-fixed", zone: "bottom", priority: 50 },
  { name: "series", selector: ".cut-event-series-launcher", zone: "bottom-right", priority: 42 },
];
const px = (n) => `${Math.max(0, Math.round(Number(n) || 0))}px`;
const visible = (el) => {
  if (!el || !el.isConnected) return false;
  const s = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return s.display !== "none" && s.visibility !== "hidden" && Number(s.opacity || 1) > 0 && r.width > 0 && r.height > 0;
};
const rectsOverlap = (a, b, gap = 2) => a.left < b.right-gap && a.right > b.left+gap && a.top < b.bottom-gap && a.bottom > b.top+gap;
const safeArea = () => parseFloat(getComputedStyle(ROOT).getPropertyValue("--cut-safe-area-bottom")) || 0;

let resizeObserver;
let mutationObserver;
let raf = 0;
let lastCollisionKey = "";
let installed = false;

export const measureOverlayLayout = () => {
  if (typeof window === "undefined" || !BODY) return { bottom: 0, overlays: [] };
  const mobile = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
  const overlays = OVERLAYS.map((item) => ({ ...item, el: document.querySelector(item.selector) }))
    .filter((item) => visible(item.el));
  overlays.forEach(({ el, name, zone, priority }) => {
    el.dataset.cutOverlay = name;
    el.dataset.cutOverlayZone = zone;
    el.dataset.cutOverlayPriority = String(priority);
  });

  const bottomStack = overlays.filter((x) => x.zone === "bottom" && x.name !== "cart").sort((a,b) => a.priority-b.priority);
  const nav = bottomStack.find((x) => x.name === "bottom-nav");
  const actions = bottomStack.find((x) => x.name === "event-actions");
  const navHeight = mobile && nav ? nav.el.getBoundingClientRect().height : 0;
  const actionHeight = mobile && actions ? actions.el.getBoundingClientRect().height : 0;
  const cart = overlays.find((x) => x.name === "cart");
  const cartHeight = cart ? cart.el.getBoundingClientRect().height : 0;
  const gap = 12;
  const cartBottom = mobile ? navHeight + actionHeight + gap : 24;
  const contentBottom = mobile
    ? navHeight + actionHeight + (cart ? cartHeight + gap * 2 : gap)
    : (cart ? cartHeight + 48 : 24);

  ROOT.style.setProperty("--cut-runtime-bottom-nav-height", px(navHeight));
  ROOT.style.setProperty("--cut-runtime-action-bar-height", px(actionHeight));
  ROOT.style.setProperty("--cut-runtime-cart-height", px(cartHeight));
  ROOT.style.setProperty("--cut-runtime-cart-bottom", px(cartBottom));
  ROOT.style.setProperty("--cut-runtime-safe-bottom", px(contentBottom + safeArea()));
  BODY.classList.toggle("cut-has-event-action-rail", actionHeight > 0);
  BODY.classList.toggle("cut-overlay-compact", mobile && window.innerHeight < 700);

  const collisions = [];
  for (let i=0;i<overlays.length;i+=1) for (let j=i+1;j<overlays.length;j+=1) {
    const a=overlays[i], b=overlays[j];
    if (a.name === "cart" && b.name === "bottom-nav") continue;
    if (rectsOverlap(a.el.getBoundingClientRect(), b.el.getBoundingClientRect())) collisions.push([a.name,b.name].sort().join(":"));
  }
  const collisionKey = collisions.sort().join("|");
  if (collisionKey && collisionKey !== lastCollisionKey) {
    trackTelemetry("ui_overlay_collision", {
      route: window.location.pathname,
      viewport_width: window.innerWidth,
      viewport_height: window.innerHeight,
      components: collisions,
    });
  }
  lastCollisionKey = collisionKey;
  BODY.classList.toggle("cut-overlay-collision-detected", Boolean(collisionKey));
  return { bottom: contentBottom, overlays, collisions };
};

const schedule = () => {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => measureOverlayLayout());
};

export const installOverlayLayoutManager = () => {
  if (typeof window === "undefined" || typeof document === "undefined" || installed) return () => {};
  installed = true;
  resizeObserver = new ResizeObserver(schedule);
  OVERLAYS.forEach(({ selector }) => document.querySelectorAll(selector).forEach((el) => resizeObserver.observe(el)));
  mutationObserver = new MutationObserver((mutations) => {
    let relevant = false;
    mutations.forEach((m) => m.addedNodes.forEach((node) => {
      if (!(node instanceof Element)) return;
      OVERLAYS.forEach(({ selector }) => {
        if (node.matches(selector)) { resizeObserver.observe(node); relevant = true; }
        node.querySelectorAll?.(selector).forEach((el) => { resizeObserver.observe(el); relevant = true; });
      });
    }));
    if (relevant) schedule();
  });
  mutationObserver.observe(BODY, { childList: true, subtree: true });
  window.addEventListener("resize", schedule, { passive: true });
  window.addEventListener("orientationchange", schedule, { passive: true });
  window.visualViewport?.addEventListener("resize", schedule, { passive: true });
  document.addEventListener("focusin", schedule);
  document.addEventListener("focusout", schedule);
  schedule();
  return () => {
    installed = false;
    resizeObserver?.disconnect();
    mutationObserver?.disconnect();
    window.removeEventListener("resize", schedule);
    window.removeEventListener("orientationchange", schedule);
    window.visualViewport?.removeEventListener("resize", schedule);
    document.removeEventListener("focusin", schedule);
    document.removeEventListener("focusout", schedule);
  };
};
