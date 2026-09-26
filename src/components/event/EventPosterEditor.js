import React, { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { Button, ButtonGroup, Form, Modal, Spinner } from "react-bootstrap";
import {
  EVENT_POSTER_HEIGHT,
  EVENT_POSTER_WIDTH,
  loadEventPosterImage,
  normalizeEventPosterFile,
  renderEventPosterCanvas,
} from "../../utils/eventPoster";
import "./EventPosterEditor.css";

const PRESETS = [
  ["original", "Original"],
  ["vivid", "Vivo"],
  ["warm", "Quente"],
  ["cool", "Frio"],
  ["mono", "P&B"],
];

const INITIAL_OPTIONS = {
  mode: "fill",
  zoom: 1,
  panX: 0,
  panY: 0,
  rotation: 0,
  flipX: false,
  flipY: false,
  brightness: 100,
  contrast: 100,
  saturation: 100,
  preset: "original",
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export default function EventPosterEditor({
  show,
  file,
  onCancel,
  onApply,
}) {
  const canvasRef = useRef(null);
  const dragRef = useRef(null);
  const [sourceImage, setSourceImage] = useState(null);
  const [options, setOptions] = useState(INITIAL_OPTIONS);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!show || !file) {
      setSourceImage(null);
      setError("");
      return undefined;
    }

    let active = true;
    setOptions(INITIAL_OPTIONS);
    setError("");

    loadEventPosterImage(file)
      .then((image) => {
        if (active) setSourceImage(image);
      })
      .catch((loadError) => {
        if (active) setError(loadError?.message || "Não foi possível abrir esta imagem.");
      });

    return () => {
      active = false;
    };
  }, [show, file]);

  useEffect(() => {
    if (!show || !sourceImage || !canvasRef.current) return;
    renderEventPosterCanvas(canvasRef.current, sourceImage, options);
  }, [show, sourceImage, options]);

  const patch = (changes) => setOptions((current) => ({ ...current, ...changes }));

  const rotate = () => patch({ rotation: (options.rotation + 90) % 360 });

  const reset = () => setOptions(INITIAL_OPTIONS);

  const beginDrag = (event) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      panX: options.panX,
      panY: options.panY,
    };
  };

  const moveDrag = (event) => {
    const drag = dragRef.current;
    const canvas = canvasRef.current;
    if (!drag || !canvas || drag.pointerId !== event.pointerId) return;

    const rect = canvas.getBoundingClientRect();
    const dx = (event.clientX - drag.x) / Math.max(rect.width, 1);
    const dy = (event.clientY - drag.y) / Math.max(rect.height, 1);

    patch({
      panX: clamp(drag.panX + dx, -0.55, 0.55),
      panY: clamp(drag.panY + dy, -0.55, 0.55),
    });
  };

  const endDrag = (event) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  const apply = async () => {
    if (!file || !sourceImage || processing) return;

    setProcessing(true);
    setError("");
    try {
      const normalized = await normalizeEventPosterFile(file, options);
      await onApply(normalized);
    } catch (applyError) {
      setError(applyError?.message || "Não foi possível preparar esta imagem.");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Modal
      show={show}
      onHide={processing ? undefined : onCancel}
      centered
      size="xl"
      dialogClassName="cut-event-poster-editor"
      backdrop={processing ? "static" : true}
      keyboard={!processing}
      restoreFocus
    >
      <Modal.Header closeButton={!processing}>
        <div>
          <span className="cut-event-poster-editor__eyebrow">Editor de arte</span>
          <Modal.Title>Prepare a imagem do evento</Modal.Title>
          <small>Arraste a imagem para reposicionar. A Cutinapp gera automaticamente 1024 × 1536 px.</small>
        </div>
      </Modal.Header>

      <Modal.Body>
        <div className="cut-event-poster-editor__layout">
          <div className="cut-event-poster-editor__stage">
            <div className="cut-event-poster-editor__canvasShell">
              <canvas
                ref={canvasRef}
                width={480}
                height={720}
                className="cut-event-poster-editor__canvas"
                onPointerDown={beginDrag}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                aria-label="Prévia da arte do evento"
              />
              {!sourceImage && !error && (
                <div className="cut-event-poster-editor__loading">
                  <Spinner animation="border" size="sm" />
                  <span>Preparando imagem...</span>
                </div>
              )}
            </div>
            <div className="cut-event-poster-editor__size">
              <i className="fa-solid fa-wand-magic-sparkles" />
              Saída final: {EVENT_POSTER_WIDTH} × {EVENT_POSTER_HEIGHT} px · JPEG otimizado
            </div>
          </div>

          <div className="cut-event-poster-editor__controls">
            <section>
              <strong>Enquadramento</strong>
              <ButtonGroup className="w-100">
                <Button
                  type="button"
                  variant={options.mode === "fill" ? "primary" : "outline-light"}
                  onClick={() => patch({ mode: "fill", panX: 0, panY: 0, zoom: 1 })}
                >
                  Preencher
                </Button>
                <Button
                  type="button"
                  variant={options.mode === "fit" ? "primary" : "outline-light"}
                  onClick={() => patch({ mode: "fit", panX: 0, panY: 0, zoom: 1 })}
                >
                  Encaixar inteira
                </Button>
              </ButtonGroup>
              <small>{options.mode === "fit" ? "A imagem inteira fica visível com fundo desfocado." : "A arte ocupa todo o quadro 2:3."}</small>
            </section>

            <section>
              <Form.Label>Zoom</Form.Label>
              <Form.Range
                min={1}
                max={3}
                step={0.01}
                value={options.zoom}
                onChange={(event) => patch({ zoom: Number(event.target.value) })}
              />
            </section>

            <section>
              <strong>Orientação</strong>
              <div className="cut-event-poster-editor__buttonGrid">
                <Button type="button" variant="outline-light" onClick={rotate}>
                  <i className="fa-solid fa-rotate-right" /> Girar 90°
                </Button>
                <Button type="button" variant="outline-light" onClick={() => patch({ flipX: !options.flipX })}>
                  <i className="fa-solid fa-left-right" /> Espelhar
                </Button>
              </div>
            </section>

            <section>
              <strong>Filtros</strong>
              <div className="cut-event-poster-editor__presetGrid">
                {PRESETS.map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    variant={options.preset === value ? "primary" : "outline-light"}
                    onClick={() => patch({ preset: value })}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </section>

            <section className="cut-event-poster-editor__adjustments">
              <Form.Label>Brilho</Form.Label>
              <Form.Range min={20} max={180} value={options.brightness} onChange={(event) => patch({ brightness: Number(event.target.value) })} />
              <Form.Label>Contraste</Form.Label>
              <Form.Range min={20} max={180} value={options.contrast} onChange={(event) => patch({ contrast: Number(event.target.value) })} />
              <Form.Label>Saturação</Form.Label>
              <Form.Range min={0} max={200} value={options.saturation} onChange={(event) => patch({ saturation: Number(event.target.value) })} />
            </section>

            <Button type="button" variant="outline-light" onClick={reset}>
              <i className="fa-solid fa-arrow-rotate-left" /> Restaurar
            </Button>

            {error && <div className="cut-event-poster-editor__error" role="alert">{error}</div>}
          </div>
        </div>
      </Modal.Body>

      <Modal.Footer>
        <Button type="button" variant="outline-light" onClick={onCancel} disabled={processing}>
          Cancelar
        </Button>
        <Button type="button" variant="primary" onClick={apply} disabled={!sourceImage || processing}>
          {processing ? <><Spinner animation="border" size="sm" /> Convertendo...</> : <><i className="fa-solid fa-check" /> Usar esta imagem</>}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

EventPosterEditor.propTypes = {
  show: PropTypes.bool,
  file: PropTypes.instanceOf(File),
  onCancel: PropTypes.func.isRequired,
  onApply: PropTypes.func.isRequired,
};
