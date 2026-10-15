import { safeWhatsappHref } from "./whatsappUrl";

const API = "https://api.petertecnet.com.br";
const PETER_TECNET_CNPJ = "42595409000148";

const fromContact = (contact) => {
  if (!contact) return "";
  if (typeof contact === "string") return safeWhatsappHref(contact);
  return safeWhatsappHref(
    contact.whatsapp_url || contact.whatsappUrl || contact.whatsapp
    || contact.whatsapp_phone || contact.phone || contact.mobile || contact.cellphone
  );
};

const readJson = async (url) => {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) return null;
  return response.json();
};

let whatsappLookup = null;

// A fonte do telefone e a mesma configurada para atendimento do ecossistema.
export const getPeterWhatsapp = () => {
  if (whatsappLookup) return whatsappLookup;
  whatsappLookup = (async () => {
    try {
      const payload = await readJson(`${API}/api/ecosystem/site`);
      const phone = fromContact(payload?.site?.contact || payload?.contact)
        || fromContact(payload?.site?.whatsapp || payload?.whatsapp);
      if (phone) return phone;
    } catch (_) { /* tenta a segunda fonte publica */ }

    try {
      const payload = await readJson(`${API}/api/nexus/public/catalog-by-cnpj/${PETER_TECNET_CNPJ}`);
      return fromContact(payload?.establishment);
    } catch (_) {
      return "";
    }
  })().then((href) => {
    // Falhas transitórias não ficam memorizadas indefinidamente.
    if (!href) whatsappLookup = null;
    return href;
  });
  return whatsappLookup;
};

// Apenas caminhos públicos entram no WhatsApp. Nunca encaminhar querystring,
// hash, URLs de checkout, tokens, IDs de pedidos ou dados pessoais.
const publicSourcePath = (pathname) => {
  const path = String(pathname || "").split(/[?#]/)[0];
  return [
    /^\/$/,
    /^\/event$/,
    /^\/event\/[a-zA-Z0-9._-]+$/,
    /^\/production\/[a-zA-Z0-9._-]+\/public$/,
    /^\/artist\/[a-zA-Z0-9._-]+$/,
    /^\/productions$/,
    /^\/artists$/,
    /^\/eventos(?:\/[a-zA-Z0-9._-]+)*$/,
    /^\/blog(?:\/[a-zA-Z0-9._-]+)?$/,
  ].some((pattern) => pattern.test(path)) ? path : "";
};

export const buildCutinappSupportMessage = (pathname = "", origin = "") => {
  const path = publicSourcePath(pathname);
  const trustedOrigin = /^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(String(origin))
    ? origin : "";
  const source = path && trustedOrigin ? `\nPágina pública: ${trustedOrigin}${path}` : "";
  return `Olá, equipe Peter Tecnet! Estou entrando em contato pelo aplicativo Cutinapp.\nGostaria de receber atendimento e tirar uma dúvida.${source}\nVocês podem me ajudar?`;
};

export const buildCutinappWhatsappHref = (destination, pathname = "", origin = "") => {
  const base = safeWhatsappHref(destination);
  if (!base) return "";
  return `${base}?text=${encodeURIComponent(buildCutinappSupportMessage(pathname, origin))}`;
};
