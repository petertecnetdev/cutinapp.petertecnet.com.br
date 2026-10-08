import { useEffect, useRef } from "react";

// Shared lifecycle for public and authenticated mobile drawers.
// Reference counting avoids unlocking the page while another drawer remains open.
const openDrawers = new Set();
let previousBodyStyles = null;

const focusableSelector = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(", ");

export default function useMobileDrawer({ open, onClose, drawerId, bodyClass }) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const openerRef = useRef(null);

  useEffect(() => {
    if (!open || typeof document === "undefined" || typeof window === "undefined") return undefined;

    const body = document.body;
    openerRef.current = document.activeElement;
    if (openDrawers.size === 0) {
      previousBodyStyles = {
        overflow: body.style.overflow,
        overscrollBehavior: body.style.overscrollBehavior
      };
    }
    openDrawers.add(drawerId);
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    body.classList.add(bodyClass);

    const getDrawer = () => document.getElementById(drawerId);
    const focusDrawer = () => {
      const first = getDrawer()?.querySelector(focusableSelector);
      if (first) first.focus({ preventScroll: true });
    };
    const scheduleFrame = window.requestAnimationFrame || ((fn) => window.setTimeout(fn, 0));
    const focusTimer = scheduleFrame(focusDrawer);
    const cancelFocus = () => window.cancelAnimationFrame
      ? window.cancelAnimationFrame(focusTimer) : window.clearTimeout(focusTimer);

    const onKeyDown = (event) => {
      const drawer = getDrawer();
      if (!drawer) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(drawer.querySelectorAll(focusableSelector))
        .filter((node) => node.getClientRects().length > 0);
      if (!controls.length) {
        event.preventDefault();
        return;
      }
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || !drawer.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !drawer.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    const onResize = () => {
      if (window.innerWidth >= 992) closeRef.current();
    };
    const onOtherDrawerOpen = (event) => {
      if (event.detail !== drawerId) closeRef.current();
    };
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("resize", onResize);
    window.addEventListener("cutinapp:mobile-drawer-open", onOtherDrawerOpen);
    window.dispatchEvent(new CustomEvent("cutinapp:mobile-drawer-open", { detail: drawerId }));

    return () => {
      cancelFocus();
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("cutinapp:mobile-drawer-open", onOtherDrawerOpen);
      body.classList.remove(bodyClass);
      openDrawers.delete(drawerId);
      if (openDrawers.size === 0 && previousBodyStyles) {
        if (!document.querySelector(".modal.show, .offcanvas.show, .offcanvas.showing")) {
          body.style.overflow = previousBodyStyles.overflow;
          body.style.overscrollBehavior = previousBodyStyles.overscrollBehavior;
        }
        previousBodyStyles = null;
      }
      if (openerRef.current?.isConnected) {
        try { openerRef.current.focus({ preventScroll: true }); } catch (_) { /* opener unmounted */ }
      }
    };
  }, [open, drawerId, bodyClass]);
}
