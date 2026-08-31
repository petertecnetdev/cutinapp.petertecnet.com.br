import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";

let scriptPromise;

const loadQrLibrary = () => {
  if (window.QRCode?.toDataURL) return Promise.resolve(window.QRCode);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-cutinapp-qrcode="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(window.QRCode), { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/qrcode@1.5.4/build/qrcode.min.js";
    script.async = true;
    script.dataset.cutinappQrcode = "true";
    script.onload = () => resolve(window.QRCode);
    script.onerror = () => reject(new Error("Não foi possível carregar o gerador de QR Code."));
    document.head.appendChild(script);
  });

  return scriptPromise;
};

export default function QrCodeComponent({ value, size = 260 }) {
  const [dataUrl, setDataUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    if (!value) return undefined;

    loadQrLibrary()
      .then((QRCode) => {
        if (!QRCode?.toDataURL) throw new Error("Gerador de QR Code indisponível.");
        return QRCode.toDataURL(value, {
          width: size,
          margin: 2,
          errorCorrectionLevel: "M",
        });
      })
      .then((url) => active && setDataUrl(url))
      .catch((err) => active && setError(err?.message || "Não foi possível gerar o QR Code."));

    return () => {
      active = false;
    };
  }, [value, size]);

  if (error) {
    return <div className="cut-qr-fallback">{value}</div>;
  }

  if (!dataUrl) {
    return <div className="cut-qr-loading">Gerando QR Code...</div>;
  }

  return <img src={dataUrl} width={size} height={size} alt="QR Code da cortesia" className="cut-qr-image" />;
}

QrCodeComponent.propTypes = {
  value: PropTypes.string.isRequired,
  size: PropTypes.number,
};
