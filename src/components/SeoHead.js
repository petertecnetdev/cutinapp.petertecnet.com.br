import PropTypes from "prop-types";
import { useEffect } from "react";

const SITE_URL = "https://cutinapp.petertecnet.com.br";
const DEFAULT_IMAGE = `${SITE_URL}/images/logo.png`;

const absoluteUrl = (value, fallback = SITE_URL) => {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${SITE_URL}${raw.startsWith("/") ? raw : `/${raw}`}`;
};

const upsertMeta = (selector, attrs) => {
  let element = document.head.querySelector(selector);
  if (!element) {
    element = document.createElement("meta");
    document.head.appendChild(element);
  }
  Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, String(value)));
};

const upsertCanonical = (href) => {
  let element = document.head.querySelector('link[rel="canonical"]');
  if (!element) {
    element = document.createElement("link");
    element.setAttribute("rel", "canonical");
    document.head.appendChild(element);
  }
  element.setAttribute("href", href);
};

const normalizeJsonLd = (value) => {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).filter(Boolean);
};

export default function SeoHead({
  title,
  description,
  canonical,
  image,
  type = "website",
  robots = "index, follow, max-image-preview:large",
  jsonLd,
  scriptId = "route",
}) {
  useEffect(() => {
    const resolvedCanonical = absoluteUrl(canonical || "/", `${SITE_URL}/`);
    const resolvedImage = absoluteUrl(image || DEFAULT_IMAGE, DEFAULT_IMAGE);
    const resolvedTitle = String(title || "Cutinapp | Eventos e ingressos").trim();
    const resolvedDescription = String(description || "Descubra eventos, ingressos, artistas e produções na Cutinapp.").trim();

    document.title = resolvedTitle;
    upsertMeta('meta[name="description"]', { name: "description", content: resolvedDescription });
    upsertMeta('meta[name="robots"]', { name: "robots", content: robots });
    upsertMeta('meta[property="og:title"]', { property: "og:title", content: resolvedTitle });
    upsertMeta('meta[property="og:description"]', { property: "og:description", content: resolvedDescription });
    upsertMeta('meta[property="og:url"]', { property: "og:url", content: resolvedCanonical });
    upsertMeta('meta[property="og:type"]', { property: "og:type", content: type });
    upsertMeta('meta[property="og:site_name"]', { property: "og:site_name", content: "Cutinapp" });
    upsertMeta('meta[property="og:locale"]', { property: "og:locale", content: "pt_BR" });
    upsertMeta('meta[property="og:image"]', { property: "og:image", content: resolvedImage });
    upsertMeta('meta[property="og:image:alt"]', { property: "og:image:alt", content: resolvedTitle });
    upsertMeta('meta[name="twitter:card"]', { name: "twitter:card", content: "summary_large_image" });
    upsertMeta('meta[name="twitter:title"]', { name: "twitter:title", content: resolvedTitle });
    upsertMeta('meta[name="twitter:description"]', { name: "twitter:description", content: resolvedDescription });
    upsertMeta('meta[name="twitter:image"]', { name: "twitter:image", content: resolvedImage });
    upsertCanonical(resolvedCanonical);

    const selector = `script[data-cutinapp-seo="${scriptId}"]`;
    document.head.querySelector(selector)?.remove();
    const schemas = normalizeJsonLd(jsonLd);
    let script = null;
    if (schemas.length > 0) {
      script = document.createElement("script");
      script.type = "application/ld+json";
      script.dataset.cutinappSeo = scriptId;
      script.textContent = JSON.stringify(schemas.length === 1 ? schemas[0] : schemas);
      document.head.appendChild(script);
    }

    return () => {
      script?.remove();
    };
  }, [title, description, canonical, image, type, robots, jsonLd, scriptId]);

  return null;
}

SeoHead.propTypes = {
  title: PropTypes.string,
  description: PropTypes.string,
  canonical: PropTypes.string,
  image: PropTypes.string,
  type: PropTypes.string,
  robots: PropTypes.string,
  jsonLd: PropTypes.oneOfType([
    PropTypes.object,
    PropTypes.arrayOf(PropTypes.object),
  ]),
  scriptId: PropTypes.string,
};

export { SITE_URL };
