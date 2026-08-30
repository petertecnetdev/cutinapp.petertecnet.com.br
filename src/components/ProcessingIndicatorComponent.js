import React, { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import "./ProcessingIndicatorComponent.css";

const BRAND_LOGO = "/images/logo.png?v=20260830-1631";

export default function ProcessingIndicatorComponent({
  messages = ["Carregando..."],
  interval = 1200,
  blocking = true,
}) {
  const indexRef = useRef(0);
  const [message, setMessage] = useState(messages[0] || "");

  useEffect(() => {
    if (messages.length <= 1) {
      setMessage(messages[0] || "");
      return undefined;
    }
    const timer = window.setInterval(() => {
      indexRef.current = (indexRef.current + 1) % messages.length;
      setMessage(messages[indexRef.current]);
    }, interval);
    return () => window.clearInterval(timer);
  }, [messages, interval]);

  return (
    <div className={`cutin-processing${blocking ? "" : " cutin-processing--passive"}`} role="status" aria-live="polite" aria-busy="true">
      <div className="cutin-processing__inner">
        <div className="cutin-processing__mark" aria-hidden="true">
          <img src={BRAND_LOGO} alt="" />
          <i />
        </div>
        {message && <p>{message}</p>}
        <small>Cutinapp • Peter Tecnet</small>
      </div>
    </div>
  );
}

ProcessingIndicatorComponent.propTypes = {
  messages: PropTypes.arrayOf(PropTypes.string),
  interval: PropTypes.number,
  blocking: PropTypes.bool,
};
