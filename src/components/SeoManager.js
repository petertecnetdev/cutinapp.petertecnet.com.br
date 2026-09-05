import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const SITE_URL = "https://cutinapp.petertecnet.com.br";
const DEFAULT_TITLE = "Cutinapp | Eventos, artistas, produções e ingressos";
const DEFAULT_DESCRIPTION =
  "Descubra eventos perto de você, acompanhe artistas e produções, participe da comunidade e gerencie sua experiência pela Cutinapp, uma plataforma Peter Tecnet.";

const PUBLIC_ROUTES = [
  { test: (path) => path === "/", title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION },
  { test: (path) => path === "/event", title: "Eventos | Cutinapp", description: "Encontre eventos e experiências disponíveis na Cutinapp." },
  { test: (path) => path.startsWith("/event/"), title: "Evento | Cutinapp", description: "Confira informações, atrações e ingressos deste evento na Cutinapp." },
  { test: (path) => path === "/productions", title: "Produções | Cutinapp", description: "Descubra produtoras, casas, coletivos e equipes responsáveis pelos eventos publicados na Cutinapp." },
  { test: (path) => path === "/artists", title: "Artistas | Cutinapp", description: "Conheça artistas e atrações presentes nos eventos da Cutinapp." },
  { test: (path) => path.startsWith("/artist/"), title: "Artista | Cutinapp", description: "Conheça este artista e encontre eventos relacionados na Cutinapp." },
  { test: (path) => path.includes("/public") && path.startsWith("/production/"), title: "Produção | Cutinapp", description: "Conheça esta produção e seus eventos na Cutinapp." },
];

const PRIVATE_PREFIXES = [
  "/dashboard", "/feed", "/profile", "/user/", "/production/create", "/production/mine",
  "/production/edit/", "/artist/manage", "/event/create", "/event/manage", "/event/edit/",
  "/ticket/", "/passes", "/checkin", "/login", "/register", "/password", "/email-verify", "/logout",
];

function upsertMeta(selector, attrs) {
  let element = document.head.querySelector(selector);
  if (!element) {
    element = document.createElement("meta");
    document.head.appendChild(element);
  }
  Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, value));
}

function upsertCanonical(href) {
  let element = document.head.querySelector('link[rel="canonical"]');
  if (!element) {
    element = document.createElement("link");
    element.setAttribute("rel", "canonical");
    document.head.appendChild(element);
  }
  element.setAttribute("href", href);
}

export default function SeoManager() {
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname.replace(/\/+$/, "") || "/";
    const publicRoute = PUBLIC_ROUTES.find((route) => route.test(path));
    const isPrivate = PRIVATE_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix));
    const indexable = Boolean(publicRoute) && !isPrivate;
    const title = publicRoute?.title || DEFAULT_TITLE;
    const description = publicRoute?.description || DEFAULT_DESCRIPTION;
    const canonical = `${SITE_URL}${path === "/" ? "/" : path}`;

    document.title = title;
    upsertMeta('meta[name="description"]', { name: "description", content: description });
    upsertMeta('meta[name="robots"]', { name: "robots", content: indexable ? "index, follow, max-image-preview:large" : "noindex, nofollow" });
    upsertMeta('meta[property="og:title"]', { property: "og:title", content: title });
    upsertMeta('meta[property="og:description"]', { property: "og:description", content: description });
    upsertMeta('meta[property="og:url"]', { property: "og:url", content: canonical });
    upsertMeta('meta[property="og:type"]', { property: "og:type", content: path.startsWith("/event/") ? "event" : "website" });
    upsertMeta('meta[name="twitter:card"]', { name: "twitter:card", content: "summary_large_image" });
    upsertMeta('meta[name="twitter:title"]', { name: "twitter:title", content: title });
    upsertMeta('meta[name="twitter:description"]', { name: "twitter:description", content: description });
    upsertCanonical(canonical);
  }, [location.pathname]);

  return null;
}
