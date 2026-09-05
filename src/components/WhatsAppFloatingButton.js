import React from "react";
import PropTypes from "prop-types";
import "./WhatsAppFloatingButton.css";

const normalizeBrazilianPhone = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";

  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
};

export default function WhatsAppFloatingButton({ phone, message, label = "Falar no WhatsApp" }) {
  const normalizedPhone = normalizeBrazilianPhone(phone);
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
