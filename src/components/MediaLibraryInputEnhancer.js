import React, { useEffect, useMemo, useState } from "react";
import { Alert, Button, Form, Modal, Spinner } from "react-bootstrap";
import producerMediaLibraryService from "../services/ProducerMediaLibraryService";
import { isEligibleMediaLibraryInput, mediaLibraryTypeForInput } from "../utils/mediaLibraryInput";
import "./MediaLibraryInputEnhancer.css";

const safeFilename = (value) => String(value || "midia")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-zA-Z0-9-_]+/g, "-")
  .replace(/^-+|-+$/g, "") || "midia";

const extensionFrom = (item, mimeType) => {
  const pathExtension = String(item?.path || "").split("?")[0].split(".").pop();
  if (pathExtension && /^[a-z0-9]{2,5}$/i.test(pathExtension)) return pathExtension.toLowerCase();

  const mimeMap = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/aac": "aac",
    "audio/ogg": "ogg",
    "audio/wav": "wav",
    "audio/webm": "webm",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
  };
  return mimeMap[String(mimeType || "").toLowerCase()] || "bin";
};

const fileMatchesInputAccept = (input, file) => {
  const accept = String(input?.accept || "").trim().toLowerCase();
  if (!accept || accept === "*/*") return true;

  const fileType = String(file?.type || "").toLowerCase();
  const fileName = String(file?.name || "").toLowerCase();

  return accept.split(",").some((token) => {
    const normalized = token.trim();
    if (!normalized) return false;
    if (normalized.endsWith("/*")) return fileType.startsWith(normalized.slice(0, -1));
    if (normalized.startsWith(".")) return fileName.endsWith(normalized);
    return normalized === fileType;
  });
};

const triggerTarget = (input) => {
  if (!input) return null;
  if (input.hidden || input.classList.contains("visually-hidden")) {
    return input.closest("label") || input;
  }
  return input;
};

const formatDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(date);
};

const mediaIcon = (type) => ({
  audio: "fa-solid fa-music",
  video: "fa-solid fa-video",
  image: "fa-regular fa-image",
}[type] || "fa-solid fa-photo-film");

