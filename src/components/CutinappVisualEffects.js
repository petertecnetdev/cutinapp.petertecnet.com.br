import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const REVEAL_SELECTOR = [
  ".cut-page-heading",
  ".cut-section-heading",
  ".cut-home__copy",
  ".cut-home__visual",
  ".cut-home__eventCard",
  ".cut-home__featureGrid article",
  ".cut-dashboard__hero",
  ".cut-dashboard__stats article",
  ".cut-dashboard__card",
  ".cut-panel",
  ".cut-event-card",
  ".cut-production-card",
  ".cut-pass-card",
  ".cut-artist-card",
  ".cut-feed-card",
  ".card"
].join(",");

const SURFACE_SELECTOR = [
  ".cut-panel",
  ".cut-home__visualCard",
  ".cut-home__eventCard",
  ".cut-home__featureGrid article",
  ".cut-dashboard__hero",
  ".cut-dashboard__stats article",
  ".cut-dashboard__card",
  ".cut-event-card",
  ".cut-production-card",
  ".cut-pass-card",
  ".cut-artist-card",
  ".cut-feed-card"
].join(",");

const MAGNET_SELECTOR = [
  ".btn-primary",
  ".cut-primary-action",
  ".cut-dashboard__primary",
  ".cut-home__primary",
  ".cut-home__cta"
].join(",");

