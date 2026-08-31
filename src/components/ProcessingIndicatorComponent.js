import React from "react";
import "./ProcessingIndicatorComponent.css";

export default function ProcessingIndicatorComponent({ fullscreen = true, label = "Carregando" }) {
  return (
    <div
      className={`cut-processing ${fullscreen ? "cut-processing--fullscreen" : ""}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="cut-processing__orb" aria-hidden="true">
        <img src="/images/logo.png" alt="" className="cut-processing__logo" />
      </div>
      <span className="cut-processing__label">{label}</span>
    </div>
  );
}
