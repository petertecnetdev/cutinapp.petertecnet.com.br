import { normalizeBrazilianWhatsappPhone } from "./whatsappUrl";

// O telefone público pertence à produção, nunca à conta da curadoria ou ao suporte.
const PHONE_FIELDS = [
  "whatsapp_phone", "whatsapp_number", "contact_whatsapp", "whatsapp_url", "whatsappUrl", "whatsapp",
  "phone", "phone_number", "contact_phone", "mobile",
];
const COUNTRY_FIELDS = ["phone_country_code", "whatsapp_country_code", "dialing_code"];

export const normalizeContactWhatsappPhone = (value, countryCode = "") => {
  if (value === null || value === undefined) return "";
  let raw = String(value).trim();
  if (!raw) return "";

  // Aceita somente URLs oficiais do WhatsApp; não segue links externos.
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      if (url.protocol !== "https:" || !["wa.me", "www.wa.me", "api.whatsapp.com", "www.whatsapp.com"].includes(url.hostname.toLowerCase())) return "";
      raw = url.hostname.toLowerCase().endsWith("wa.me")
        ? url.pathname.replace(/^\/+/, "").split("/")[0]
        : url.searchParams.get("phone") || "";
    } catch {
      return "";
    }
  }

  if (!/^[+\d\s().-]+$/.test(raw)) return "";
  const digits = raw.replace(/\D/g, "");
  const prefix = String(countryCode || "").replace(/\D/g, "");
  if (/^\+/.test(raw) || /^00\d/.test(raw)) {
    const international = raw.startsWith("00") ? digits.slice(2) : digits;
    return /^\d{8,15}$/.test(international) ? international : "";
  }
  if (prefix && /^\d{1,4}$/.test(prefix)) {
    const alreadyInternational = prefix === "55"
      ? digits.startsWith(prefix) && [12, 13].includes(digits.length)
      : digits.startsWith(prefix) && digits.length >= prefix.length + 7;
    const local = alreadyInternational ? digits : prefix + digits;
    return /^\d{8,15}$/.test(local) ? local : "";
  }
  return normalizeBrazilianWhatsappPhone(raw);
};

export const resolveProductionWhatsappPhone = (production) => {
  if (!production || typeof production !== "object") return "";
  const countryCode = COUNTRY_FIELDS.map((field) => production[field]).find(Boolean) || "";
  for (const field of PHONE_FIELDS) {
    const phone = normalizeContactWhatsappPhone(production[field], countryCode);
    if (phone) return phone;
  }
  // Compatibilidade com APIs que agrupam o contato público da produção.
  const publicContact = production.public_contact || production.contact;
  if (publicContact && typeof publicContact === "object") {
    const nestedCode = COUNTRY_FIELDS.map((field) => publicContact[field]).find(Boolean) || countryCode;
    for (const field of PHONE_FIELDS) {
      const phone = normalizeContactWhatsappPhone(publicContact[field], nestedCode);
      if (phone) return phone;
    }
  }
  return "";
};

export const buildProductionContactMessage = (name) =>
  `Olá, preciso de mais informações sobre a produção "${String(name || "esta produção").trim()}" na Cutinapp. Você pode me ajudar?`;

export const buildEventContactMessage = (name) =>
  `Olá, gostaria de mais informações sobre o evento "${String(name || "este evento").trim()}" na Cutinapp. Você pode me ajudar?`;

export const buildContactWhatsappHref = (phone, message, { normalizedPhone = false, countryCode = "" } = {}) => {
  const normalized = normalizedPhone && /^\d{8,15}$/.test(String(phone || ""))
    ? String(phone)
    : normalizeContactWhatsappPhone(phone, countryCode);
  return normalized ? `https://wa.me/${normalized}?text=${encodeURIComponent(message)}` : "";
};
