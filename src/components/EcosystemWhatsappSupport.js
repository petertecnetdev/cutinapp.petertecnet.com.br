import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { buildCutinappWhatsappHref, getPeterWhatsapp } from "../utils/peterWhatsappFallback";
import { trackTelemetry } from "../utils/telemetry";
import "./EcosystemWhatsappSupport.css";

/**
 * Atendimento institucional: separado do botão WhatsApp de cada produção.
 * O número vem do cadastro central da Peter Tecnet, não de configuração local.
 */
export default function EcosystemWhatsappSupport() {
  const location = useLocation();
  const [destination, setDestination] = useState("");

  useEffect(() => {
    let active = true;
    getPeterWhatsapp().then((phone) => {
      if (active) setDestination(phone || "");
    }).catch(() => {
      if (active) setDestination("");
    });
    return () => { active = false; };
  }, []);

  const href = buildCutinappWhatsappHref(
    destination,
    location.pathname,
    typeof window !== "undefined" ? window.location.origin : ""
  );
  const common = {
    className: "cut-ecosystem-whatsapp",
    title: href ? "Falar com o suporte da Cutinapp pelo WhatsApp" : "Abrir Central de ajuda da Cutinapp",
    "aria-label": href ? "Falar com o suporte da Cutinapp pelo WhatsApp" : "Abrir Central de ajuda da Cutinapp",
    onClick: () => trackTelemetry("support_whatsapp_open", {
      label: href ? "Contato Cutinapp pelo WhatsApp" : "Central de ajuda (WhatsApp indisponível)",
      metadata: { app: "cutinapp", channel: href ? "whatsapp" : "help", path: location.pathname },
    }),
  };
  const contents = (
    <>
      <i className={href ? "fa-brands fa-whatsapp" : "fa-regular fa-life-ring"} aria-hidden="true" />
      <span>{href ? "Suporte Cutinapp" : "Central de ajuda"}</span>
    </>
  );

  return href
    ? <a {...common} href={href} target="_blank" rel="noopener noreferrer">{contents}</a>
    : <Link {...common} to="/help">{contents}</Link>;
}
