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

const tuneAddedImages = (records) => {
  const roots = [];

  records.forEach((record) => record.addedNodes.forEach((node) => {
    if (!(node instanceof Element)) return;
    if (roots.some((root) => root.contains(node))) return;

    // React can report both a newly inserted subtree and descendants from the
    // same commit. Keep only the highest root so each subtree is scanned once.
    for (let index = roots.length - 1; index >= 0; index -= 1) {
      if (node.contains(roots[index])) roots.splice(index, 1);
    }
    roots.push(node);
  }));

  roots.forEach((root) => {
    if (root.matches("img")) tune(root);
    root.querySelectorAll?.("img").forEach(tune);
  });
};

export const installGlobalImagePerformance = () => {
  if (typeof window === "undefined" || typeof MutationObserver === "undefined") return () => {};
  document.querySelectorAll("img").forEach(tune);
  const observer = new MutationObserver(tuneAddedImages);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  return () => observer.disconnect();
};
