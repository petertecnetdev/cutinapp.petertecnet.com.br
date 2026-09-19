/* eslint-disable react/prop-types */
import React, { useEffect, useMemo, useState } from "react";
import { eventImageUrl, eventInitials } from "../../utils/eventMedia";

export default function EventArtwork({
  image,
  title,
  alt,
  className = "",
  fallbackClassName = "",
  fallbackStyle,
  ...imageProps
}) {
  const src = useMemo(() => eventImageUrl(image), [image]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <span
        className={fallbackClassName}
        style={fallbackStyle}
        role="img"
        aria-label={`Imagem de ${title || "evento"} indisponível`}
      >
        {eventInitials(title)}
      </span>
    );
  }

  return (
    <img
      {...imageProps}
      src={src}
      alt={alt ?? `Imagem de ${title || "evento"}`}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
