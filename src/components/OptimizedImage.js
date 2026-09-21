import React, { memo, useMemo, useState } from "react";
import PropTypes from "prop-types";
import "./OptimizedImage.css";

function initials(value) {
  return String(value || "C")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function OptimizedImage({
  src,
  alt,
  width,
  height,
  eager = false,
  className = "",
  fallbackLabel = "Cutinapp",
  sizes,
  srcSet,
  onLoad,
  onError,
  ...props
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const fallback = useMemo(() => initials(fallbackLabel || alt), [fallbackLabel, alt]);
  const hasImage = Boolean(src) && !failed;
  const aspectRatio = width && height ? `${width} / ${height}` : undefined;

  if (!hasImage) {
    return (
      <span
        className={`cut-optimized-image cut-optimized-image--fallback ${className}`.trim()}
        style={{ aspectRatio }}
        role={alt ? "img" : undefined}
        aria-label={alt || undefined}
        {...props}
      >
        {fallback}
      </span>
    );
  }

  return (
    <span
      className={`cut-optimized-image ${loaded ? "is-loaded" : "is-loading"} ${className}`.trim()}
      style={{ aspectRatio }}
    >
      <span className="cut-optimized-image__placeholder" aria-hidden="true" />
      <img
        src={src}
        srcSet={srcSet}
        sizes={sizes}
        alt={alt || ""}
        width={width}
        height={height}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={eager ? "high" : "low"}
        draggable="false"
        onLoad={(event) => {
          setLoaded(true);
          onLoad?.(event);
        }}
        onError={(event) => {
          setFailed(true);
          onError?.(event);
        }}
      />
    </span>
  );
}

OptimizedImage.propTypes = {
  src: PropTypes.string,
  alt: PropTypes.string,
  width: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  height: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  eager: PropTypes.bool,
  className: PropTypes.string,
  fallbackLabel: PropTypes.string,
  sizes: PropTypes.string,
  srcSet: PropTypes.string,
  onLoad: PropTypes.func,
  onError: PropTypes.func,
};

export default memo(OptimizedImage);
