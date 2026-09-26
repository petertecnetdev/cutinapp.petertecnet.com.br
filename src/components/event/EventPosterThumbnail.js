import React from "react";
import PropTypes from "prop-types";
import EventArtwork from "./EventArtwork";
import "./EventPosterThumbnail.css";

export default function EventPosterThumbnail({
  image,
  title,
  alt,
  className,
  loading,
  fetchPriority,
  ratio,
}) {
  const style = { "--cut-event-poster-ratio": ratio };

  return (
    <div className={["cut-event-poster-thumb", className].filter(Boolean).join(" ")} style={style}>
      <EventArtwork
        image={image}
        title={title}
        alt=""
        aria-hidden="true"
        className="cut-event-poster-thumb__bg"
        loading={loading}
        fetchPriority={fetchPriority}
        decoding="async"
      />
      <EventArtwork
        image={image}
        title={title}
        alt={alt ?? title ?? "Flyer do evento"}
        className="cut-event-poster-thumb__main"
        loading={loading}
        fetchPriority={fetchPriority}
        decoding="async"
        fallbackClassName="cut-event-poster-thumb__fallback"
      />
    </div>
  );
}

EventPosterThumbnail.propTypes = {
  image: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
  title: PropTypes.string,
  alt: PropTypes.string,
  className: PropTypes.string,
  loading: PropTypes.oneOf(["eager", "lazy"]),
  fetchPriority: PropTypes.oneOf(["high", "low", "auto"]),
  ratio: PropTypes.string,
};

EventPosterThumbnail.defaultProps = {
  image: null,
  title: "",
  alt: undefined,
  className: "",
  loading: "lazy",
  fetchPriority: "low",
  ratio: "4 / 5",
};
