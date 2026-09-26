import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Modal, Spinner } from "react-bootstrap";
import creativeService from "../services/CreativeService";
import "./GlobalFlyerDateGuard.css";

const ALLOWED = /^image\/(?:jpeg|jpg|png|webp)$/i;

const readFile = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ""));
  reader.onerror = () => reject(new Error("Não foi possível ler o flyer."));
  reader.readAsDataURL(file);
});

const urlToDataUrl = async (url) => {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error("Não foi possível carregar o flyer atual.");
  const blob = await response.blob();
  if (!ALLOWED.test(blob.type) || blob.size > 5 * 1024 * 1024) throw new Error("Use um flyer JPG, PNG ou WebP de até 5 MB.");
  return readFile(new File([blob], "flyer-original", { type: blob.type }));
};

const dataUrlToFile = (dataUrl) => {
  const [header, body] = String(dataUrl || "").split(",", 2);
  const mime = header.match(/^data:([^;]+);base64$/i)?.[1] || "image/jpeg";
  const bytes = atob(body || "");
  const array = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) array[index] = bytes.charCodeAt(index);
  return new File([array], `flyer-data-revisada-${Date.now()}.jpg`, { type: mime });
};

const fieldValue = (...names) => {
  for (const name of names) {
    const field = document.querySelector(`[name="${name}"]`);
    if (field?.value) return String(field.value).trim();
  }
  return "";
};

const findImageInput = () => document.querySelector('[data-event-image-input="true"]')
  || Array.from(document.querySelectorAll('input[type="file"][accept*="image"]')).find((input) => !input.multiple && input.dataset.ptImageEnhancer !== "off")
  || document.querySelector('.cut-agenda-form-page input[type="file"][accept*="image"]');

const track = (event, metadata = {}) => {
  try { window.PeterTecnetTelemetry?.track?.(event, { metadata }); } catch (_) { /* non-blocking */ }
};

