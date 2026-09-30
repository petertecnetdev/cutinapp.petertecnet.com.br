import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";
import QRCode from "qrcode";

const qrRenderSize = (displaySize) => Math.min(1024, Math.max(512, Math.round(displaySize * 2)));

export default function QrCodeComponent({ value, size = 260, subject = "ingresso", alt }) {
  const [dataUrl, setDataUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    setDataUrl("");
    setError("");

    if (!value) {
      setError(`Código de ${subject} indisponível.`);
      return () => {
        active = false;
      };
    }

    QRCode.toDataURL(String(value), {
      // Render above CSS/display size so dense ticket tokens stay crisp on
      // high-density mobile screens and venue scanners receive clean edges.
      width: qrRenderSize(size),
      margin: 2,
      errorCorrectionLevel: "M",
      color: {
        dark: "#000000",
        light: "#ffffff",
      },
    })
      .then((url) => {
        if (active) setDataUrl(url);
      })
      .catch(() => {
        if (active) setError(`Não foi possível gerar o QR Code de ${subject}.`);
      });

    return () => {
      active = false;
    };
  }, [value, size, subject]);

  if (error) {
    return (
      <div className="cut-qr-error" role="alert">
        {error}
      </div>
    );
  }

  if (!dataUrl) {
    return <div className="cut-qr-loading" role="status" aria-live="polite">Gerando QR Code...</div>;
  }

  return (
    <img
      src={dataUrl}
      width={size}
      height={size}
      alt={alt || `QR Code de ${subject}`}
      className="cut-qr-image"
      draggable="false"
      decoding="sync"
      style={{ maxWidth: "100%", height: "auto" }}
    />
  );
}

QrCodeComponent.propTypes = {
  value: PropTypes.string.isRequired,
  size: PropTypes.number,
  subject: PropTypes.string,
  alt: PropTypes.string,
};
