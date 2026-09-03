const INSTALL_FLAG = "__peterTecnetGlobalImageFallbacksInstalled__";
const FALLBACK_PREFIX = "data:image/svg+xml;charset=UTF-8,";

const GENERIC_LABELS = new Set([
  "imagem", "image", "foto", "photo", "avatar", "logo", "icone", "ícone",
  "item", "produto", "product", "servico", "serviço", "service",
  "estabelecimento", "empresa", "company",
]);

function normalizeFallbackLabel(value) {
  const raw = String(value || "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  const cleaned = raw
    .replace(/^(?:imagem|image|foto|photo|avatar|logo|icone|ícone)(?:\s+(?:de|do|da|dos|das))?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || GENERIC_LABELS.has(cleaned.toLocaleLowerCase("pt-BR"))) return "";
  return cleaned.slice(0, 80);
}

export function getImageFallbackInitials(value) {
  const label = normalizeFallbackLabel(value);
  if (!label) return "?";
  const ascii = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s'-]/g, " ").replace(/\s+/g, " ").trim();
  if (!ascii) return "?";
  const words = ascii.split(" ").filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0].charAt(0)}${words[words.length - 1].charAt(0)}`.toUpperCase();
}

function escapeXml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export function buildInitialsImageDataUri(value) {
  const initials = escapeXml(getImageFallbackInitials(value));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-label="${initials}"><defs><linearGradient id="ptg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#172033"/><stop offset="100%" stop-color="#080c14"/></linearGradient></defs><rect width="256" height="256" rx="28" fill="url(#ptg)"/><circle cx="206" cy="48" r="54" fill="rgba(255,255,255,.055)"/><circle cx="42" cy="220" r="72" fill="rgba(255,255,255,.035)"/><text x="128" y="138" text-anchor="middle" dominant-baseline="middle" font-family="Inter,Arial,sans-serif" font-size="82" font-weight="750" letter-spacing="2" fill="#f8fafc">${initials}</text></svg>`;
  return `${FALLBACK_PREFIX}${encodeURIComponent(svg)}`;
}

function isFallbackDataUri(value) { return String(value || "").startsWith(FALLBACK_PREFIX); }

function getCandidateLabel(element) {
  if (!element) return "";
  const candidates = [
    element.dataset && element.dataset.fallbackText,
    element.dataset && element.dataset.name,
    element.dataset && element.dataset.title,
    element.getAttribute && element.getAttribute("alt"),
    element.getAttribute && element.getAttribute("aria-label"),
    element.getAttribute && element.getAttribute("title"),
  ];
  for (const candidate of candidates) {
    const normalized = normalizeFallbackLabel(candidate);
    if (normalized) return normalized;
  }
  return "";
}

function findContextLabel(image) {
  const ownLabel = getCandidateLabel(image);
  if (ownLabel) return ownLabel;
  if (!image || typeof image.closest !== "function") return "";
  const container = image.closest("[data-image-fallback-text], [data-name], [data-title], article, li, .card, [class*='card'], [class*='item'], [class*='product'], [class*='service'], [class*='establishment'], [class*='company'], [class*='profile']");
  if (!container) return "";
  const containerLabel = getCandidateLabel(container);
  if (containerLabel) return containerLabel;
  const textNode = container.querySelector("[data-image-fallback-text], [data-name], [data-title], h1, h2, h3, h4, h5, h6, [class*='title'], [class*='name']");
  if (!textNode) return "";
  return getCandidateLabel(textNode) || normalizeFallbackLabel(textNode.textContent || "");
}

function isImageElement(value) { return Boolean(value && String(value.tagName || "").toUpperCase() === "IMG"); }

function applyInitialsFallback(image, failedSrc) {
  if (!isImageElement(image) || (image.dataset && image.dataset.imageFallback === "off")) return;
  const currentSrc = image.currentSrc || image.src || image.getAttribute("src") || "";
  if (image.dataset && image.dataset.imageFallbackApplied === "true" && isFallbackDataUri(currentSrc)) return;
  const label = findContextLabel(image);
  if (image.dataset && !image.dataset.imageFallbackOriginalSrc && failedSrc && !isFallbackDataUri(failedSrc)) image.dataset.imageFallbackOriginalSrc = failedSrc;
  image.removeAttribute("srcset");
  image.removeAttribute("sizes");
  if (image.dataset) image.dataset.imageFallbackApplied = "true";
  if (image.classList) image.classList.add("pt-image-fallback");
  image.src = buildInitialsImageDataUri(label);
}

function inspectImage(image) {
  if (!isImageElement(image) || (image.dataset && image.dataset.imageFallback === "off")) return;
  const rawSrc = image.getAttribute("src");
  const currentSrc = image.currentSrc || image.src || rawSrc || "";
  if (isFallbackDataUri(currentSrc)) return;
  if (!rawSrc || !rawSrc.trim()) return applyInitialsFallback(image, "");
  if (image.complete && Number(image.naturalWidth || 0) === 0) applyInitialsFallback(image, currentSrc);
}

function inspectNode(node) {
  if (!node || node.nodeType !== 1) return;
  if (isImageElement(node)) inspectImage(node);
  if (typeof node.querySelectorAll === "function") node.querySelectorAll("img").forEach(inspectImage);
}

export function installGlobalImageFallbacks() {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  const existing = window[INSTALL_FLAG];
  if (existing && typeof existing.cleanup === "function") return existing.cleanup;
  const handleError = (event) => {
    const image = event.target;
    if (!isImageElement(image) || (image.dataset && image.dataset.imageFallback === "off")) return;
    const failedSrc = image.currentSrc || image.src || image.getAttribute("src") || "";
    if (isFallbackDataUri(failedSrc)) return;
    window.setTimeout(() => {
      const currentSrc = image.currentSrc || image.src || image.getAttribute("src") || "";
      if (failedSrc && currentSrc && currentSrc !== failedSrc && !isFallbackDataUri(currentSrc)) return;
      if (image.complete && Number(image.naturalWidth || 0) > 0) return;
      applyInitialsFallback(image, failedSrc);
    }, 0);
  };
  document.addEventListener("error", handleError, true);
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === "attributes") return inspectImage(mutation.target);
      mutation.addedNodes.forEach(inspectNode);
    });
  });
  document.querySelectorAll("img").forEach(inspectImage);
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["src", "srcset"] });
  const cleanup = () => {
    document.removeEventListener("error", handleError, true);
    observer.disconnect();
    delete window[INSTALL_FLAG];
  };
  window[INSTALL_FLAG] = { cleanup };
  return cleanup;
}
