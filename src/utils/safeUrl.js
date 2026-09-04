const browserOrigin = () => (
  typeof window !== "undefined" && window.location?.origin
    ? window.location.origin
    : "https://cutinapp.petertecnet.com.br"
);

export const parseSafeHttpUrl = (value, baseOrigin = browserOrigin()) => {
  const raw = String(value || "").trim();
  if (!raw) return null;

  try {
    const url = new URL(raw, baseOrigin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch (_) {
    return null;
  }
};

export const safeExternalHref = (value, baseOrigin = browserOrigin()) => {
  const url = parseSafeHttpUrl(value, baseOrigin);
  return url ? url.href : "";
};

export const safeNavigationTarget = (value, baseOrigin = browserOrigin()) => {
  const url = parseSafeHttpUrl(value, baseOrigin);
  if (!url) return null;

  if (url.origin === baseOrigin) {
    return {
      type: "internal",
      value: `${url.pathname}${url.search}${url.hash}`,
    };
  }

  return { type: "external", value: url.href };
};