export default function MediaLibraryInputEnhancer() {
  const [targetInput, setTargetInput] = useState(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectingId, setSelectingId] = useState(null);
  const [error, setError] = useState("");

  const show = Boolean(targetInput);
  const targetType = useMemo(() => mediaLibraryTypeForInput(targetInput), [targetInput]);
  const targetLabel = useMemo(() => {
    if (!targetInput) return "mídia";
    const group = targetInput.closest(".form-group, .mb-3, .card, fieldset");
    const label = group?.querySelector("label")?.textContent?.trim();
    return label || targetInput.getAttribute("aria-label") || targetInput.name || "mídia";
  }, [targetInput]);

  useEffect(() => {
    const open = (event) => {
      const input = event?.detail?.input;
      if (!isEligibleMediaLibraryInput(input)) return;
      setTargetInput(input);
      setQuery("");
      setPage(1);
      setError("");
    };

    window.addEventListener("cutinapp:open-media-library", open);
    return () => window.removeEventListener("cutinapp:open-media-library", open);
  }, []);

  useEffect(() => {
    const buttons = new Set();

    const enhance = (root = document) => {
      const candidates = root instanceof HTMLInputElement
        ? [root]
        : Array.from(root.querySelectorAll?.('input[type="file"]') || []);

      candidates.forEach((input) => {
        if (!isEligibleMediaLibraryInput(input)) return;

        const existingId = input.dataset.mediaLibraryTriggerId;
        if (existingId && document.getElementById(existingId)) return;
        delete input.dataset.mediaLibraryEnhanced;
        delete input.dataset.mediaLibraryTriggerId;

        const anchor = triggerTarget(input);
        if (!anchor?.parentNode) return;

        const button = document.createElement("button");
        const triggerId = `cut-media-library-trigger-${Math.random().toString(36).slice(2, 10)}`;
        button.id = triggerId;
        button.type = "button";
        button.className = "btn btn-outline-light btn-sm cut-media-library-trigger";
        button.dataset.mediaLibraryTrigger = "true";
        button.innerHTML = '<i class="fa-solid fa-photo-film" aria-hidden="true"></i><span>Escolher da biblioteca</span>';
        button.disabled = input.disabled;
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          window.dispatchEvent(new CustomEvent("cutinapp:open-media-library", { detail: { input } }));
        });

        anchor.parentNode.insertBefore(button, anchor.nextSibling);
        input.dataset.mediaLibraryEnhanced = "true";
        input.dataset.mediaLibraryTriggerId = triggerId;
        buttons.add(button);
      });
    };

    enhance(document);

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          enhance(node);
        });

        if (mutation.target instanceof HTMLElement) enhance(mutation.target);
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      buttons.forEach((button) => button.remove());
      document.querySelectorAll('input[data-media-library-enhanced="true"]').forEach((input) => {
        delete input.dataset.mediaLibraryEnhanced;
        delete input.dataset.mediaLibraryTriggerId;
      });
    };
  }, []);

  useEffect(() => {
    if (!show) return undefined;
    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const response = await producerMediaLibraryService.list({
          q: query.trim() || undefined,
          type: targetType || undefined,
          page,
          per_page: 18,
        });
        if (!active) return;
        setItems(Array.isArray(response?.data) ? response.data : []);
        setLastPage(Math.max(1, Number(response?.last_page || 1)));
      } catch (err) {
        if (!active) return;
        setItems([]);
        setError(err?.response?.data?.message || err?.message || "Não foi possível abrir sua biblioteca de mídias.");
      } finally {
        if (active) setLoading(false);
      }
    }, 180);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [show, query, page, targetType]);

  const close = () => {
    if (selectingId) return;
    setTargetInput(null);
    setItems([]);
    setError("");
  };

  const choose = async (item) => {
    if (!targetInput || !document.body.contains(targetInput) || !item?.id || selectingId) return;

    setSelectingId(item.id);
    setError("");
    try {
      const blob = await producerMediaLibraryService.downloadItem(item);
      const mimeType = blob?.type || item.mime_type || "application/octet-stream";
      const extension = extensionFrom(item, mimeType);
      const file = new File(
        [blob],
        `${safeFilename(item.media_title || item.event_title || item.production_name || "midia")}.${extension}`,
        { type: mimeType, lastModified: Date.now() }
      );

      if (!fileMatchesInputAccept(targetInput, file)) {
        throw new Error("Esta mídia não é compatível com o formato aceito neste campo.");
      }

      if (typeof DataTransfer === "undefined") {
        throw new Error("Seu navegador não permite selecionar um arquivo da biblioteca neste campo.");
      }

      const transfer = new DataTransfer();
      transfer.items.add(file);
      targetInput.files = transfer.files;
      targetInput.dispatchEvent(new Event("change", { bubbles: true }));
      window.dispatchEvent(new CustomEvent("cutinapp:media-library-selected", {
        detail: { file, item, inputName: targetInput.name || null },
      }));
      setTargetInput(null);
      setItems([]);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Não foi possível usar esta mídia.");
    } finally {
      setSelectingId(null);
    }
  };

  return (
    <Modal show={show} onHide={close} centered size="lg" scrollable className="cut-media-library-picker">
      <Modal.Header closeButton={!selectingId}>
        <div>
          <span className="cut-eyebrow">Sua biblioteca</span>
          <Modal.Title>Escolher mídia</Modal.Title>
          <small className="text-secondary">Selecionando para: {targetLabel}</small>
        </div>
      </Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger" dismissible onClose={() => setError("")}>{error}</Alert>}

        <Form.Control
          type="search"
          value={query}
          placeholder="Buscar por mídia, evento ou produção"
          onChange={(event) => { setQuery(event.target.value); setPage(1); }}
          autoFocus
        />

        {loading ? (
          <div className="cut-media-library-picker__loading">
            <Spinner animation="border" size="sm" />
            <span>Carregando sua biblioteca...</span>
          </div>
        ) : items.length === 0 ? (
          <div className="cut-media-library-picker__empty">
            <i className="fa-solid fa-photo-film" />
            <strong>Nenhuma mídia compatível encontrada</strong>
            <span>Você pode continuar enviando um arquivo novo. As mídias reutilizáveis aparecerão aqui automaticamente.</span>
          </div>
        ) : (
          <div className="cut-media-library-picker__grid">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                className="cut-media-library-picker__item"
                disabled={item.available === false || Boolean(selectingId)}
                onClick={() => choose(item)}
              >
                <span className={`cut-media-library-picker__thumb is-${item.type || "file"}`}>
                  {item.type === "image" && item.url
                    ? <img src={item.url} alt="" loading="lazy" />
                    : <i className={mediaIcon(item.type)} />}
                  {selectingId === item.id && <span className="cut-media-library-picker__selecting"><Spinner animation="border" size="sm" /></span>}
                </span>
                <span className="cut-media-library-picker__copy">
                  <strong>{item.media_title || item.event_title || "Mídia"}</strong>
                  <small>{item.production_name || "Produção"}{formatDate(item.event_start_date) ? ` · ${formatDate(item.event_start_date)}` : ""}</small>
                </span>
              </button>
            ))}
          </div>
        )}

        {!loading && lastPage > 1 && (
          <div className="cut-media-library-picker__pagination">
            <Button variant="outline-light" size="sm" disabled={page <= 1 || Boolean(selectingId)} onClick={() => setPage((current) => Math.max(1, current - 1))}>Anterior</Button>
            <span>Página {page} de {lastPage}</span>
            <Button variant="outline-light" size="sm" disabled={page >= lastPage || Boolean(selectingId)} onClick={() => setPage((current) => Math.min(lastPage, current + 1))}>Próxima</Button>
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={close} disabled={Boolean(selectingId)}>Cancelar</Button>
      </Modal.Footer>
    </Modal>
  );
}
