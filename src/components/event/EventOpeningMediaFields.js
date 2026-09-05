import React from "react";
import PropTypes from "prop-types";
import { Button, Form } from "react-bootstrap";
import { youtubeEmbedUrl, youtubeVideoId } from "../../utils/eventMedia";

const OPTIONS = [
  { value: "banner", icon: "fa-regular fa-image", label: "Banner", hint: "Usa a capa do evento" },
  { value: "video", icon: "fa-solid fa-film", label: "Vídeo", hint: "Envie MP4, WebM ou MOV" },
  { value: "youtube", icon: "fa-brands fa-youtube", label: "YouTube", hint: "Cole o link do vídeo" },
];

export default function EventOpeningMediaFields({
  type = "banner",
  onTypeChange,
  videoPreview = "",
  youtubeUrl = "",
  onYoutubeChange,
  onVideoChange,
  videoError = "",
  youtubeError = "",
}) {
  const youtubeId = youtubeVideoId(youtubeUrl);
  const youtubePreview = youtubeId ? youtubeEmbedUrl(youtubeUrl) : "";

  return (
    <div className="cut-opening-media-fields">
      <div className="mb-3">
        <span className="cut-eyebrow">Entrada da página</span>
        <h3 className="cut-section-title mt-2 mb-1">Mídia de abertura</h3>
        <p className="text-secondary small mb-0">Escolha o que aparece primeiro quando alguém abre a página pública do evento.</p>
      </div>

      <div className="cut-opening-media-options" role="group" aria-label="Tipo de mídia de abertura">
        {OPTIONS.map((option) => (
          <Button
            key={option.value}
            type="button"
            variant={type === option.value ? "primary" : "outline-light"}
            className={type === option.value ? "is-active" : ""}
            onClick={() => onTypeChange(option.value)}
            aria-pressed={type === option.value}
          >
            <i className={option.icon} />
            <span><strong>{option.label}</strong><small>{option.hint}</small></span>
          </Button>
        ))}
      </div>

      {type === "banner" && (
        <div className="cut-info-box mt-3">
          <strong>Banner selecionado</strong>
          <span>A capa do evento será usada como grande destaque no topo da página.</span>
        </div>
      )}

      {type === "video" && (
        <Form.Group className="mt-3">
          <Form.Label>Vídeo de abertura</Form.Label>
          {videoPreview ? (
            <video className="cut-opening-media-preview" src={videoPreview} controls muted playsInline preload="metadata" />
          ) : (
            <div className="cut-upload-placeholder cut-opening-media-placeholder">
              <i className="fa-solid fa-film" />
              <span>Escolha um vídeo para a abertura</span>
            </div>
          )}
          <Form.Control
            className="mt-3"
            type="file"
            accept="video/mp4,video/webm,video/quicktime,.mov"
            onChange={onVideoChange}
            isInvalid={Boolean(videoError)}
          />
          <Form.Control.Feedback type="invalid">{videoError}</Form.Control.Feedback>
          <Form.Text>MP4, WebM ou MOV, até 50 MB. Na página pública ele inicia automaticamente sem som; o visitante pode ativar o áudio.</Form.Text>
        </Form.Group>
      )}

      {type === "youtube" && (
        <Form.Group className="mt-3">
          <Form.Label>Link do YouTube</Form.Label>
          <Form.Control
            type="url"
            value={youtubeUrl}
            onChange={onYoutubeChange}
            placeholder="https://www.youtube.com/watch?v=... ou https://youtu.be/..."
            isInvalid={Boolean(youtubeError || (youtubeUrl && !youtubeId))}
          />
          <Form.Control.Feedback type="invalid">{youtubeError || "Informe um link válido de vídeo do YouTube."}</Form.Control.Feedback>
          <Form.Text>A Cutinapp incorpora o vídeo e tenta iniciar a reprodução automaticamente, sem som, ao abrir o evento.</Form.Text>
          {youtubePreview && (
            <div className="cut-opening-media-youtube-preview mt-3">
              <iframe
                src={youtubePreview}
                title="Prévia do vídeo do YouTube"
                allow="encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
              />
            </div>
          )}
        </Form.Group>
      )}
    </div>
  );
}

EventOpeningMediaFields.propTypes = {
  type: PropTypes.oneOf(["banner", "video", "youtube"]),
  onTypeChange: PropTypes.func.isRequired,
  videoPreview: PropTypes.string,
  youtubeUrl: PropTypes.string,
  onYoutubeChange: PropTypes.func.isRequired,
  onVideoChange: PropTypes.func.isRequired,
  videoError: PropTypes.string,
  youtubeError: PropTypes.string,
};
