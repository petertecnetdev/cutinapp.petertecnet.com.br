import React from "react";
import PropTypes from "prop-types";
import { normalizeBrazilianWhatsappPhone } from "../utils/whatsappUrl";
import "./WhatsAppFloatingButton.css";

export default function WhatsAppFloatingButton({ phone, message, label = "Falar no WhatsApp" }) {
  const normalizedPhone = normalizeBrazilianWhatsappPhone(phone);
  if (!normalizedPhone) return null;

  const href = `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message || "Olá! Vim pela Cutinapp e gostaria de mais informações.")}`;

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
};
