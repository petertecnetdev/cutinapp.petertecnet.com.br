import React, { useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { Alert, Button, Form, Modal, Offcanvas, ProgressBar } from "react-bootstrap";
import cutinappService from "../../services/CutinappService";
import aiContentService from "../../services/AiContentService";
import { showConfirmation, showTextPrompt } from "../../utils/sweetAlert";
import { subscribeGalleryUpdates } from "../../utils/gallerySync";
import "./ProductionGalleryManager.css";

const LIMIT = 40;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const UPLOAD_CONCURRENCY = 2;

const waitForIdle = () => new Promise((resolve) => {
  if (typeof window === "undefined") {
    resolve();
    return;
  }
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(() => resolve(), { timeout: 700 });
    return;
  }
  window.setTimeout(resolve, 24);
});

let imageAnalysisChain = Promise.resolve();

const fileKey = (file) => [
  file.name,
  file.size,
  file.type,
  file.lastModified,
].join(":");

const humanBytes = (value) => {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
};

const byPosition = (left, right) => Number(left?.position || 0) - Number(right?.position || 0);
const byRecent = (left, right) => new Date(right?.created_at || 0).getTime() - new Date(left?.created_at || 0).getTime();

const analyzeImageFileNow = async (file) => {
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") return [];
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    const size = 96;
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      bitmap.close?.();
      return [];
    }
    const sourceWidth = bitmap.width;
    const sourceHeight = bitmap.height;
    context.drawImage(bitmap, 0, 0, size, size);
    bitmap.close?.();
    const pixels = context.getImageData(0, 0, size, size).data;
    let brightnessTotal = 0;
    let edgeTotal = 0;
    let edgeSamples = 0;
    const gray = new Float32Array(size * size);

    for (let index = 0, pixel = 0; index < pixels.length; index += 4, pixel += 1) {
      const value = (pixels[index] * .2126) + (pixels[index + 1] * .7152) + (pixels[index + 2] * .0722);
      gray[pixel] = value;
      brightnessTotal += value;
    }

    for (let y = 0; y < size - 1; y += 1) {
      for (let x = 0; x < size - 1; x += 1) {
        const index = (y * size) + x;
        edgeTotal += Math.abs(gray[index] - gray[index + 1]);
        edgeTotal += Math.abs(gray[index] - gray[index + size]);
        edgeSamples += 2;
      }
    }

    const brightness = brightnessTotal / gray.length;
    const sharpness = edgeSamples ? edgeTotal / edgeSamples : 0;
    const warnings = [];
    if (brightness < 52) warnings.push("A foto parece bastante escura; confira se os detalhes estão visíveis.");
    if (sharpness < 7.5) warnings.push("A foto pode estar desfocada ou com poucos detalhes.");
    if (sourceWidth < 900 || sourceHeight < 600) warnings.push("A resolução é baixa para telas grandes.");
    return warnings;
  } catch (_) {
    return [];
  }
};

const analyzeImageFile = (file) => {
  const task = imageAnalysisChain
    .then(() => waitForIdle())
    .then(() => analyzeImageFileNow(file));
  imageAnalysisChain = task.catch(() => []);
  return task;
};

const normalizePositions = (items) => items.map((item, position) => ({ ...item, position }));