export default function GlobalFlyerDateGuard() {
  const [available, setAvailable] = useState(false);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [original, setOriginal] = useState("");
  const [corrected, setCorrected] = useState("");
  const [action, setAction] = useState("");

  const path = window.location.pathname;
  const recurring = path.includes("/agenda/");
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const locale = navigator.language || "en";

  const refreshAvailability = useCallback(() => {
    const input = findImageInput();
    const preview = document.querySelector(".cut-event-inline-editor__artwork img, .cut-agenda-form-image-preview");
    setAvailable(Boolean(input?.files?.[0] || preview?.src));
  }, []);

  useEffect(() => {
    refreshAvailability();
    const handler = () => refreshAvailability();
    document.addEventListener("change", handler, true);
    const observer = new MutationObserver(handler);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] });
    return () => { document.removeEventListener("change", handler, true); observer.disconnect(); };
  }, [refreshAvailability]);

  const context = useMemo(() => {
    const date = fieldValue("start_date", "start_at", "date");
    const time = fieldValue("start_time") || "00:00";
    return {
      expectedStartAt: date ? (date.includes("T") ? date : `${date}T${time}`) : "",
      expectedDate: date ? date.slice(0, 10) : "",
      dayOfWeek: recurring ? fieldValue("day_of_week") : "",
      subject: fieldValue("title", "name") || "Flyer de evento",
    };
  }, [show, recurring]);

  const loadOriginal = async () => {
    const input = findImageInput();
    const file = input?.files?.[0];
    if (file) {
      if (!ALLOWED.test(file.type) || file.size > 5 * 1024 * 1024) throw new Error("Use um flyer JPG, PNG ou WebP de até 5 MB.");
      return readFile(file);
    }
    const preview = document.querySelector(".cut-event-inline-editor__artwork img, .cut-agenda-form-image-preview");
    if (!preview?.src) throw new Error("Selecione um flyer antes de revisar a data.");
    return urlToDataUrl(preview.src);
  };

  const review = async () => {
    setBusy(true); setError(""); setCorrected(""); setAction("");
    try {
      const imageDataUrl = original || await loadOriginal();
      setOriginal(imageDataUrl);
      const response = await creativeService.reviewFlyerDate({ imageDataUrl, ...context, timezone, locale, recurring });
      setAnalysis(response?.analysis || null);
      track("producer_flyer_date_review_requested", { recurring, status: response?.analysis?.status || "unknown" });
      if (response?.analysis?.status === "mismatch") track("producer_flyer_date_mismatch_detected", { recurring });
      const eventId = path.match(/^\/event\/edit\/(\d+)/)?.[1];
      if (eventId) creativeService.queueFlyerDateAudit({ entityType: "event", entityId: eventId, timezone, locale, recurring: false }).catch(() => {});
    } catch (requestError) {
      setError(requestError?.response?.data?.message || requestError?.message || "Não foi possível revisar a data.");
    } finally { setBusy(false); }
  };

  const correct = async (nextAction) => {
    if (nextAction === "replace" && !context.expectedDate) { setError("Confirme a data real do evento antes de substituir a data impressa."); return; }
    setBusy(true); setError(""); setCorrected(""); setAction(nextAction);
    try {
      const imageDataUrl = original || await loadOriginal();
      setOriginal(imageDataUrl);
      const response = await creativeService.correctFlyerDate({ imageDataUrl, action: nextAction, expectedDate: context.expectedDate, timezone, locale, subject: context.subject });
      const preview = response?.image?.data_uri || "";
      if (!/^data:image\//i.test(preview)) throw new Error("A IA não retornou uma prévia válida.");
      setCorrected(preview);
      track("producer_flyer_date_correction_previewed", { action: nextAction, recurring });
    } catch (requestError) {
      setError(requestError?.response?.data?.message || requestError?.message || "Não foi possível preparar a correção.");
    } finally { setBusy(false); }
  };

  const apply = () => {
    if (!corrected) return;
    const file = dataUrlToFile(corrected);
    const input = findImageInput();
    if (input && typeof DataTransfer !== "undefined") {
      const transfer = new DataTransfer(); transfer.items.add(file); input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
    window.dispatchEvent(new CustomEvent("cutinapp:event-cover-selected", { detail: { file, source: "ai_flyer_date_correction" } }));
    track("producer_flyer_date_corrected", { action, recurring, confirmed: true });
    setShow(false);
  };

  if (!available) return null;
  const statusClass = analysis?.status ? `is-${analysis.status}` : "";
  return <>
    <Button type="button" className="cut-flyer-date-guard-trigger" variant="warning" onClick={() => { setShow(true); setError(""); }}>
      <i className="fa-solid fa-calendar-check" /> Revisar data do flyer
    </Button>
    <Modal show={show} onHide={() => !busy && setShow(false)} centered size="xl" className="cut-flyer-date-guard-modal">
      <Modal.Header closeButton={!busy}><Modal.Title>Proteção de data do flyer</Modal.Title></Modal.Header>
      <Modal.Body>
        {recurring && <Alert variant="info"><strong>Flyer recorrente:</strong> prefira somente o dia da semana. Evite dia/mês fixos, pois esta arte será reutilizada em datas diferentes.</Alert>}
        {error && <Alert variant="danger">{error}</Alert>}
        <div className="cut-flyer-date-guard-actions">
          <Button type="button" onClick={review} disabled={busy}>{busy ? <Spinner size="sm" /> : <i className="fa-solid fa-magnifying-glass" />} Analisar data impressa</Button>
          <Button type="button" variant="outline-light" onClick={() => correct("remove")} disabled={busy}>Remover data</Button>
          <Button type="button" variant="outline-light" onClick={() => correct("replace")} disabled={busy || !context.expectedDate}>Trocar pela data real</Button>
        </div>
        {analysis && <div className={`cut-flyer-date-result ${statusClass}`}><strong>{analysis.reason}</strong><span>Confiança: {Math.round(Number(analysis.confidence || 0) * 100)}%</span>{analysis.detected?.length > 0 && <small>Detectado: {analysis.detected.map((item) => item.raw || item.iso_date).filter(Boolean).join(" · ")}</small>}</div>}
        <div className="cut-flyer-date-previews">
          <figure><figcaption>Original preservado</figcaption>{original ? <img src={original} alt="Flyer original" /> : <div>Abra a análise para carregar o flyer.</div>}</figure>
          <figure><figcaption>Prévia proposta</figcaption>{corrected ? <img src={corrected} alt="Prévia do flyer corrigido" /> : <div>Nenhuma alteração preparada.</div>}</figure>
        </div>
        {corrected && <Alert variant="warning" className="mt-3 mb-0">Compare textos, logos, preços e arte. A Cutinapp não aplica esta versão sem sua confirmação.</Alert>}
      </Modal.Body>
      <Modal.Footer><Button variant="outline-light" onClick={() => { track("producer_flyer_date_correction_ignored", { action: action || "none", recurring }); setShow(false); }} disabled={busy}>Manter original</Button><Button onClick={apply} disabled={busy || !corrected}>Confirmar e usar esta versão</Button></Modal.Footer>
    </Modal>
  </>;
}
