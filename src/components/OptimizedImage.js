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
  loading,
  fetchPriority,
  decoding = "async",
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
  const responsiveSizes = sizes || "(max-width: 575px) calc(100vw - 24px), (max-width: 991px) 92vw, 720px";
  const resolvedLoading = loading || (eager ? "eager" : "lazy");
  const resolvedFetchPriority = fetchPriority || (eager ? "high" : "low");

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
        sizes={srcSet ? responsiveSizes : sizes}
        alt={alt || ""}
        width={width}
        height={height}
        loading={resolvedLoading}
        decoding={decoding}
        fetchPriority={resolvedFetchPriority}
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
  loading: PropTypes.oneOf(["eager", "lazy"]),
  fetchPriority: PropTypes.oneOf(["high", "low", "auto"]),
  decoding: PropTypes.oneOf(["async", "sync", "auto"]),
  className: PropTypes.string,
  fallbackLabel: PropTypes.string,
  sizes: PropTypes.string,
  srcSet: PropTypes.string,
  onLoad: PropTypes.func,
  onError: PropTypes.func,
};

export default memo(OptimizedImage);
