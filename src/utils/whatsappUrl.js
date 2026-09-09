const BRAZIL_COUNTRY_CODE = "55";
const RAW_PHONE_PATTERN = /^[+\d\s().-]+$/;
const WHATSAPP_HOSTS = new Set(["wa.me", "www.wa.me", "api.whatsapp.com", "www.whatsapp.com"]);

export const normalizeBrazilianWhatsappPhone = (value) => {
  const digits = String(value || "").replace(/\D/g, "").replace(/^0+/, "");
  if (!digits) return "";

  if (digits.startsWith(BRAZIL_COUNTRY_CODE)) {
    return digits.length === 12 || digits.length === 13 ? digits : "";
  }

  return digits.length === 10 || digits.length === 11
    ? `${BRAZIL_COUNTRY_CODE}${digits}`
    : "";
};

export const safeWhatsappHref = (value) => {
  const text = String(value || "").trim();
  if (!text) return "";

  let candidate = text;
  if (!RAW_PHONE_PATTERN.test(text)) {
    try {
      const url = new URL(text);
      if (url.protocol !== "https:" || !WHATSAPP_HOSTS.has(url.hostname.toLowerCase())) return "";
      candidate = url.hostname.toLowerCase().endsWith("wa.me")
        ? url.pathname.replace(/^\/+/, "").split("/")[0]
        : url.searchParams.get("phone") || "";
    } catch {
      return "";
    }
  }

  const normalized = normalizeBrazilianWhatsappPhone(candidate);
  return normalized ? `https://wa.me/${normalized}` : "";
};
