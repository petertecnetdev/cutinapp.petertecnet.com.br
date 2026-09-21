const isPriorityImage = (image) => Boolean(
  image.closest(".cut-profile-hero, .cut-landing__hero, .cut-navbar__brand, .cut-auth-shell__logo, .cut-processing")
  || image.getAttribute("fetchpriority") === "high"
);

const tune = (image) => {
  if (!(image instanceof HTMLImageElement)) return;
  if (!image.decoding) image.decoding = "async";
  if (!image.loading && !isPriorityImage(image)) image.loading = "lazy";
  if (!image.getAttribute("fetchpriority") && !isPriorityImage(image)) image.setAttribute("fetchpriority", "low");
};

const collectAddedRoots = (records, roots) => {
  records.forEach((record) => record.addedNodes.forEach((node) => {
    if (!(node instanceof Element)) return;
    if (roots.some((root) => root.contains(node))) return;

    for (let index = roots.length - 1; index >= 0; index -= 1) {
      if (node.contains(roots[index])) roots.splice(index, 1);
    }
    roots.push(node);
  }));
};

const tuneRoots = (roots) => roots.splice(0).forEach((root) => {
  // React may replace/remove a subtree before the idle callback runs. Avoid
  // traversing detached DOM that can no longer affect the rendered page.
  if (!root.isConnected) return;
  if (root.matches("img")) tune(root);
  root.querySelectorAll?.("img").forEach(tune);
});

export const installGlobalImagePerformance = () => {
  if (typeof window === "undefined" || typeof MutationObserver === "undefined") return () => {};
  document.querySelectorAll("img").forEach(tune);

  const pendingRoots = [];
  let scheduled = false;
  let idleId = null;
  let timeoutId = null;

  const flush = () => {
    scheduled = false;
    idleId = null;
    timeoutId = null;
    if (document.hidden) return;
    tuneRoots(pendingRoots);
  };

  const scheduleFlush = () => {
    if (scheduled || document.hidden || pendingRoots.length === 0) return;
    scheduled = true;
    if (typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(flush, { timeout: 120 });
      return;
    }
    timeoutId = window.setTimeout(flush, 32);
  };

  const observer = new MutationObserver((records) => {
    collectAddedRoots(records, pendingRoots);
    scheduleFlush();
  });

  const handleVisibilityChange = () => {
    if (!document.hidden) scheduleFlush();
  };

  document.addEventListener("visibilitychange", handleVisibilityChange, { passive: true });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  return () => {
    observer.disconnect();
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    if (idleId !== null && typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idleId);
    if (timeoutId !== null) window.clearTimeout(timeoutId);
  };
};
