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

export const installGlobalImagePerformance = () => {
  if (typeof window === "undefined" || typeof MutationObserver === "undefined") return () => {};
  document.querySelectorAll("img").forEach(tune);
  const observer = new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => {
    if (!(node instanceof Element)) return;
    if (node.matches("img")) tune(node);
    node.querySelectorAll?.("img").forEach(tune);
  })));
  observer.observe(document.documentElement, { childList: true, subtree: true });
  return () => observer.disconnect();
};
