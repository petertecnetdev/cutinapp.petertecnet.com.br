import React, { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import messagingService from "../../services/MessagingService";

const bytesLabel = (bytes = 0) => {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

export default function SecureMessageAttachment({ attachment, onOpenImage }) {
  const [objectUrl, setObjectUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let url = "";
    setLoading(true);
    setError("");

    messagingService.attachmentBlob(attachment.id)
      .then((blob) => {
        if (!active) return;
        url = URL.createObjectURL(blob);
        setObjectUrl(url);
      })
      .catch(() => {
        if (active) setError("Não foi possível carregar este anexo.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [attachment.id]);

  const label = useMemo(
    () => attachment.name || (attachment.kind === "image" ? "Imagem" : attachment.kind === "video" ? "Vídeo" : attachment.kind === "audio" ? "Áudio" : "Arquivo"),
    [attachment],
  );

  if (loading) return <div className="cut-direct-attachment cut-direct-attachment--loading"><span className="cut-direct-shimmer" /></div>;
  if (error || !objectUrl) return <div className="cut-direct-attachment cut-direct-attachment--error">{error || "Anexo indisponível"}</div>;

  if (attachment.kind === "image") {
    return (
      <button type="button" className="cut-direct-image" onClick={() => onOpenImage?.(objectUrl, label)}>
        <img src={objectUrl} alt={label} loading="lazy" />
      </button>
    );
  }

  if (attachment.kind === "video") {
    return <video className="cut-direct-video" src={objectUrl} controls playsInline preload="metadata" />;
  }

  if (attachment.kind === "audio") {
    return (
      <div className="cut-direct-audio">
        <i className="fa-solid fa-wave-square" aria-hidden="true" />
        <audio src={objectUrl} controls preload="metadata" />
      </div>
    );
  }

  return (
    <a className="cut-direct-file" href={objectUrl} download={label}>
      <span className="cut-direct-file__icon"><i className="fa-regular fa-file" /></span>
      <span><strong>{label}</strong><small>{bytesLabel(attachment.size)}</small></span>
      <i className="fa-solid fa-download" />
    </a>
  );
}

SecureMessageAttachment.propTypes = {
  attachment: PropTypes.shape({
    id: PropTypes.number.isRequired,
    name: PropTypes.string,
    kind: PropTypes.string,
    size: PropTypes.number,
  }).isRequired,
  onOpenImage: PropTypes.func,
};
