import React, { useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { Alert, Button, Form, Modal } from "react-bootstrap";
import "./ProductionGallery.css";

const sortByPosition = (left, right) => Number(left?.position || 0) - Number(right?.position || 0);

export default function ProductionGallery({
  media = [],
  albums = [],
  productionName,
  productionType = "independent",
  isOwner = false,
  canReport = false,
  onManage,
  onReport,
}) {
  const [activeAlbum, setActiveAlbum] = useState("all");
  const [visibleCount, setVisibleCount] = useState(12);
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const [loadedIds, setLoadedIds] = useState(() => new Set());
  const [failedIds, setFailedIds] = useState(() => new Set());
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("inappropriate");
  const [reportDetails, setReportDetails] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [reportFeedback, setReportFeedback] = useState("");
  const touchStartX = useRef(null);
  const lightboxTriggerRef = useRef(null);
  const initialLoadStartedAt = useRef(typeof performance !== "undefined" ? performance.now() : Date.now());
  const initialLoadTracked = useRef(false);

  const filtered = useMemo(() => {
    const ordered = [...media].sort(sortByPosition);
    if (activeAlbum === "all") return ordered;
    return ordered.filter((item) => String(item.album_id || "") === String(activeAlbum));
  }, [media, activeAlbum]);

  const visible = filtered.slice(0, visibleCount);
  const current = lightboxIndex >= 0 ? filtered[lightboxIndex] : null;

  useEffect(() => {
    if (initialLoadTracked.current || media.length === 0) return;
    const initialIds = media.slice().sort(sortByPosition).slice(0, 12).map((item) => Number(item.id));
    const settled = initialIds.filter((id) => loadedIds.has(id) || failedIds.has(id)).length;
    if (settled < initialIds.length) return;

    initialLoadTracked.current = true;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const durationMs = Math.max(0, Math.round(now - initialLoadStartedAt.current));
    try {
      window.PeterTecnetTelemetry?.track?.("production_gallery_loaded", {
        label: "Galeria pública da produção",
        target: String(window.location?.pathname || ""),
        metadata: {
          photos_total: media.length,
          photos_initial: initialIds.length,
          failures: initialIds.filter((id) => failedIds.has(id)).length,
          duration_ms: durationMs,
        },
      });
    } catch (_) {
      // Telemetry must never block gallery rendering.
    }
  }, [media, loadedIds, failedIds]);

  useEffect(() => {
    setVisibleCount(12);
    setLightboxIndex(-1);
  }, [activeAlbum]);

  useEffect(() => {
    if (lightboxIndex < 0) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setLightboxIndex((currentIndex) => currentIndex <= 0 ? filtered.length - 1 : currentIndex - 1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setLightboxIndex((currentIndex) => currentIndex >= filtered.length - 1 ? 0 : currentIndex + 1);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxIndex, filtered.length]);

  const openLightbox = (index, trigger) => {
    lightboxTriggerRef.current = trigger || document.activeElement;
    setLightboxIndex(index);
  };

  const closeLightbox = () => {
    setLightboxIndex(-1);
    setReportOpen(false);
    setReportFeedback("");
    const trigger = lightboxTriggerRef.current;
    lightboxTriggerRef.current = null;
    window.setTimeout(() => trigger?.focus?.({ preventScroll: true }), 0);
  };

  const move = (direction) => {
    if (!filtered.length) return;
    setLightboxIndex((currentIndex) => {
      const next = currentIndex + direction;
      if (next < 0) return filtered.length - 1;
      if (next >= filtered.length) return 0;
      return next;
    });
  };

  const submitReport = async () => {
    if (!current || !onReport || reportBusy) return;
    setReportBusy(true);
    setReportFeedback("");
    try {
      const response = await onReport(current.id, {
        reason: reportReason,
        details: reportDetails.trim() || undefined,
      });
      setReportFeedback(response?.message || "Denúncia enviada para análise.");
      setReportDetails("");
      setReportOpen(false);
    } catch (error) {
      setReportFeedback(error?.response?.data?.message || error?.message || "Não foi possível enviar a denúncia.");
    } finally {
      setReportBusy(false);
    }
  };

  const onTouchStart = (event) => {
    touchStartX.current = event.touches?.[0]?.clientX ?? null;
  };

  const onTouchEnd = (event) => {
    const start = touchStartX.current;
    const end = event.changedTouches?.[0]?.clientX;
    touchStartX.current = null;
    if (start == null || end == null) return;
    const delta = end - start;
    if (Math.abs(delta) < 45) return;
    move(delta > 0 ? -1 : 1);
  };

  if (!media.length && !isOwner) return null;

  const galleryTitle = productionType === "fixed" ? "Conheça o espaço" : "Galeria da produção";

  return (
    <section id="galeria" className="cut-production-section cut-public-gallery">
      <div className="cut-production-section-head cut-public-gallery__head">
        <div>
          <span className="cut-eyebrow">{productionType === "fixed" ? "O espaço" : "Imagens"}</span>
          <h2>{galleryTitle}</h2>
          <p>{media.length} {media.length === 1 ? "foto publicada" : "fotos publicadas"}</p>
        </div>
        {isOwner && (
          <Button type="button" variant="outline-light" onClick={onManage}>
            <i className="fa-solid fa-images me-2" />Gerenciar galeria
          </Button>
        )}
      </div>

      {albums.length > 0 && media.length > 0 && (
        <div className="cut-public-gallery__filters" aria-label="Álbuns da galeria">
          <button type="button" className={activeAlbum === "all" ? "is-active" : ""} onClick={() => setActiveAlbum("all")}>Todas</button>
          {albums.map((album) => (
            <button
              type="button"
              key={album.id}
              className={String(activeAlbum) === String(album.id) ? "is-active" : ""}
              onClick={() => setActiveAlbum(String(album.id))}
            >
              {album.name}
            </button>
          ))}
        </div>
      )}

      {media.length === 0 ? (
        <div className="cut-public-gallery__owner-empty">
          <i className="fa-regular fa-images" />
          <div>
            <strong>Sua página ainda não possui fotos da galeria</strong>
            <span>Adicione pelo menos quatro imagens para mostrar melhor a produção ao público.</span>
          </div>
          <Button type="button" onClick={onManage}>Adicionar fotos</Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="cut-public-gallery__album-empty">Este álbum ainda não possui fotos.</div>
      ) : (
        <>
          <div className="cut-public-gallery__grid">
            {visible.map((item, index) => (
              <button
                type="button"
                key={item.id}
                className={`cut-public-gallery__item ${item.is_featured ? "is-featured" : ""} ${loadedIds.has(Number(item.id)) ? "is-loaded" : ""} ${failedIds.has(Number(item.id)) ? "has-error" : ""}`}
                onClick={(event) => openLightbox(index, event.currentTarget)}
                aria-label={`Abrir foto ${index + 1} de ${filtered.length}`}
              >
                <img
                  src={item.thumbnail_url || item.url}
                  alt={item.alt_text || item.caption || `Foto de ${productionName}`}
                  loading="lazy"
                  decoding="async"
                  style={{ objectPosition: `${item.focal_x ?? 50}% ${item.focal_y ?? 50}%` }}
                  onLoad={() => {
                    setLoadedIds((currentIds) => {
                      const nextIds = new Set(currentIds);
                      nextIds.add(Number(item.id));
                      return nextIds;
                    });
                  }}
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                    setFailedIds((currentIds) => {
                      const nextIds = new Set(currentIds);
                      nextIds.add(Number(item.id));
                      return nextIds;
                    });
                  }}
                />
                {failedIds.has(Number(item.id)) && <span className="cut-public-gallery__broken"><i className="fa-regular fa-image" />Imagem indisponível</span>}
                <span className="cut-public-gallery__shade" />
                {item.is_featured && <span className="cut-public-gallery__featured"><i className="fa-solid fa-star" />Destaque</span>}
                {item.caption && <span className="cut-public-gallery__caption">{item.caption}</span>}
                <span className="cut-public-gallery__zoom"><i className="fa-solid fa-expand" /></span>
              </button>
            ))}
          </div>

          {visibleCount < filtered.length && (
            <div className="cut-public-gallery__more">
              <Button type="button" variant="outline-light" onClick={() => setVisibleCount((count) => count + 12)}>
                Ver mais fotos <span>{Math.min(12, filtered.length - visibleCount)}</span>
              </Button>
            </div>
          )}
        </>
      )}

      <Modal
        show={Boolean(current)}
        onHide={closeLightbox}
        centered
        size="xl"
        className="cut-gallery-lightbox"
      >
        <Modal.Header closeButton>
          <Modal.Title>{productionName}</Modal.Title>
          {current && <span className="cut-gallery-lightbox__count">{lightboxIndex + 1} de {filtered.length}</span>}
        </Modal.Header>
        <Modal.Body onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {current && (
            <div className="cut-gallery-lightbox__stage">
              {filtered.length > 1 && (
                <button type="button" className="cut-gallery-lightbox__nav is-prev" onClick={() => move(-1)} aria-label="Foto anterior">
                  <i className="fa-solid fa-chevron-left" />
                </button>
              )}
              <img
                src={current.url}
                alt={current.alt_text || current.caption || `Foto de ${productionName}`}
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                  setFailedIds((currentIds) => {
                    const nextIds = new Set(currentIds);
                    nextIds.add(Number(current.id));
                    return nextIds;
                  });
                }}
              />
              {failedIds.has(Number(current.id)) && <span className="cut-gallery-lightbox__broken"><i className="fa-regular fa-image" />Imagem indisponível</span>}
              {filtered.length > 1 && (
                <button type="button" className="cut-gallery-lightbox__nav is-next" onClick={() => move(1)} aria-label="Próxima foto">
                  <i className="fa-solid fa-chevron-right" />
                </button>
              )}
            </div>
          )}
          {current?.caption && <p className="cut-gallery-lightbox__caption">{current.caption}</p>}
          {reportFeedback && <Alert variant={reportFeedback.includes("Não foi possível") ? "danger" : "success"} className="mt-3 mb-0">{reportFeedback}</Alert>}
          {canReport && !isOwner && current && (
            <div className="cut-gallery-lightbox__report">
              {!reportOpen ? (
                <Button type="button" size="sm" variant="outline-light" onClick={() => { setReportOpen(true); setReportFeedback(""); }}>
                  <i className="fa-regular fa-flag me-2" />Denunciar foto
                </Button>
              ) : (
                <div className="cut-gallery-lightbox__report-form">
                  <strong>Denunciar esta foto</strong>
                  <Form.Select value={reportReason} onChange={(event) => setReportReason(event.target.value)} aria-label="Motivo da denúncia">
                    <option value="inappropriate">Conteúdo inadequado</option>
                    <option value="fraud">Fraude ou golpe</option>
                    <option value="misleading">Conteúdo enganoso</option>
                    <option value="copyright">Direitos autorais</option>
                    <option value="privacy">Privacidade</option>
                    <option value="other">Outro motivo</option>
                  </Form.Select>
                  <Form.Control
                    as="textarea"
                    rows={3}
                    maxLength={1000}
                    value={reportDetails}
                    onChange={(event) => setReportDetails(event.target.value)}
                    placeholder="Explique o problema, se necessário."
                  />
                  <div>
                    <Button type="button" size="sm" variant="outline-light" disabled={reportBusy} onClick={() => setReportOpen(false)}>Cancelar</Button>
                    <Button type="button" size="sm" variant="danger" disabled={reportBusy} onClick={submitReport}>
                      {reportBusy ? "Enviando..." : "Enviar denúncia"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </Modal.Body>
      </Modal>
    </section>
  );
}

ProductionGallery.propTypes = {
  media: PropTypes.arrayOf(PropTypes.object),
  albums: PropTypes.arrayOf(PropTypes.object),
  productionName: PropTypes.string.isRequired,
  productionType: PropTypes.string,
  isOwner: PropTypes.bool,
  canReport: PropTypes.bool,
  onManage: PropTypes.func,
  onReport: PropTypes.func,
};
