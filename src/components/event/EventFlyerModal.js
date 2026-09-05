import React, { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { Button, Modal } from "react-bootstrap";
import "./EventFlyerModal.css";

const MIN_ZOOM = 0.75;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 0.25;

const clampZoom = (value) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

export default function EventFlyerModal({ show, onHide, event, flyerUrl }) {
  const [zoom, setZoom] = useState(1);
  const [dimensions, setDimensions] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!show) {
      setZoom(1);
      setCopied(false);
    }
  }, [show]);

  useEffect(() => {
    setZoom(1);
    setDimensions(null);
  }, [flyerUrl]);

  const zoomLabel = `${Math.round(zoom * 100)}%`;
  const eventMeta = useMemo(() => {
    if (!event) return "";
    return [event.production?.name, event.city && `${event.city}${event.uf ? ` - ${event.uf}` : ""}`]
      .filter(Boolean)
      .join(" · ");
  }, [event]);

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: event?.title || "Evento Cutinapp", text: "Confira este evento na Cutinapp", url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      if (error?.name !== "AbortError") setCopied(false);
    }
  };

  if (!flyerUrl || !event) return null;

  return (
    <Modal
      show={show}
      onHide={onHide}
      centered
      size="xl"
      fullscreen="md-down"
      dialogClassName="cut-flyer-modal-dialog"
      contentClassName="cut-flyer-modal"
      backdropClassName="cut-flyer-modal-backdrop"
      onExited={() => setZoom(1)}
    >
      <Modal.Header className="cut-flyer-modal__header">
        <div className="cut-flyer-modal__heading">
          <span className="cut-flyer-modal__eyebrow"><i className="fa-regular fa-image" /> Flyer oficial</span>
          <Modal.Title>{event.title}</Modal.Title>
          {eventMeta && <small>{eventMeta}</small>}
        </div>
        <button type="button" className="cut-flyer-modal__close" onClick={onHide} aria-label="Fechar visualização do flyer">
          <i className="fa-solid fa-xmark" />
        </button>
      </Modal.Header>

      <Modal.Body className="cut-flyer-modal__body">
        <div className="cut-flyer-stage">
          <div className="cut-flyer-stage__ambient" style={{ backgroundImage: `url(${flyerUrl})` }} aria-hidden="true" />
          <div className="cut-flyer-stage__grid" aria-hidden="true" />

          <div className="cut-flyer-stage__viewport">
            <img
              src={flyerUrl}
              alt={`Flyer original do evento ${event.title}`}
              className="cut-flyer-stage__image"
              style={{ transform: `scale(${zoom})` }}
              onLoad={(e) => setDimensions({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
              onDoubleClick={() => setZoom((current) => current > 1 ? 1 : 1.5)}
              draggable="false"
            />
          </div>

          <div className="cut-flyer-toolbar" role="toolbar" aria-label="Controles do flyer">
            <button type="button" onClick={() => setZoom((current) => clampZoom(current - ZOOM_STEP))} disabled={zoom <= MIN_ZOOM} aria-label="Diminuir zoom" title="Diminuir zoom">
              <i className="fa-solid fa-minus" />
            </button>
            <button type="button" className="cut-flyer-toolbar__zoom" onClick={() => setZoom(1)} title="Restaurar zoom">
              {zoomLabel}
            </button>
            <button type="button" onClick={() => setZoom((current) => clampZoom(current + ZOOM_STEP))} disabled={zoom >= MAX_ZOOM} aria-label="Aumentar zoom" title="Aumentar zoom">
              <i className="fa-solid fa-plus" />
            </button>
            <span className="cut-flyer-toolbar__divider" />
            <button type="button" onClick={() => setZoom(1)} aria-label="Ajustar flyer à tela" title="Ajustar à tela">
              <i className="fa-solid fa-compress" />
            </button>
          </div>

          <div className="cut-flyer-stage__hint">
            <i className="fa-solid fa-wand-magic-sparkles" />
            <span>Toque duas vezes na arte para alternar o zoom</span>
          </div>
        </div>
      </Modal.Body>

      <Modal.Footer className="cut-flyer-modal__footer">
        <div className="cut-flyer-modal__resolution">
          <i className="fa-solid fa-expand" />
          <span>{dimensions ? `${dimensions.width} × ${dimensions.height}px` : "Carregando resolução..."}</span>
        </div>
        <div className="cut-flyer-modal__actions">
          <Button variant="outline-light" onClick={share}>
            <i className={`fa-solid ${copied ? "fa-check" : "fa-share-nodes"} me-2`} />{copied ? "Link copiado" : "Compartilhar"}
          </Button>
          <Button variant="light" as="a" href={flyerUrl} target="_blank" rel="noreferrer">
            <i className="fa-solid fa-arrow-up-right-from-square me-2" />Abrir original
          </Button>
        </div>
      </Modal.Footer>
    </Modal>
  );
}

EventFlyerModal.propTypes = {
  show: PropTypes.bool.isRequired,
  onHide: PropTypes.func.isRequired,
  flyerUrl: PropTypes.string,
  event: PropTypes.shape({
    title: PropTypes.string,
    city: PropTypes.string,
    uf: PropTypes.string,
    production: PropTypes.shape({
      name: PropTypes.string,
    }),
  }),
};

EventFlyerModal.defaultProps = {
  flyerUrl: "",
  event: null,
};