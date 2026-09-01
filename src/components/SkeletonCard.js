import React from "react";
import PropTypes from "prop-types";

export default function SkeletonCard({ compact = false, className = "" }) {
  return (
    <div className={`cut-skeleton-card ${compact ? "cut-skeleton-card--compact" : ""} ${className}`.trim()} aria-hidden="true">
      {!compact && <div className="cut-skeleton cut-skeleton--media" />}
      <div className="cut-skeleton cut-skeleton--title" />
      <div className="cut-skeleton cut-skeleton--line" />
      <div className="cut-skeleton cut-skeleton--line cut-skeleton--short" />
    </div>
  );
}

SkeletonCard.propTypes = {
  compact: PropTypes.bool,
  className: PropTypes.string,
};