export default function CutinappVisualEffects() {
  const location = useLocation();

  useEffect(() => {
    const root = document.documentElement;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches;

    root.classList.add("cut-fx-enabled");

    let pointerFrame = null;
    const setPointer = (event) => {
      if (pointerFrame) return;
      pointerFrame = window.requestAnimationFrame(() => {
        root.style.setProperty("--cut-pointer-x", `${event.clientX}px`);
        root.style.setProperty("--cut-pointer-y", `${event.clientY}px`);
        root.style.setProperty("--cut-pointer-xp", `${(event.clientX / Math.max(window.innerWidth, 1)) * 100}%`);
        root.style.setProperty("--cut-pointer-yp", `${(event.clientY / Math.max(window.innerHeight, 1)) * 100}%`);
        pointerFrame = null;
      });
    };

    if (!coarsePointer) {
      window.addEventListener("pointermove", setPointer, { passive: true });
    }

    let scrollFrame = null;
    const setScrollProgress = () => {
      if (scrollFrame) return;
      scrollFrame = window.requestAnimationFrame(() => {
        const max = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
        const progress = Math.min(1, Math.max(0, window.scrollY / max));
        root.style.setProperty("--cut-scroll-progress", String(progress));
        root.style.setProperty("--cut-scroll-y", `${window.scrollY}px`);
        scrollFrame = null;
      });
    };
    setScrollProgress();
    window.addEventListener("scroll", setScrollProgress, { passive: true });
    window.addEventListener("resize", setScrollProgress, { passive: true });

    const revealNodes = Array.from(document.querySelectorAll(REVEAL_SELECTOR));
    revealNodes.forEach((node, index) => {
      node.classList.add("cut-fx-reveal");
      node.style.setProperty("--cut-reveal-delay", `${Math.min(index % 8, 7) * 45}ms`);
    });

    let observer = null;
    if (reduceMotion || !("IntersectionObserver" in window)) {
      revealNodes.forEach((node) => node.classList.add("cut-fx-visible"));
    } else {
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("cut-fx-visible");
              observer?.unobserve(entry.target);
            }
          });
        },
        { rootMargin: "0px 0px -7%", threshold: 0.08 }
      );
      revealNodes.forEach((node) => observer.observe(node));
    }

    const surfaceNodes = coarsePointer ? [] : Array.from(document.querySelectorAll(SURFACE_SELECTOR));
    const surfaceCleanups = surfaceNodes.map((node) => {
      node.classList.add("cut-fx-surface");

      const onMove = (event) => {
        if (reduceMotion) return;
        const rect = node.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const nx = x / Math.max(rect.width, 1) - 0.5;
        const ny = y / Math.max(rect.height, 1) - 0.5;
        node.style.setProperty("--cut-surface-x", `${x}px`);
        node.style.setProperty("--cut-surface-y", `${y}px`);
        node.style.setProperty("--cut-tilt-x", `${(-ny * 2.6).toFixed(2)}deg`);
        node.style.setProperty("--cut-tilt-y", `${(nx * 3.2).toFixed(2)}deg`);
      };

      const onEnter = () => node.classList.add("cut-fx-surface-active");
      const onLeave = () => {
        node.classList.remove("cut-fx-surface-active");
        node.style.setProperty("--cut-tilt-x", "0deg");
        node.style.setProperty("--cut-tilt-y", "0deg");
      };

      node.addEventListener("pointermove", onMove, { passive: true });
      node.addEventListener("pointerenter", onEnter, { passive: true });
      node.addEventListener("pointerleave", onLeave, { passive: true });

      return () => {
        node.removeEventListener("pointermove", onMove);
        node.removeEventListener("pointerenter", onEnter);
        node.removeEventListener("pointerleave", onLeave);
        node.classList.remove("cut-fx-surface", "cut-fx-surface-active");
        node.style.removeProperty("--cut-surface-x");
        node.style.removeProperty("--cut-surface-y");
        node.style.removeProperty("--cut-tilt-x");
        node.style.removeProperty("--cut-tilt-y");
      };
    });

    const magnetNodes = coarsePointer ? [] : Array.from(document.querySelectorAll(MAGNET_SELECTOR));
    const magnetCleanups = magnetNodes.map((node) => {
      node.classList.add("cut-fx-magnetic");

      const onMove = (event) => {
        if (reduceMotion) return;
        const rect = node.getBoundingClientRect();
        const x = event.clientX - (rect.left + rect.width / 2);
        const y = event.clientY - (rect.top + rect.height / 2);
        node.style.setProperty("--cut-magnet-x", `${(x * 0.065).toFixed(2)}px`);
        node.style.setProperty("--cut-magnet-y", `${(y * 0.08).toFixed(2)}px`);
      };
      const onLeave = () => {
        node.style.setProperty("--cut-magnet-x", "0px");
        node.style.setProperty("--cut-magnet-y", "0px");
      };

      node.addEventListener("pointermove", onMove, { passive: true });
      node.addEventListener("pointerleave", onLeave, { passive: true });
      return () => {
        node.removeEventListener("pointermove", onMove);
        node.removeEventListener("pointerleave", onLeave);
        node.classList.remove("cut-fx-magnetic");
        node.style.removeProperty("--cut-magnet-x");
        node.style.removeProperty("--cut-magnet-y");
      };
    });

    return () => {
      observer?.disconnect();
      surfaceCleanups.forEach((cleanup) => cleanup());
      magnetCleanups.forEach((cleanup) => cleanup());
      revealNodes.forEach((node) => {
        node.classList.remove("cut-fx-reveal", "cut-fx-visible");
        node.style.removeProperty("--cut-reveal-delay");
      });
      window.removeEventListener("pointermove", setPointer);
      window.removeEventListener("scroll", setScrollProgress);
      window.removeEventListener("resize", setScrollProgress);
      if (pointerFrame) window.cancelAnimationFrame(pointerFrame);
      if (scrollFrame) window.cancelAnimationFrame(scrollFrame);
    };
  }, [location.pathname]);

  return (
    <div className="cut-fx-stage" aria-hidden="true">
      <div className="cut-fx-aurora cut-fx-aurora--one" />
      <div className="cut-fx-aurora cut-fx-aurora--two" />
      <div className="cut-fx-aurora cut-fx-aurora--three" />
      <div className="cut-fx-grid" />
      <div className="cut-fx-pointer-light" />
      <div className="cut-fx-vignette" />
      <div className="cut-fx-progress" />
    </div>
  );
}
