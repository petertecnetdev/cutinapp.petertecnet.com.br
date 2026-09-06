export const buildEventSaleUrl = (event, origin = "") => {
  const slug = String(event?.slug || "").trim();
  const id = Number(event?.id || 0);
  const path = slug ? `/event/${encodeURIComponent(slug)}` : id > 0 ? `/event/${id}` : "";
  if (!path) return "";

  const normalizedOrigin = String(origin || "").trim().replace(/\/$/, "");
  return normalizedOrigin ? `${normalizedOrigin}${path}` : path;
};

export const buildEventSaleShareText = (event) => {
  const title = String(event?.title || "este evento").trim();
  return `Ingressos para ${title} já estão disponíveis na Cutinapp.`;
};

export const buildWhatsAppShareUrl = (eventUrl, event) => {
  const url = String(eventUrl || "").trim();
  if (!url) return "";
  const message = `${buildEventSaleShareText(event)} ${url}`;
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
};
