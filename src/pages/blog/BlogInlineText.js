import React from "react";
import PropTypes from "prop-types";
import { Link } from "react-router-dom";

export function InlineText({ text }) {
  // Render supported Markdown tokens as React elements without injecting HTML.
  const parts = String(text || "").split(/(\*\*[^*]+\*\*|\[[^\]\n]+\]\([^)\n]+\))/g);
  return <>{parts.map((part, index) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={index}>{part.slice(2, -2)}</strong>;
    const link = part.match(/^\[([^\]\n]+)\]\(([^)\n]+)\)$/);
    if (link) {
      const [, label, href] = link;
      if (href.startsWith("/") && !href.startsWith("//")) {
        return <Link key={`${href}-${index}`} to={href}>{label}</Link>;
      }
      if (/^https?:\/\/[^\s<>]+$/i.test(href)) {
        return <a key={`${href}-${index}`} href={href} target="_blank" rel="noopener noreferrer">{label}</a>;
      }
    }
    return <React.Fragment key={index}>{part}</React.Fragment>;
  })}</>;
}

InlineText.propTypes = {
  text: PropTypes.string,
};
