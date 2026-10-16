const PUBLIC_CONTACT_URL = "https://api.petertecnet.com.br/api/ecosystem/site";
export const DEFAULT_SUPPORT_EMAIL = "contato@petertecnet.com.br";

export const validateSupportEmail = (raw) => {
  if (typeof raw !== "string") return "";
  const email = raw.trim();
  // Impede mailto com parametros injetados (headers, querystring, CRLF).
  return email.length <= 254 && /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(email) ? email : "";
};

export const getPeterSupportEmail = async () => {
  try {
    const response = await fetch(PUBLIC_CONTACT_URL, { headers: { Accept: "application/json" } });
    if (response.ok) {
      const payload = await response.json();
      const email = validateSupportEmail(payload?.site?.contact?.email || payload?.contact?.email);
      if (email) return email;
    }
  } catch (_) { /* fallback é contato público publicado pela Peter Tecnet */ }
  return DEFAULT_SUPPORT_EMAIL;
};

export const buildSupportMailto = (email) =>
  `mailto:${validateSupportEmail(email) || DEFAULT_SUPPORT_EMAIL}?subject=${encodeURIComponent("Suporte Cutinapp — preciso de ajuda")}`;
