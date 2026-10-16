import React from "react";
import PropTypes from "prop-types";
import { buildContactWhatsappHref } from "../utils/productionWhatsappContact";

export default function WhatsAppFloatingButton({ phone, message, label = "Falar no WhatsApp", countryCode = "", phoneNormalized = false }) {
  const href = buildContactWhatsappHref(phone, message || "Olá! Vim pela Cutinapp e gostaria de mais informações.", {
    countryCode,
    normalizedPhone: phoneNormalized,
  });
  if (!href) return null;

  return (
    <a
      className="cut-whatsapp-fab"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
    >
      <i className="fa-brands fa-whatsapp" aria-hidden="true" />
      <span>{label}</span>
    </a>
  );
}

WhatsAppFloatingButton.propTypes = {
  phone: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  message: PropTypes.string,
  label: PropTypes.string,
  countryCode: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  phoneNormalized: PropTypes.bool,
};
