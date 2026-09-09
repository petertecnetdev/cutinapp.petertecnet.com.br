import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import eventService from "../services/EventService";
import { buildEventSeo } from "../utils/eventSeo";
import SeoHead, { SITE_URL } from "./SeoHead";

const DEFAULT_TITLE = "Cutinapp | Eventos, ingressos, artistas e produções";
const DEFAULT_DESCRIPTION =
  "Descubra eventos, compre ou retire ingressos, acompanhe artistas e produções e viva experiências pela Cutinapp, plataforma de eventos da Peter Tecnet.";

const humanizeSlug = (value = "") => String(value)
  .split("/")
  .filter(Boolean)
  .pop()
  ?.split("-")
  .filter(Boolean)
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join(" ") || "";

const publicEventFallbackSeo = (path) => {
  const eventName = humanizeSlug(path);
  return {
    title: eventName ? `${eventName} | Evento e ingressos na Cutinapp` : "Evento | Cutinapp",
    description: eventName
      ? `Confira data, local, atrações e ingressos para ${eventName} na Cutinapp.`
      : "Confira informações, atrações e ingressos deste evento na Cutinapp.",
  };
};

const publicArtistSeo = (path) => {
  const artistName = humanizeSlug(path);
  return {
    title: artistName ? `${artistName} | Artista na Cutinapp` : "Artista | Cutinapp",
    description: artistName
      ? `Conheça ${artistName} e encontre eventos relacionados na Cutinapp.`
      : "Conheça este artista e encontre eventos relacionados na Cutinapp.",
  };
};

const publicProductionSeo = (path) => {
  const productionName = humanizeSlug(path.replace(/\/public$/, ""));
  return {
    title: productionName ? `${productionName} | Produção de eventos na Cutinapp` : "Produção | Cutinapp",
    description: productionName
      ? `Conheça ${productionName}, seus eventos e experiências publicados na Cutinapp.`
      : "Conheça esta produção e seus eventos na Cutinapp.",
  };
};

const discoverySeo = (path) => {
  const parts = path.split("/").filter(Boolean);
  const city = parts[1] ? humanizeSlug(parts[1]) : "";
  const period = parts[2] || "";
  const periodLabel = {
    hoje: "hoje",
    amanha: "amanhã",
    "fim-de-semana": "neste fim de semana",
    sexta: "na sexta-feira",
    sabado: "no sábado",
    domingo: "no domingo",
    "proximos-7-dias": "nos próximos 7 dias",
    "proximos-30-dias": "nos próximos 30 dias",
  }[period];

  if (city && periodLabel) {
    return {
      title: `Eventos ${periodLabel} em ${city} | Cutinapp`,
      description: `Veja eventos ${periodLabel} em ${city}, confira programação, locais e ingressos disponíveis na Cutinapp.`,
    };
  }
  if (city) {
    return {
      title: `Eventos em ${city} | Festas, shows e ingressos | Cutinapp`,
      description: `Descubra eventos, festas, shows e experiências em ${city} e encontre ingressos na Cutinapp.`,
    };
  }
  return {
    title: "Eventos hoje e próximos eventos | Cutinapp",
    description: "Encontre eventos de hoje, amanhã e do fim de semana, com programação, locais e ingressos na Cutinapp.",
  };
};

const PUBLIC_ROUTES = [
  { test: (path) => path === "/", resolve: () => ({ title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION }) },
  { test: (path) => path === "/event", resolve: () => ({ title: "Eventos | Cutinapp", description: "Encontre eventos e experiências disponíveis na Cutinapp." }) },
  { test: (path) => path.startsWith("/eventos"), resolve: discoverySeo },
  { test: (path) => /^\/event\/[A-Za-z0-9-]+$/.test(path), resolve: publicEventFallbackSeo },
  { test: (path) => path === "/productions", resolve: () => ({ title: "Produções | Cutinapp", description: "Descubra produtoras, casas, coletivos e equipes responsáveis pelos eventos publicados na Cutinapp." }) },
  { test: (path) => path === "/artists", resolve: () => ({ title: "Artistas | Cutinapp", description: "Conheça artistas e atrações presentes nos eventos da Cutinapp." }) },
  { test: (path) => /^\/artist\/[A-Za-z0-9-]+$/.test(path), resolve: publicArtistSeo },
  { test: (path) => /^\/production\/[A-Za-z0-9-]+\/public$/.test(path), resolve: publicProductionSeo },
  { test: (path) => path === "/blog", resolve: () => ({ title: "Blog Cutinapp | Eventos, cultura e experiências", description: "Conteúdos da Cutinapp sobre eventos, artistas, produções, ingressos e experiências." }) },
  { test: (path) => /^\/blog\/[A-Za-z0-9-]+$/.test(path), resolve: () => ({ title: "Conteúdo Cutinapp", description: "Leia este conteúdo no blog da Cutinapp." }) },
  { test: (path) => /^\/agenda\/[A-Za-z0-9-]+$/.test(path), resolve: (path) => ({ title: `${humanizeSlug(path)} | Agenda na Cutinapp`, description: "Confira a agenda pública desta produção na Cutinapp." }) },
];

const PRIVATE_PREFIXES = [
  "/dashboard", "/feed", "/messages", "/notifications", "/moderation/", "/profile", "/user/",
  "/purchases", "/checkout/", "/admin", "/agent", "/producer/", "/production/create", "/production/mine",
  "/production/edit/", "/production/", "/artist/manage", "/event/create", "/event/manage", "/event/edit/",
  "/event/", "/ticket/", "/passes", "/checkin", "/login", "/register", "/password", "/email-verify", "/logout",
];

const isPrivatePath = (path) => {
  if (/^\/event\/[A-Za-z0-9-]+$/.test(path)) return false;
  if (/^\/production\/[A-Za-z0-9-]+\/public$/.test(path)) return false;
  if (/^\/profile\/[0-9]+$/.test(path)) return true;
  return PRIVATE_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix));
};

const eventSlugFromPath = (path) => {
  const match = path.match(/^\/event\/([A-Za-z0-9-]+)$/);
  return match?.[1] || "";
};

export default function SeoManager() {
  const location = useLocation();
  const path = location.pathname.replace(/\/+$/, "") || "/";
  const [eventSeo, setEventSeo] = useState(null);

  const baseSeo = useMemo(() => {
    const publicRoute = PUBLIC_ROUTES.find((route) => route.test(path));
    const indexable = Boolean(publicRoute) && !isPrivatePath(path);
    const resolved = publicRoute?.resolve?.(path) || {};
    return {
      title: resolved.title || DEFAULT_TITLE,
      description: resolved.description || DEFAULT_DESCRIPTION,
      canonical: `${SITE_URL}${path === "/" ? "/" : path}`,
      image: `${SITE_URL}/images/logo.png`,
      type: "website",
      robots: indexable ? "index, follow, max-image-preview:large" : "noindex, nofollow",
    };
  }, [path]);

  useEffect(() => {
    const slug = eventSlugFromPath(path);
    setEventSeo(null);
    if (!slug) return undefined;

    let active = true;
    eventService.view(slug)
      .then((response) => {
        if (!active || !response?.event) return;
        const resolved = buildEventSeo(response.event, {
          tickets: response.tickets || [],
          artists: response.event.artists || [],
        });
        if (resolved) setEventSeo({ ...resolved, robots: "index, follow, max-image-preview:large" });
      })
      .catch(() => {
        // O fallback baseado na rota permanece válido se a API estiver temporariamente indisponível.
      });

    return () => { active = false; };
  }, [path]);

  return <SeoHead {...(eventSeo || baseSeo)} scriptId="route" />;
}
