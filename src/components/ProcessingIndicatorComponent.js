import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";
import "./ProcessingIndicatorComponent.css";

const LOADING_MESSAGES = [
  "Descobrindo o que está acontecendo por aí…",
  "Preparando eventos, pessoas e experiências…",
  "Organizando tudo para sua próxima descoberta…",
  "Conectando você aos melhores momentos…",
  "Quase lá — a próxima experiência está chegando.",
];

export default function ProcessingIndicatorComponent({ fullscreen = true, label = "Carregando" }) {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    if (!fullscreen) return undefined;

    const timer = window.setInterval(() => {
      setMessageIndex((current) => (current + 1) % LOADING_MESSAGES.length);
    }, 2600);

    return () => window.clearInterval(timer);
  }, [fullscreen]);

  return (
    <div
      className={`cut-processing ${fullscreen ? "cut-processing--fullscreen" : ""}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
    >
      <div className="cut-processing__panel">
        <div className="cut-processing__scene" aria-hidden="true">
          <span className="cut-processing__spark cut-processing__spark--one" />
          <span className="cut-processing__spark cut-processing__spark--two" />
          <span className="cut-processing__spark cut-processing__spark--three" />

          <div className="cut-processing__orb">
            <span className="cut-processing__orbit cut-processing__orbit--outer" />
            <span className="cut-processing__orbit cut-processing__orbit--inner" />
            <img src="/images/logo.png" alt="" className="cut-processing__logo" data-peter-branding="logo" />
          </div>
        </div>

        <div className="cut-processing__copy">
          <span className="cut-processing__label">{label}</span>
          {fullscreen && (
            <span className="cut-processing__message" key={messageIndex} aria-hidden="true">
              {LOADING_MESSAGES[messageIndex]}
            </span>
          )}
        </div>

        <div className="cut-processing__progress" aria-hidden="true">
          <span className="cut-processing__progress-runner" />
        </div>

        {fullscreen && (
          <div className="cut-processing__beat" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
        )}
      </div>
    </div>
  );
}

ProcessingIndicatorComponent.propTypes = {
  fullscreen: PropTypes.bool,
  label: PropTypes.string,
};
