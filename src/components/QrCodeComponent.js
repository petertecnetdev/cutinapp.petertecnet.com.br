import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";
import QRCode from "qrcode";

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
      width: size,
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
    return <div className="cut-qr-loading">Gerando QR Code...</div>;
  }

  return (
    <img
      src={dataUrl}
      width={size}
      height={size}
      alt={alt || `QR Code de ${subject}`}
      className="cut-qr-image"
    />
  );
}

QrCodeComponent.propTypes = {
  value: PropTypes.string.isRequired,
  size: PropTypes.number,
  subject: PropTypes.string,
  alt: PropTypes.string,
};