export default function ProductionGalleryManager({
  organizationId,
  productionName,
  productionType = "independent",
  media = [],
  albums = [],
  publicSlug = "",
  coverUrl = "",
  locationReady = false,
  onMediaChange,
  onAlbumsChange,
  onCoverChange,
}) {
  const [items, setItems] = useState(() => normalizePositions([...media].sort(byPosition)));
  const [localAlbums, setLocalAlbums] = useState(albums);
  const [queue, setQueue] = useState([]);
  const [mode, setMode] = useState("manage");
  const [sortMode, setSortMode] = useState("custom");
  const [filterAlbum, setFilterAlbum] = useState("all");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [draggedId, setDraggedId] = useState(null);
  const [dropActive, setDropActive] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [orderStatus, setOrderStatus] = useState("");
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [previewingId, setPreviewingId] = useState(null);
  const [editCaption, setEditCaption] = useState("");
  const [editAlt, setEditAlt] = useState("");
  const [editAlbumId, setEditAlbumId] = useState("");
  const [editFeatured, setEditFeatured] = useState(false);
  const [editFocalX, setEditFocalX] = useState(50);
  const [editFocalY, setEditFocalY] = useState(50);
  const [editBusy, setEditBusy] = useState(false);
  const [replaceProgress, setReplaceProgress] = useState(0);
  const [aiBusy, setAiBusy] = useState("");
  const [bulkAlbumId, setBulkAlbumId] = useState("");
  const [smartOpen, setSmartOpen] = useState(false);
  const [smartBusy, setSmartBusy] = useState(false);
  const [recommendations, setRecommendations] = useState([]);
  const [similarPairs, setSimilarPairs] = useState([]);
  const [cropAspect, setCropAspect] = useState("square");
  const [cropZoom, setCropZoom] = useState(100);
  const [undo, setUndo] = useState(null);
  const inputRef = useRef(null);
  const abortControllers = useRef(new Map());
  const undoTimer = useRef(null);
  const itemsRef = useRef(items);
  const queueRef = useRef(queue);

  useEffect(() => {
    const next = normalizePositions([...media].sort(byPosition));
    itemsRef.current = next;
    setItems(next);
  }, [media]);

  useEffect(() => {
    setLocalAlbums(Array.isArray(albums) ? albums : []);
  }, [albums]);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    let active = true;
    let timer = null;
    const unsubscribe = subscribeGalleryUpdates(organizationId, () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        try {
          const workspace = await cutinappService.productionWorkspace(organizationId);
          if (!active) return;
          const nextMedia = normalizePositions([...(workspace?.media || [])].sort(byPosition));
          const nextAlbums = Array.isArray(workspace?.gallery?.albums) ? workspace.gallery.albums : [];
          itemsRef.current = nextMedia;
          setItems(nextMedia);
          setLocalAlbums(nextAlbums);
          onMediaChange?.(nextMedia);
          onAlbumsChange?.(nextAlbums);
        } catch (_) {
          // A mutação que originou o evento já atualizou a tela local.
        }
      }, 180);
    });
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
      unsubscribe();
    };
  }, [organizationId, onMediaChange, onAlbumsChange]);

  useEffect(() => () => {
    abortControllers.current.forEach((controller) => controller.abort());
    queueRef.current.forEach((item) => {
      if (item.preview?.startsWith("blob:")) URL.revokeObjectURL(item.preview);
    });
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
  }, []);

  const commitItems = (next) => {
    const normalized = normalizePositions([...next]);
    itemsRef.current = normalized;
    setItems(normalized);
    onMediaChange?.(normalized);
  };

  const displayedItems = useMemo(() => {
    const filtered = filterAlbum === "all"
      ? [...items]
      : items.filter((item) => String(item.album_id || "") === String(filterAlbum));
    return sortMode === "recent" ? filtered.sort(byRecent) : filtered.sort(byPosition);
  }, [items, sortMode, filterAlbum]);

  const recommendedCoverId = useMemo(() => {
    if (recommendations[0]?.id) return recommendations[0].id;

    const candidates = items.filter((item) => {
      const width = Number(item.width || 0);
      const height = Number(item.height || 0);
      return width >= 1200 && height >= 600 && width / Math.max(1, height) >= 1.35;
    });
    candidates.sort((left, right) => {
      const leftRatio = Number(left.width || 0) / Math.max(1, Number(left.height || 1));
      const rightRatio = Number(right.width || 0) / Math.max(1, Number(right.height || 1));
      const leftScore = Number(left.cover_score || 0) || ((Number(left.width || 0) * Number(left.height || 0)) - (Math.abs(leftRatio - 2.2) * 250000));
      const rightScore = Number(right.cover_score || 0) || ((Number(right.width || 0) * Number(right.height || 0)) - (Math.abs(rightRatio - 2.2) * 250000));
      return rightScore - leftScore;
    });
    return candidates[0]?.id || null;
  }, [items, recommendations]);

  const previewingIndex = previewingId == null
    ? -1
    : displayedItems.findIndex((item) => Number(item.id) === Number(previewingId));
  const previewing = previewingIndex >= 0 ? displayedItems[previewingIndex] : null;

  const remaining = Math.max(0, LIMIT - items.length);
  const selectedCount = selectedIds.size;
  const recommendedMissing = Math.max(0, 4 - items.length);
  const galleryLabel = productionType === "fixed" ? "Fotos do espaço" : "Galeria da produção";

  const clearFeedback = () => {
    setError("");
    setMessage("");
  };

  const addFiles = (files) => {
    clearFeedback();
    const candidates = Array.from(files || []);
    if (!candidates.length) return;

    const existingSignatures = new Set(queue.map((item) => item.signature));
    const available = Math.max(0, remaining - queue.filter((item) => !["done", "cancelled"].includes(item.status)).length);
    const next = [];
    const rejected = [];

    candidates.forEach((file) => {
      if (next.length >= available) {
        rejected.push(`${file.name}: limite de ${LIMIT} fotos atingido`);
        return;
      }
      if (!ACCEPTED_TYPES.has(file.type)) {
        rejected.push(`${file.name}: formato não suportado`);
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        rejected.push(`${file.name}: maior que 10 MB`);
        return;
      }
      const signature = fileKey(file);
      if (existingSignatures.has(signature) || next.some((item) => item.signature === signature)) {
        rejected.push(`${file.name}: arquivo repetido nesta seleção`);
        return;
      }
      const queueItem = {
        id: `queue-${Date.now()}-${next.length}-${Math.random().toString(36).slice(2)}`,
        signature,
        file,
        preview: URL.createObjectURL(file),
        caption: "",
        status: "pending",
        progress: 0,
        error: "",
        warnings: [],
      };
      next.push(queueItem);
      void analyzeImageFile(file).then((warnings) => {
        if (warnings.length) updateQueueItem(queueItem.id, { warnings });
      });
    });

    setQueue((current) => [...current.filter((item) => item.status !== "done"), ...next]);
    if (rejected.length) setError(rejected.slice(0, 4).join(" · "));
  };

  const onFileChange = (event) => {
    addFiles(event.target.files);
    event.target.value = "";
  };

  const onDrop = (event) => {
    event.preventDefault();
    setDropActive(false);
    addFiles(event.dataTransfer.files);
  };

  const updateQueueItem = (id, changes) => {
    setQueue((current) => current.map((item) => item.id === id ? { ...item, ...changes } : item));
  };

  const removeQueueItem = (id) => {
    const item = queue.find((candidate) => candidate.id === id);
    abortControllers.current.get(id)?.abort();
    abortControllers.current.delete(id);
    if (item?.preview?.startsWith("blob:")) URL.revokeObjectURL(item.preview);
    setQueue((current) => current.filter((candidate) => candidate.id !== id));
  };

  const uploadOne = async (item) => {
    const controller = new AbortController();
    abortControllers.current.set(item.id, controller);
    updateQueueItem(item.id, { status: "uploading", progress: 1, error: "" });
    const payload = new FormData();
    payload.append("photo", item.file);
    if (item.caption.trim()) payload.append("caption", item.caption.trim());
    payload.append("alt_text", item.caption.trim() || `${productionName} - foto da galeria`);

    try {
      const response = await cutinappService.uploadProductionMedia(organizationId, payload, {
        signal: controller.signal,
        onUploadProgress: (progressEvent) => {
          const total = Number(progressEvent.total || item.file.size || 0);
          const loaded = Number(progressEvent.loaded || 0);
          const progress = total > 0 ? Math.min(99, Math.max(1, Math.round((loaded / total) * 100))) : 50;
          updateQueueItem(item.id, { progress });
        },
      });
      if (response?.media) {
        commitItems([...itemsRef.current.filter((existing) => Number(existing.id) !== Number(response.media.id)), response.media]);
      }
      updateQueueItem(item.id, {
        status: "done",
        progress: 100,
        warnings: [response?.warning, ...(response?.quality_warnings || [])].filter(Boolean),
      });
      return response?.media || null;
    } catch (uploadError) {
      const cancelled = controller.signal.aborted || uploadError?.code === "ERR_CANCELED";
      updateQueueItem(item.id, {
        status: cancelled ? "cancelled" : "error",
        progress: cancelled ? 0 : item.progress,
        error: cancelled ? "Envio cancelado." : (uploadError?.response?.data?.message || uploadError?.message || "Falha no envio."),
      });
      return null;
    } finally {
      abortControllers.current.delete(item.id);
    }
  };

  const uploadQueue = async () => {
    if (uploading) return;
    setUploading(true);
    clearFeedback();
    const pending = queue.filter((item) => item.status === "pending" || item.status === "error" || item.status === "cancelled");
    let uploadedCount = 0;
    let cursor = 0;

    const worker = async () => {
      while (cursor < pending.length) {
        const index = cursor;
        cursor += 1;
        const uploaded = await uploadOne(pending[index]);
        if (uploaded) uploadedCount += 1;
      }
    };

    try {
      const workerCount = Math.min(UPLOAD_CONCURRENCY, pending.length);
      await Promise.all(Array.from({ length: workerCount }, () => worker()));
    } finally {
      setUploading(false);
    }

    if (uploadedCount > 0) setMessage(uploadedCount === 1 ? "Foto publicada na galeria." : `${uploadedCount} fotos publicadas na galeria.`);
  };

  const cancelAllUploads = () => {
    abortControllers.current.forEach((controller) => controller.abort());
  };

  const clearCompletedQueue = () => {
    queue.filter((item) => item.status === "done").forEach((item) => {
      if (item.preview?.startsWith("blob:")) URL.revokeObjectURL(item.preview);
    });
    setQueue((current) => current.filter((item) => item.status !== "done"));
  };

  const saveOrder = async (next, previous) => {
    setOrderStatus("Salvando ordem...");
    try {
      const response = await cutinappService.reorderProductionMedia(organizationId, next.map((item) => item.id));
      const ordered = Array.isArray(response?.media) ? response.media : next;
      commitItems(ordered);
      setOrderStatus("Ordem salva");
      window.setTimeout(() => setOrderStatus(""), 1800);
    } catch (orderError) {
      commitItems(previous);
      setOrderStatus("");
      setError(orderError?.response?.data?.message || orderError?.message || "Não foi possível salvar a nova ordem.");
    }
  };

  const moveItem = (mediaId, direction) => {
    if (sortMode !== "custom") {
      setSortMode("custom");
      return;
    }
    const previous = [...items].sort(byPosition);
    const from = previous.findIndex((item) => Number(item.id) === Number(mediaId));
    const to = Math.min(Math.max(0, from + direction), previous.length - 1);
    if (from < 0 || from === to) return;
    const next = [...previous];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    const normalized = normalizePositions(next);
    commitItems(normalized);
    void saveOrder(normalized, previous);
  };

  const makePrimary = (mediaId) => {
    const previous = [...itemsRef.current].sort(byPosition);
    const from = previous.findIndex((item) => Number(item.id) === Number(mediaId));
    if (from <= 0) {
      setMessage("Esta foto já é a principal da galeria.");
      return;
    }
    const next = [...previous];
    const [moved] = next.splice(from, 1);
    next.unshift(moved);
    const normalized = normalizePositions(next);
    commitItems(normalized);
    void saveOrder(normalized, previous);
    setMessage("Foto definida como principal da galeria. A capa da página não foi alterada.");
  };

  const handleDropOnCard = (targetId) => {
    if (!draggedId || Number(draggedId) === Number(targetId) || sortMode !== "custom") return;
    const previous = [...items].sort(byPosition);
    const from = previous.findIndex((item) => Number(item.id) === Number(draggedId));
    const to = previous.findIndex((item) => Number(item.id) === Number(targetId));
    if (from < 0 || to < 0) return;
    const next = [...previous];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    const normalized = normalizePositions(next);
    setDraggedId(null);
    commitItems(normalized);
    void saveOrder(normalized, previous);
  };

  const handleTouchReorderEnd = (event, sourceId) => {
    if (sortMode !== "custom" || selectionMode) return;
    const touch = event.changedTouches?.[0];
    if (!touch || typeof document === "undefined") return;
    const target = document.elementFromPoint(touch.clientX, touch.clientY)?.closest?.("[data-gallery-media-id]");
    const targetId = Number(target?.dataset?.galleryMediaId || 0);
    if (!targetId || Number(sourceId) === targetId) return;
    setDraggedId(sourceId);
    const previous = [...itemsRef.current].sort(byPosition);
    const from = previous.findIndex((item) => Number(item.id) === Number(sourceId));
    const to = previous.findIndex((item) => Number(item.id) === targetId);
    if (from < 0 || to < 0) return;
    const next = [...previous];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    const normalized = normalizePositions(next);
    setDraggedId(null);
    commitItems(normalized);
    void saveOrder(normalized, previous);
  };

  const toggleSelected = (id) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(Number(id))) next.delete(Number(id));
      else next.add(Number(id));
      return next;
    });
  };

  const exitSelection = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const selectAll = () => {
    setSelectedIds(new Set(displayedItems.map((item) => Number(item.id))));
  };

  const deleteIds = async (ids) => {
    if (!ids.length) return;
    const singleItem = ids.length === 1
      ? itemsRef.current.find((item) => Number(item.id) === Number(ids[0]))
      : null;
    const confirmed = await showConfirmation({
      title: ids.length === 1 ? "Remover foto?" : `Remover ${ids.length} fotos?`,
      text: ids.length === 1
        ? "Ela deixará de aparecer na página pública. Você poderá desfazer por alguns instantes."
        : "As imagens deixarão de aparecer na página pública. Você poderá desfazer por alguns instantes.",
      confirmButtonText: "Remover",
      imageUrl: singleItem?.thumbnail_url || singleItem?.url || null,
      imageAlt: singleItem?.alt_text || singleItem?.caption || "Foto selecionada para remoção",
    });
    if (!confirmed) return;

    const previous = items;
    commitItems(items.filter((item) => !ids.includes(Number(item.id))));
    setEditing(null);
    exitSelection();
    clearFeedback();

    try {
      await cutinappService.bulkDeleteProductionMedia(organizationId, ids);
      setUndo({ ids, previous });
      setMessage(ids.length === 1 ? "Foto removida." : "Fotos removidas.");
      if (undoTimer.current) window.clearTimeout(undoTimer.current);
      undoTimer.current = window.setTimeout(() => setUndo(null), 10000);
    } catch (deleteError) {
      commitItems(previous);
      setError(deleteError?.response?.data?.message || deleteError?.message || "Não foi possível remover as fotos.");
    }
  };

  const undoDelete = async () => {
    if (!undo?.ids?.length) return;
    clearFeedback();
    try {
      const response = await cutinappService.restoreProductionMedia(organizationId, undo.ids);
      commitItems(Array.isArray(response?.media) ? response.media : undo.previous);
      setMessage("Fotos restauradas.");
      setUndo(null);
      if (undoTimer.current) window.clearTimeout(undoTimer.current);
    } catch (restoreError) {
      setError(restoreError?.response?.data?.message || restoreError?.message || "Não foi possível restaurar as fotos.");
    }
  };

  const openEditor = (item) => {
    clearFeedback();
    setEditing(item);
    setEditCaption(item.caption || "");
    setEditAlt(item.alt_text || item.caption || "");
    setEditAlbumId(item.album_id ? String(item.album_id) : "");
    setEditFeatured(Boolean(item.is_featured));
    setEditFocalX(Number(item.focal_x ?? 50));
    setEditFocalY(Number(item.focal_y ?? 50));
    setCropAspect("square");
    setCropZoom(100);
    setReplaceProgress(0);
  };

  const mergeUpdatedItem = (updated) => {
    if (!updated) return;
    const next = items.map((item) => Number(item.id) === Number(updated.id) ? { ...item, ...updated } : (
      updated.is_featured ? { ...item, is_featured: false } : item
    ));
    commitItems(next);
    setEditing((current) => current && Number(current.id) === Number(updated.id) ? { ...current, ...updated } : current);
  };

  const saveEdit = async () => {
    if (!editing || editBusy) return;
    setEditBusy(true);
    clearFeedback();
    try {
      const response = await cutinappService.updateProductionMedia(organizationId, editing.id, {
        caption: editCaption.trim() || null,
        alt_text: editAlt.trim() || null,
        album_id: editAlbumId ? Number(editAlbumId) : null,
        is_featured: editFeatured,
        focal_x: Number(editFocalX),
        focal_y: Number(editFocalY),
      });
      mergeUpdatedItem(response?.media);
      setMessage("Informações da foto atualizadas.");
      setEditing(null);
    } catch (editError) {
      setError(editError?.response?.data?.message || editError?.message || "Não foi possível atualizar a foto.");
    } finally {
      setEditBusy(false);
    }
  };

  const rotate = async (degrees) => {
    if (!editing || editBusy) return;
    setEditBusy(true);
    clearFeedback();
    try {
      const response = await cutinappService.rotateProductionMedia(organizationId, editing.id, degrees);
      mergeUpdatedItem(response?.media);
      setMessage("Foto rotacionada.");
    } catch (rotateError) {
      setError(rotateError?.response?.data?.message || rotateError?.message || "Não foi possível rotacionar a foto.");
    } finally {
      setEditBusy(false);
    }
  };

  const applyCrop = async () => {
    if (!editing || editBusy) return;
    setEditBusy(true);
    clearFeedback();
    try {
      const response = await cutinappService.cropProductionMedia(organizationId, editing.id, {
        aspect: cropAspect,
        zoom: Number(cropZoom),
        focal_x: Number(editFocalX),
        focal_y: Number(editFocalY),
      });
      mergeUpdatedItem(response?.media);
      setCropZoom(100);
      setEditFocalX(50);
      setEditFocalY(50);
      setMessage("Recorte aplicado. O arquivo original foi preservado.");
    } catch (cropError) {
      setError(cropError?.response?.data?.message || cropError?.message || "Não foi possível recortar a foto.");
    } finally {
      setEditBusy(false);
    }
  };

  const reprocessImage = async (target = editing) => {
    if (!target?.id || editBusy) return;
    setEditBusy(true);
    clearFeedback();
    try {
      const response = await cutinappService.reprocessProductionMedia(organizationId, target.id);
      mergeUpdatedItem(response?.media);
      setMessage("Imagem reprocessada a partir do original.");
    } catch (reprocessError) {
      setError(reprocessError?.response?.data?.message || reprocessError?.message || "Não foi possível reprocessar a imagem.");
    } finally {
      setEditBusy(false);
    }
  };

  const loadSmartAnalysis = async () => {
    if (smartBusy) return;
    setSmartBusy(true);
    clearFeedback();
    try {
      const [recommendationResponse, similarResponse] = await Promise.all([
        cutinappService.productionMediaRecommendations(organizationId),
        cutinappService.productionMediaSimilar(organizationId),
      ]);
      setRecommendations(Array.isArray(recommendationResponse?.recommendations) ? recommendationResponse.recommendations : []);
      setSimilarPairs(Array.isArray(similarResponse?.pairs) ? similarResponse.pairs : []);
      setSmartOpen(true);
    } catch (analysisError) {
      setError(analysisError?.response?.data?.message || analysisError?.message || "Não foi possível analisar a galeria.");
    } finally {
      setSmartBusy(false);
    }
  };

  const useRecommendedAsCover = async (item) => {
    if (!item?.id || editBusy) return;
    setEditBusy(true);
    clearFeedback();
    try {
      const response = await cutinappService.setProductionMediaCover(organizationId, item.id);
      onCoverChange?.(response);
      setMessage("Capa atualizada com a foto recomendada.");
    } catch (coverError) {
      setError(coverError?.response?.data?.message || coverError?.message || "Não foi possível atualizar a capa.");
    } finally {
      setEditBusy(false);
    }
  };

  const useAsCover = async () => {
    if (!editing || editBusy) return;
    const confirmed = await showConfirmation({
      title: "Usar como capa?",
      text: "A imagem será recortada para o formato horizontal da capa sem alterar a foto original da galeria.",
      confirmButtonText: "Usar como capa",
    });
    if (!confirmed) return;
    setEditBusy(true);
    clearFeedback();
    try {
      const response = await cutinappService.setProductionMediaCover(organizationId, editing.id);
      onCoverChange?.(response);
      setMessage("Capa da produção atualizada.");
    } catch (coverError) {
      setError(coverError?.response?.data?.message || coverError?.message || "Não foi possível usar esta foto como capa.");
    } finally {
      setEditBusy(false);
    }
  };

  const replaceImage = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !editing || editBusy) return;
    if (!ACCEPTED_TYPES.has(file.type) || file.size > MAX_FILE_SIZE) {
      setError("Escolha uma imagem JPG, PNG ou WebP de até 10 MB.");
      return;
    }

    setEditBusy(true);
    setReplaceProgress(1);
    clearFeedback();
    const payload = new FormData();
    payload.append("photo", file);
    try {
      const response = await cutinappService.replaceProductionMedia(organizationId, editing.id, payload, {
        onUploadProgress: (progressEvent) => {
          const total = Number(progressEvent.total || file.size);
          const progress = total > 0 ? Math.round((Number(progressEvent.loaded || 0) / total) * 100) : 50;
          setReplaceProgress(Math.min(99, Math.max(1, progress)));
        },
      });
      setReplaceProgress(100);
      mergeUpdatedItem(response?.media);
      setMessage("Foto substituída sem perder a posição e a legenda.");
    } catch (replaceError) {
      setError(replaceError?.response?.data?.message || replaceError?.message || "Não foi possível substituir a foto.");
    } finally {
      setEditBusy(false);
      window.setTimeout(() => setReplaceProgress(0), 800);
    }
  };

  const createAlbum = async () => {
    const name = await showTextPrompt({
      title: "Novo álbum",
      text: "Crie um agrupamento para organizar as fotos sem tirá-las da galeria principal.",
      inputLabel: "Nome do álbum",
      inputPlaceholder: "Ex.: Camarote",
      confirmButtonText: "Criar álbum",
      required: true,
    });
    if (!name) return;

    clearFeedback();
    try {
      const response = await cutinappService.createProductionMediaAlbum(organizationId, name);
      const next = [...localAlbums, response.album].filter(Boolean);
      setLocalAlbums(next);
      onAlbumsChange?.(next);
      setMessage("Álbum criado.");
    } catch (albumError) {
      setError(albumError?.response?.data?.message || albumError?.message || "Não foi possível criar o álbum.");
    }
  };

  const deleteAlbum = async (album) => {
    const confirmed = await showConfirmation({
      title: `Remover álbum "${album.name}"?`,
      text: "As fotos não serão excluídas; elas voltarão para a galeria principal.",
      confirmButtonText: "Remover álbum",
    });
    if (!confirmed) return;
    try {
      await cutinappService.deleteProductionMediaAlbum(organizationId, album.id);
      const nextAlbums = localAlbums.filter((item) => Number(item.id) !== Number(album.id));
      const nextItems = items.map((item) => Number(item.album_id) === Number(album.id) ? { ...item, album_id: null } : item);
      setLocalAlbums(nextAlbums);
      onAlbumsChange?.(nextAlbums);
      commitItems(nextItems);
      setMessage("Álbum removido.");
    } catch (albumError) {
      setError(albumError?.response?.data?.message || albumError?.message || "Não foi possível remover o álbum.");
    }
  };

  const moveSelectedToAlbum = async () => {
    if (!selectedCount) return;
    clearFeedback();
    try {
      const response = await cutinappService.bulkUpdateProductionMedia(
        organizationId,
        Array.from(selectedIds),
        { album_id: bulkAlbumId ? Number(bulkAlbumId) : null },
      );
      if (Array.isArray(response?.media)) commitItems(response.media);
      setMessage(bulkAlbumId ? "Fotos movidas para o álbum." : "Fotos movidas para a galeria principal.");
      exitSelection();
      setBulkAlbumId("");
    } catch (bulkError) {
      setError(bulkError?.response?.data?.message || bulkError?.message || "Não foi possível mover as fotos.");
    }
  };

  const importCover = async () => {
    clearFeedback();
    try {
      const response = await cutinappService.importProductionCoverToGallery(organizationId);
      if (response?.media) {
        const exists = itemsRef.current.some((item) => Number(item.id) === Number(response.media.id));
        if (!exists) commitItems([...itemsRef.current, response.media]);
      }
      setMessage(response?.message || "Capa adicionada à galeria.");
    } catch (importError) {
      setError(importError?.response?.data?.message || importError?.message || "Não foi possível adicionar a capa à galeria.");
    }
  };

  const improveCaptionWithAi = async () => {
    if (!editCaption.trim() || aiBusy) {
      if (!editCaption.trim()) setError("Escreva uma legenda curta primeiro para a IA aprimorar sem inventar o conteúdo da foto.");
      return;
    }
    setAiBusy("caption");
    clearFeedback();
    try {
      const result = await aiContentService.generateDescription({
        entityType: "production-media-caption",
        title: productionName,
        currentDescription: editCaption,
        context: {
          purpose: "Aprimorar uma legenda de foto para galeria. Seja fiel ao texto informado e não invente elementos visuais.",
          album: localAlbums.find((album) => String(album.id) === String(editAlbumId))?.name || "",
        },
        tone: "curto, natural, descritivo e convidativo",
        action: "improve",
      });
      const caption = String(result?.description || "").replace(/\s+/g, " ").replace(/^["']|["']$/g, "").trim().slice(0, 180);
      if (caption) setEditCaption(caption);
    } catch (aiError) {
      setError(aiError?.message || "Não foi possível aprimorar a legenda com IA.");
    } finally {
      setAiBusy("");
    }
  };

  const suggestAltWithAi = async () => {
    const base = editCaption.trim() || editAlt.trim();
    if (!base || aiBusy) {
      if (!base) suggestAlt();
      return;
    }
    setAiBusy("alt");
    clearFeedback();
    try {
      const result = await aiContentService.generateDescription({
        entityType: "production-media-alt",
        title: productionName,
        currentDescription: base,
        context: {
          purpose: "Gerar texto alternativo curto para acessibilidade e SEO somente com os fatos presentes na legenda.",
        },
        tone: "objetivo, acessível, factual e sem linguagem promocional",
        action: "rewrite",
      });
      const alt = String(result?.description || "").replace(/\s+/g, " ").replace(/^["']|["']$/g, "").trim().slice(0, 255);
      if (alt) setEditAlt(alt);
    } catch (_) {
      suggestAlt();
    } finally {
      setAiBusy("");
    }
  };

  const movePreview = (direction) => {
    if (!displayedItems.length || previewingIndex < 0) return;
    const nextIndex = (previewingIndex + direction + displayedItems.length) % displayedItems.length;
    setPreviewingId(displayedItems[nextIndex].id);
  };

  const suggestAlt = () => {
    const detail = editCaption.trim() || (productionType === "fixed" ? "foto do espaço" : "foto da produção");
    setEditAlt(`${productionName} - ${detail}`);
  };

  const overallUploadProgress = useMemo(() => {
    const active = queue.filter((item) => item.status !== "cancelled");
    if (!active.length) return 0;
    return Math.round(active.reduce((sum, item) => sum + Number(item.progress || 0), 0) / active.length);
  }, [queue]);

  return (
    <div className="cut-gallery-manager">
      <div className="cut-gallery-manager__summary">
        <div>
          <span className="cut-eyebrow">{productionType === "fixed" ? "Seu estabelecimento" : "Identidade visual"}</span>
          <h3>{galleryLabel}</h3>
          <p>
            {items.length === 0
              ? "Mostre ambiente, estrutura, bastidores e experiências para quem está conhecendo sua produção."
              : recommendedMissing > 0
                ? `Adicione mais ${recommendedMissing} ${recommendedMissing === 1 ? "foto" : "fotos"} para deixar a página mais completa.`
                : "Sua galeria já tem uma boa base visual. Reordene e destaque as melhores imagens."}
          </p>
        </div>
        <div className="cut-gallery-manager__score">
          <strong>{items.length}<small>/{LIMIT}</small></strong>
          <span>{items.length >= 4 ? "Boa galeria" : "Fotos publicadas"}</span>
        </div>
      </div>

      <div className="cut-gallery-manager__checklist" aria-label="Conclusão visual da produção">
        <span className="is-done"><i className="fa-solid fa-circle-check" />Identidade</span>
        <span className={locationReady ? "is-done" : "is-pending"}><i className={locationReady ? "fa-solid fa-circle-check" : "fa-regular fa-circle"} />Localização</span>
        <span className={coverUrl ? "is-done" : "is-pending"}><i className={coverUrl ? "fa-solid fa-circle-check" : "fa-regular fa-circle"} />Capa</span>
        <span className={items.length >= 4 ? "is-done" : "is-pending"}><i className={items.length >= 4 ? "fa-solid fa-circle-check" : "fa-regular fa-circle"} />Galeria {Math.min(items.length, 4)}/4</span>
      </div>

      <div className="cut-gallery-manager__toolbar">
        <div className="cut-gallery-manager__toolbar-primary">
          <Button type="button" onClick={() => inputRef.current?.click()} disabled={remaining <= 0}>
            <i className="fa-solid fa-plus me-2" />Adicionar fotos
          </Button>
          <input
            ref={inputRef}
            type="file"
            hidden
            multiple
            accept="image/jpeg,image/png,image/webp"
            onChange={onFileChange}
          />
          <Button
            type="button"
            variant={selectionMode ? "light" : "outline-light"}
            onClick={() => selectionMode ? exitSelection() : setSelectionMode(true)}
            disabled={!items.length}
          >
            <i className="fa-regular fa-square-check me-2" />{selectionMode ? "Concluir seleção" : "Gerenciar / selecionar"}
          </Button>
          {publicSlug && (
            <Button
              as="a"
              variant="outline-light"
              href={`/production/${publicSlug}/public#galeria`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <i className="fa-regular fa-eye me-2" />Ver como visitante
            </Button>
          )}
        </div>

        <details className="cut-gallery-manager__more">
          <summary><i className="fa-solid fa-sliders" />Mais opções</summary>
          <div className="cut-gallery-manager__more-panel">
            <div className="cut-gallery-manager__more-actions">
              <Button type="button" size="sm" variant="outline-light" onClick={createAlbum}>
                <i className="fa-regular fa-folder-open me-2" />Novo álbum
              </Button>
              {coverUrl && remaining > 0 && (
                <Button type="button" size="sm" variant="outline-light" onClick={importCover}>
                  <i className="fa-regular fa-copy me-2" />Adicionar capa à galeria
                </Button>
              )}
              <Button type="button" size="sm" variant="outline-light" disabled={!items.length || smartBusy} onClick={loadSmartAnalysis}>
                <i className={smartBusy ? "fa-solid fa-circle-notch fa-spin me-2" : "fa-solid fa-wand-magic-sparkles me-2"} />
                {smartBusy ? "Analisando..." : "Analisar galeria"}
              </Button>
            </div>

            <div className="cut-gallery-manager__toolbar-secondary">
              <div className="cut-gallery-manager__mode" role="group" aria-label="Modo da galeria">
                <button type="button" className={mode === "manage" ? "is-active" : ""} onClick={() => setMode("manage")}>Gerenciar</button>
                <button type="button" className={mode === "view" ? "is-active" : ""} onClick={() => { setMode("view"); exitSelection(); }}>Visualizar</button>
              </div>
              <Form.Select
                size="sm"
                value={filterAlbum}
                onChange={(event) => setFilterAlbum(event.target.value)}
                aria-label="Filtrar galeria por álbum"
              >
                <option value="all">Todas as fotos</option>
                <option value="">Galeria principal</option>
                {localAlbums.map((album) => <option key={album.id} value={album.id}>{album.name}</option>)}
              </Form.Select>
              <Form.Select
                size="sm"
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value)}
                aria-label="Ordenação da galeria"
              >
                <option value="custom">Ordem personalizada</option>
                <option value="recent">Mais recentes</option>
              </Form.Select>
              {orderStatus && <span className="cut-gallery-manager__order-status"><i className="fa-solid fa-check" />{orderStatus}</span>}
            </div>
          </div>
        </details>
      </div>

      {localAlbums.length > 0 && (
        <div className="cut-gallery-manager__albums" aria-label="Álbuns da produção">
          <span>Álbuns:</span>
          {localAlbums.map((album) => (
            <span className="cut-gallery-manager__album" key={album.id}>
              <i className="fa-regular fa-folder" />{album.name}
              <button type="button" onClick={() => deleteAlbum(album)} aria-label={`Remover álbum ${album.name}`}><i className="fa-solid fa-xmark" /></button>
            </span>
          ))}
        </div>
      )}

      {smartOpen && (
        <section className="cut-gallery-smart" aria-label="Análise inteligente da galeria">
          <div className="cut-gallery-smart__head">
            <div>
              <span className="cut-eyebrow">Análise visual</span>
              <h4>Qualidade, capa e fotos semelhantes</h4>
              <p>A Cutinapp compara resolução, formato, exposição, detalhes e semelhança visual sem bloquear sua publicação.</p>
            </div>
            <button type="button" onClick={() => setSmartOpen(false)} aria-label="Fechar análise"><i className="fa-solid fa-xmark" /></button>
          </div>

          {recommendations.length > 0 && (
            <div className="cut-gallery-smart__recommendations">
              <strong>Sugestões para capa</strong>
              <div className="cut-gallery-smart__recommendation-grid">
                {recommendations.slice(0, 3).map((item, index) => (
                  <article key={item.id} className={index === 0 ? "is-top" : ""}>
                    <img src={item.thumbnail_url || item.url} alt={item.alt_text || item.caption || ("Foto de " + productionName)} loading="lazy" />
                    <div>
                      <span>Nota visual {item.recommendation?.score ?? item.cover_score ?? 0}/100</span>
                      <strong>{index === 0 ? "Melhor opção atual" : ("Opção " + (index + 1))}</strong>
                      <small>{(item.recommendation?.reasons || []).join(" · ")}</small>
                    </div>
                    <div className="cut-gallery-smart__actions">
                      <Button type="button" size="sm" variant="outline-light" onClick={() => openEditor(item)}>Gerenciar</Button>
                      <Button type="button" size="sm" disabled={editBusy} onClick={() => useRecommendedAsCover(item)}>Usar como capa</Button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          <div className="cut-gallery-smart__similar">
            <div className="cut-gallery-smart__similar-head">
              <strong>Fotos muito parecidas</strong>
              <span>{similarPairs.length ? (similarPairs.length + (similarPairs.length === 1 ? " par encontrado" : " pares encontrados")) : "Nenhuma repetição visual forte encontrada"}</span>
            </div>
            {similarPairs.slice(0, 6).map((pair) => (
              <article key={String(pair.left.id) + ":" + String(pair.right.id)}>
                <button type="button" onClick={() => openEditor(pair.left)} aria-label="Gerenciar primeira foto semelhante">
                  <img src={pair.left.thumbnail_url || pair.left.url} alt="" loading="lazy" />
                </button>
                <div>
                  <strong>{pair.similarity}% semelhantes</strong>
                  <span>Compare antes de excluir; a Cutinapp apenas sugere.</span>
                </div>
                <button type="button" onClick={() => openEditor(pair.right)} aria-label="Gerenciar segunda foto semelhante">
                  <img src={pair.right.thumbnail_url || pair.right.url} alt="" loading="lazy" />
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      {selectionMode && (
        <div className="cut-gallery-manager__selection">
          <strong>{selectedCount} {selectedCount === 1 ? "foto selecionada" : "fotos selecionadas"}</strong>
          <div>
            <Button type="button" size="sm" variant="outline-light" onClick={selectAll}>Selecionar todas</Button>
            <Button type="button" size="sm" variant="outline-light" disabled={!selectedCount} onClick={() => setSelectedIds(new Set())}>Desmarcar todas</Button>
            <Form.Select
              size="sm"
              value={bulkAlbumId}
              onChange={(event) => setBulkAlbumId(event.target.value)}
              aria-label="Mover fotos selecionadas para álbum"
              disabled={!selectedCount}
            >
              <option value="">Galeria principal</option>
              {localAlbums.map((album) => <option key={album.id} value={album.id}>{album.name}</option>)}
            </Form.Select>
            <Button type="button" size="sm" variant="outline-light" disabled={!selectedCount} onClick={moveSelectedToAlbum}>
              <i className="fa-regular fa-folder me-2" />Mover
            </Button>
            <Button type="button" size="sm" variant="danger" disabled={!selectedCount} onClick={() => deleteIds(Array.from(selectedIds))}>
              <i className="fa-regular fa-trash-can me-2" />Remover
            </Button>
          </div>
        </div>
      )}

      {message && <Alert variant="success" dismissible onClose={() => setMessage("")}>{message}</Alert>}
      {error && <Alert variant="danger" dismissible onClose={() => setError("")}>{error}</Alert>}
      {undo && (
        <Alert variant="warning" className="cut-gallery-manager__undo">
          <span>Você removeu {undo.ids.length === 1 ? "uma foto" : `${undo.ids.length} fotos`}.</span>
          <Button type="button" size="sm" variant="warning" onClick={undoDelete}>Desfazer</Button>
        </Alert>
      )}

      <div
        className={`cut-gallery-dropzone ${dropActive ? "is-active" : ""} ${remaining <= 0 ? "is-disabled" : ""}`}
        onDragEnter={(event) => { event.preventDefault(); if (remaining > 0) setDropActive(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => { if (event.currentTarget === event.target) setDropActive(false); }}
        onDrop={onDrop}
        onClick={() => remaining > 0 && inputRef.current?.click()}
        role="button"
        tabIndex={remaining > 0 ? 0 : -1}
        onKeyDown={(event) => {
          if (remaining > 0 && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        aria-label="Adicionar fotos à galeria"
      >
        <i className="fa-solid fa-cloud-arrow-up" />
        <div>
          <strong>{remaining > 0 ? "Arraste fotos para cá ou clique para escolher" : "Galeria completa"}</strong>
          <span>{remaining > 0 ? `JPG, PNG ou WebP · até 10 MB · recomendado 1200 × 900 px ou maior · ${remaining} espaços disponíveis` : `Limite de ${LIMIT} fotos atingido`}</span>
        </div>
      </div>

      {queue.length > 0 && (
        <section className="cut-gallery-upload-queue" aria-label="Fila de envio">
          <div className="cut-gallery-upload-queue__head">
            <div>
              <strong>Fila de upload</strong>
              <span>{queue.length} {queue.length === 1 ? "arquivo" : "arquivos"}</span>
            </div>
            <div>
              {queue.some((item) => item.status === "done") && <Button type="button" size="sm" variant="outline-light" onClick={clearCompletedQueue}>Limpar concluídos</Button>}
              {uploading && <Button type="button" size="sm" variant="outline-danger" onClick={cancelAllUploads}>Cancelar envios</Button>}
              <Button type="button" size="sm" disabled={uploading || !queue.some((item) => ["pending", "error", "cancelled"].includes(item.status))} onClick={uploadQueue}>
                {uploading ? "Enviando..." : "Publicar selecionadas"}
              </Button>
            </div>
          </div>
          {uploading && <ProgressBar now={overallUploadProgress} label={`${overallUploadProgress}%`} />}
          <div className="cut-gallery-upload-queue__items">
            {queue.map((item) => (
              <article key={item.id} className={`cut-gallery-upload-item is-${item.status}`}>
                <img src={item.preview} alt="" />
                <div className="cut-gallery-upload-item__body">
                  <div className="cut-gallery-upload-item__name">
                    <strong title={item.file.name}>{item.file.name}</strong>
                    <span>{humanBytes(item.file.size)}</span>
                  </div>
                  <Form.Control
                    size="sm"
                    value={item.caption}
                    maxLength={180}
                    disabled={item.status === "uploading" || item.status === "done"}
                    onChange={(event) => updateQueueItem(item.id, { caption: event.target.value })}
                    placeholder="Legenda individual opcional"
                    aria-label={`Legenda de ${item.file.name}`}
                  />
                  {(item.status === "uploading" || item.progress > 0) && <ProgressBar now={item.progress} />}
                  {item.error && <small className="text-danger">{item.error}</small>}
                  {item.warnings?.map((warning) => <small className="text-warning" key={`${item.id}:${warning}`}>{warning}</small>)}
                </div>
                <button
                  type="button"
                  className="cut-gallery-upload-item__remove"
                  onClick={() => removeQueueItem(item.id)}
                  aria-label={item.status === "uploading" ? `Cancelar envio de ${item.file.name}` : `Remover ${item.file.name} da fila`}
                  title={item.status === "uploading" ? "Cancelar envio" : "Remover da fila"}
                >
                  <i className="fa-solid fa-xmark" />
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      {items.length === 0 ? (
        <div className="cut-gallery-manager__empty">
          <i className="fa-regular fa-images" />
          <strong>Sua galeria ainda está vazia</strong>
          <p>
            {productionType === "fixed"
              ? "Comece com fotos da entrada, pista, palco, bar, camarote, mesas e área externa."
              : "Comece com eventos anteriores, bastidores, estrutura, equipe e momentos que representem sua produção."}
          </p>
          <Button type="button" onClick={() => inputRef.current?.click()}><i className="fa-solid fa-plus me-2" />Adicionar primeiras fotos</Button>
        </div>
      ) : displayedItems.length === 0 ? (
        <div className="cut-gallery-manager__filter-empty">
          <i className="fa-regular fa-folder-open" />
          <strong>Nenhuma foto neste filtro</strong>
          <span>Escolha outro álbum ou volte para “Todas as fotos”.</span>
          <Button type="button" size="sm" variant="outline-light" onClick={() => setFilterAlbum("all")}>Mostrar todas</Button>
        </div>
      ) : (
        <div className={`cut-gallery-manager__grid is-${mode}`}>
          {displayedItems.map((item, index) => {
            const selected = selectedIds.has(Number(item.id));
            return (
              <article
                key={item.id}
                data-gallery-media-id={item.id}
                className={`cut-gallery-card ${selected ? "is-selected" : ""} ${item.is_featured ? "is-featured" : ""}`}
                draggable={mode === "manage" && sortMode === "custom" && !selectionMode}
                onDragStart={() => setDraggedId(item.id)}
                onDragOver={(event) => { if (draggedId) event.preventDefault(); }}
                onDrop={(event) => { event.preventDefault(); handleDropOnCard(item.id); }}
                tabIndex={mode === "manage" && sortMode === "custom" && !selectionMode ? 0 : -1}
                onKeyDown={(event) => {
                  if (!(event.altKey || event.ctrlKey) || sortMode !== "custom" || selectionMode) return;
                  if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                    event.preventDefault();
                    moveItem(item.id, -1);
                  } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                    event.preventDefault();
                    moveItem(item.id, 1);
                  }
                }}
                aria-label={mode === "manage" ? ("Foto " + (index + 1) + ". Use Alt mais setas para reorganizar.") : undefined}
              >
                <button
                  type="button"
                  className="cut-gallery-card__image"
                  onClick={() => {
                    if (selectionMode) toggleSelected(item.id);
                    else if (mode === "view") setPreviewingId(item.id);
                    else openEditor(item);
                  }}
                  aria-label={selectionMode ? `${selected ? "Desmarcar" : "Selecionar"} foto ${index + 1}` : mode === "view" ? `Visualizar foto ${index + 1}` : `Gerenciar foto ${index + 1}`}
                >
                  <img
                    src={item.thumbnail_url || item.url}
                    alt={item.alt_text || item.caption || `Foto de ${productionName}`}
                    loading="lazy"
                    decoding="async"
                    style={{ objectPosition: `${item.focal_x ?? 50}% ${item.focal_y ?? 50}%` }}
                    onLoad={(event) => event.currentTarget.parentElement?.classList.add("is-loaded")}
                    onError={(event) => {
                      event.currentTarget.style.display = "none";
                      event.currentTarget.parentElement?.classList.add("has-error");
                    }}
                  />
                </button>

                {item.is_featured && <span className="cut-gallery-card__featured"><i className="fa-solid fa-star" />Destaque</span>}
                {Number(item.id) === Number(recommendedCoverId) && !item.is_featured && <span className="cut-gallery-card__cover-tip"><i className="fa-solid fa-wand-magic-sparkles" />Boa para capa</span>}
                {item.album_id && <span className="cut-gallery-card__album"><i className="fa-regular fa-folder" />{localAlbums.find((album) => Number(album.id) === Number(item.album_id))?.name || "Álbum"}</span>}
                {selectionMode && (
                  <button type="button" className={`cut-gallery-card__check ${selected ? "is-selected" : ""}`} onClick={() => toggleSelected(item.id)} aria-label={selected ? "Desmarcar foto" : "Selecionar foto"}>
                    <i className={selected ? "fa-solid fa-circle-check" : "fa-regular fa-circle"} />
                  </button>
                )}

                {mode === "manage" && !selectionMode && (
                  <>
                    <button
                      type="button"
                      className="cut-gallery-card__index"
                      title="Arraste para reorganizar"
                      aria-label={"Arrastar foto " + (index + 1) + " para outra posição"}
                      onTouchStart={() => setDraggedId(item.id)}
                      onTouchEnd={(event) => handleTouchReorderEnd(event, item.id)}
                    >
                      <i className="fa-solid fa-grip" />
                      <span>{String(index + 1).padStart(2, "0")}</span>
                    </button>
                    <button type="button" className="cut-gallery-card__edit" onClick={() => openEditor(item)} aria-label={`Gerenciar foto ${index + 1}`} title="Gerenciar foto">
                      <i className="fa-solid fa-ellipsis" />
                    </button>
                    {sortMode === "custom" && (
                      <div className="cut-gallery-card__move" aria-label="Alterar posição">
                        <button type="button" disabled={index === 0} onClick={() => moveItem(item.id, -1)} aria-label="Mover foto para trás"><i className="fa-solid fa-chevron-left" /></button>
                        <button type="button" disabled={index === displayedItems.length - 1} onClick={() => moveItem(item.id, 1)} aria-label="Mover foto para frente"><i className="fa-solid fa-chevron-right" /></button>
                      </div>
                    )}
                  </>
                )}
                {item.caption && <span className="cut-gallery-card__caption-indicator" title={item.caption} aria-label="Esta foto possui legenda"><i className="fa-solid fa-align-left" /></span>}
              </article>
            );
          })}
        </div>
      )}

      <Modal show={Boolean(previewing)} onHide={() => setPreviewingId(null)} centered size="lg" className="cut-gallery-manager-preview">
        <Modal.Header closeButton>
          <Modal.Title>Prévia da foto</Modal.Title>
          {previewing && <span className="cut-gallery-manager-preview__count">{previewingIndex + 1} de {displayedItems.length}</span>}
        </Modal.Header>
        <Modal.Body>
          {previewing && (
            <>
              <div className="cut-gallery-manager-preview__stage">
                {displayedItems.length > 1 && <button type="button" className="is-prev" onClick={() => movePreview(-1)} aria-label="Foto anterior"><i className="fa-solid fa-chevron-left" /></button>}
                <img src={previewing.url} alt={previewing.alt_text || previewing.caption || `Foto de ${productionName}`} />
                {displayedItems.length > 1 && <button type="button" className="is-next" onClick={() => movePreview(1)} aria-label="Próxima foto"><i className="fa-solid fa-chevron-right" /></button>}
              </div>
              {previewing.caption && <p className="cut-gallery-manager-preview__caption">{previewing.caption}</p>}
            </>
          )}
        </Modal.Body>
      </Modal>

      <Offcanvas
        show={Boolean(editing)}
        onHide={() => !editBusy && setEditing(null)}
        placement="end"
        className="cut-gallery-editor-panel"
        backdrop={editBusy ? "static" : true}
        keyboard={!editBusy}
        scroll={false}
      >
        <Offcanvas.Header closeButton={!editBusy}>
          <Offcanvas.Title>Gerenciar foto</Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body>
          {editing && (
            <div className="cut-gallery-editor">
              <div className="cut-gallery-editor__preview">
                <div className={"cut-gallery-editor__crop-preview is-" + cropAspect}>
                  <img
                    src={editing.url}
                    alt={editAlt || editCaption || ("Foto de " + productionName)}
                    style={{
                      objectPosition: String(editFocalX) + "% " + String(editFocalY) + "%",
                      transform: "scale(" + (Number(cropZoom) / 100) + ")",
                    }}
                    onError={(event) => event.currentTarget.parentElement?.classList.add("has-error")}
                  />
                  <span className="cut-gallery-editor__crop-grid" aria-hidden="true" />
                </div>
                <div className="cut-gallery-editor__preview-actions">
                  <Button type="button" size="sm" variant="dark" disabled={editBusy} onClick={() => rotate(90)}><i className="fa-solid fa-rotate-right me-2" />Girar</Button>
                  <Button type="button" size="sm" variant="dark" disabled={editBusy} onClick={() => reprocessImage()}><i className="fa-solid fa-arrows-rotate me-2" />Reprocessar</Button>
                  <Form.Label className="btn btn-sm btn-dark mb-0">
                    <i className="fa-solid fa-image me-2" />Substituir
                    <Form.Control type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={replaceImage} disabled={editBusy} />
                  </Form.Label>
                </div>
                {replaceProgress > 0 && <ProgressBar now={replaceProgress} label={String(replaceProgress) + "%"} />}
              </div>

              <div className="cut-gallery-editor__form">
                <Form.Group>
                  <div className="d-flex align-items-center justify-content-between gap-2 mb-1">
                    <Form.Label className="mb-0">Legenda</Form.Label>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline-light"
                      disabled={!editCaption.trim() || Boolean(aiBusy)}
                      onClick={improveCaptionWithAi}
                    >
                      <i className={aiBusy === "caption" ? "fa-solid fa-circle-notch fa-spin me-2" : "fa-solid fa-wand-magic-sparkles me-2"} />
                      Aprimorar com IA
                    </Button>
                  </div>
                  <Form.Control as="textarea" rows={3} maxLength={180} value={editCaption} onChange={(event) => setEditCaption(event.target.value)} placeholder="Explique o que aparece nesta foto." />
                  <Form.Text>{editCaption.length}/180 · A IA só aprimora o que você informar, sem inventar elementos da foto.</Form.Text>
                </Form.Group>

                <Form.Group>
                  <div className="d-flex align-items-center justify-content-between gap-2 mb-1">
                    <Form.Label className="mb-0">Texto alternativo</Form.Label>
                    <div className="d-flex gap-1">
                      <Button type="button" size="sm" variant="outline-light" onClick={suggestAlt}>Sugerir</Button>
                      <Button type="button" size="sm" variant="outline-light" disabled={Boolean(aiBusy)} onClick={suggestAltWithAi}>
                        <i className={aiBusy === "alt" ? "fa-solid fa-circle-notch fa-spin me-1" : "fa-solid fa-wand-magic-sparkles me-1"} />IA
                      </Button>
                    </div>
                  </div>
                  <Form.Control maxLength={255} value={editAlt} onChange={(event) => setEditAlt(event.target.value)} placeholder="Descreva a imagem para acessibilidade e SEO." />
                </Form.Group>

                <Form.Group>
                  <Form.Label>Álbum</Form.Label>
                  <Form.Select value={editAlbumId} onChange={(event) => setEditAlbumId(event.target.value)}>
                    <option value="">Galeria principal</option>
                    {localAlbums.map((album) => <option key={album.id} value={album.id}>{album.name}</option>)}
                  </Form.Select>
                </Form.Group>

                <section className="cut-gallery-editor__crop-controls">
                  <div className="cut-gallery-editor__crop-heading">
                    <div>
                      <strong>Recorte real</strong>
                      <span>O original fica preservado para você poder reprocessar depois.</span>
                    </div>
                    <Button type="button" size="sm" disabled={editBusy} onClick={applyCrop}>
                      <i className="fa-solid fa-crop-simple me-2" />Aplicar recorte
                    </Button>
                  </div>
                  <div className="cut-gallery-editor__crop-ratios" role="group" aria-label="Formato do recorte">
                    {[
                      ["square", "1:1"],
                      ["portrait", "4:5"],
                      ["landscape", "4:3"],
                      ["cover", "Capa"],
                    ].map(([value, label]) => (
                      <button type="button" key={value} className={cropAspect === value ? "is-active" : ""} onClick={() => setCropAspect(value)}>{label}</button>
                    ))}
                  </div>
                  <Form.Group>
                    <div className="d-flex justify-content-between gap-2">
                      <Form.Label>Zoom do recorte</Form.Label>
                      <span className="cut-gallery-editor__crop-value">{cropZoom}%</span>
                    </div>
                    <Form.Range min={100} max={300} step={5} value={cropZoom} onChange={(event) => setCropZoom(Number(event.target.value))} />
                  </Form.Group>
                </section>

                <div className="cut-gallery-editor__focal">
                  <div>
                    <Form.Label>Enquadramento horizontal</Form.Label>
                    <Form.Range min={0} max={100} value={editFocalX} onChange={(event) => setEditFocalX(Number(event.target.value))} />
                  </div>
                  <div>
                    <Form.Label>Enquadramento vertical</Form.Label>
                    <Form.Range min={0} max={100} value={editFocalY} onChange={(event) => setEditFocalY(Number(event.target.value))} />
                  </div>
                </div>

                <div>
                  <Form.Check
                    type="switch"
                    id="production-media-featured"
                    checked={editFeatured}
                    onChange={(event) => setEditFeatured(event.target.checked)}
                    label="Destacar esta foto na galeria"
                  />
                  <Form.Text>Você pode destacar até 6 imagens para dar mais presença visual à página pública.</Form.Text>
                </div>

                <div className="cut-gallery-editor__meta">
                  {editing.width && editing.height && <span><i className="fa-solid fa-expand" />{editing.width} × {editing.height}</span>}
                  {editing.file_size && <span><i className="fa-regular fa-file-image" />{humanBytes(editing.file_size)}</span>}
                  {editing.cover_score != null && <span><i className="fa-solid fa-wand-magic-sparkles" />Capa {editing.cover_score}/100</span>}
                  {editing.brightness_score != null && <span><i className="fa-regular fa-sun" />Luz {editing.brightness_score}/100</span>}
                  {editing.sharpness_score != null && <span><i className="fa-solid fa-crosshairs" />Detalhe {editing.sharpness_score}/100</span>}
                  {editing.created_at && <span><i className="fa-regular fa-clock" />{new Date(editing.created_at).toLocaleDateString("pt-BR")}</span>}
                  {editing.uploaded_by?.name && <span><i className="fa-regular fa-user" />{editing.uploaded_by.name}</span>}
                </div>

                <div className="cut-gallery-editor__secondary-actions">
                  <Button type="button" variant="outline-light" disabled={editBusy || Number(editing.position) === 0} onClick={() => makePrimary(editing.id)}><i className="fa-solid fa-arrow-up me-2" />Foto principal</Button>
                  <Button type="button" variant="outline-light" disabled={editBusy} onClick={useAsCover}><i className="fa-regular fa-image me-2" />Usar como capa</Button>
                  {editing.original_url && <Button as="a" variant="outline-light" href={editing.original_url} target="_blank" rel="noopener noreferrer" download={editing.original_name || true}><i className="fa-solid fa-arrow-down me-2" />Baixar original</Button>}
                  <Button type="button" variant="outline-danger" disabled={editBusy} onClick={() => deleteIds([Number(editing.id)])}><i className="fa-regular fa-trash-can me-2" />Remover</Button>
                </div>
              </div>
            </div>
          )}
          <div className="cut-gallery-editor-panel__footer">
            <Button type="button" variant="outline-light" disabled={editBusy} onClick={() => setEditing(null)}>Cancelar</Button>
            <Button type="button" disabled={editBusy} onClick={saveEdit}>{editBusy ? "Salvando..." : "Salvar alterações"}</Button>
          </div>
        </Offcanvas.Body>
      </Offcanvas>
    </div>
  );
}

ProductionGalleryManager.propTypes = {
  organizationId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
  productionName: PropTypes.string.isRequired,
  productionType: PropTypes.string,
  media: PropTypes.arrayOf(PropTypes.object),
  albums: PropTypes.arrayOf(PropTypes.object),
  publicSlug: PropTypes.string,
  coverUrl: PropTypes.string,
  locationReady: PropTypes.bool,
  onMediaChange: PropTypes.func,
  onAlbumsChange: PropTypes.func,
  onCoverChange: PropTypes.func,
};
