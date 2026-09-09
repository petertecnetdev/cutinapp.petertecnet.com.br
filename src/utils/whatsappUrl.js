const BRAZIL_COUNTRY_CODE = "55";
const RAW_PHONE_PATTERN = /^[+\d\s().-]+$/;

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

  const explicit = text.match(/(?:wa\.me\/|[?&]phone=)(\d{10,15})/i)?.[1];
  if (!explicit && !RAW_PHONE_PATTERN.test(text)) return "";

  const normalized = normalizeBrazilianWhatsappPhone(explicit || text);
  return normalized ? `https://wa.me/${normalized}` : "";
};
