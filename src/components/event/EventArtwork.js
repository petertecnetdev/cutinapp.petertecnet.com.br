/* eslint-disable react/prop-types */
import React, { useMemo } from "react";
import OptimizedImage from "../OptimizedImage";
import { eventImageUrl } from "../../utils/eventMedia";

export default function EventArtwork({
  image,
  title,
  alt,
  className = "",
  fallbackClassName = "",
  fallbackStyle,
  loading,
  fetchPriority,
  ...imageProps
}) {
  const src = useMemo(() => eventImageUrl(image), [image]);
  const eager = loading === "eager" || fetchPriority === "high";

  return (
    <OptimizedImage
      {...imageProps}
      src={src}
      alt={alt ?? `Imagem de ${title || "evento"}`}
      className={`${className} ${!src ? fallbackClassName : ""}`.trim()}
      fallbackLabel={title || "Cutinapp"}
      eager={eager}
      style={fallbackStyle}
    />
  );
}
