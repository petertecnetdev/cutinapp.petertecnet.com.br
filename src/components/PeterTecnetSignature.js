import React from "react";
import "./PeterTecnetSignature.css";

const PETER_TECNET_URL = "https://petertecnet.com.br/";
const PETER_TECNET_LOGO = "https://petertecnet.com.br/petertecnetlogo.png";

export default function PeterTecnetSignature() {
  return (
    <footer className="pt-signature" aria-label="Créditos de desenvolvimento">
      <a
        className="pt-signature__link"
        href={PETER_TECNET_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Desenvolvido pela Peter Tecnet — visitar site oficial"
      >
        <span className="pt-signature__copy">
          <span className="pt-signature__eyebrow">Desenvolvido por</span>
          <strong className="pt-signature__name">Peter Tecnet</strong>
        </span>
        <img
          className="pt-signature__logo"
          src={PETER_TECNET_LOGO}
          alt="Peter Tecnet"
          loading="lazy"
          decoding="async"
        />
      </a>
    </footer>
  );
}
