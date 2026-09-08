import React, { useEffect, useMemo, useState } from "react";
import { Button, Form, Modal, Spinner } from "react-bootstrap";
import { storageUrl } from "../config";
import cutinappService from "../services/CutinappService";
import creativeService from "../services/CreativeService";
import "./event-flyer-assistant.css";

const formats = {
  cover: { label: "Capa do evento", width: 1600, height: 900, ratio: "16:9" },
  post: { label: "Post / feed", width: 1080, height: 1350, ratio: "4:5" },
  story: { label: "Story", width: 1080, height: 1920, ratio: "9:16" },
  og: { label: "WhatsApp", width: 1200, height: 630, ratio: "1.91:1" },
};

const themes = {
  automatic: { label: "Automático", top: "#17052d", bottom: "#05050a", accent: "#b94cff", secondary: "#31d8ff" },
  neon: { label: "Balada / Neon", top: "#19002f", bottom: "#05050a", accent: "#ef37ff", secondary: "#25d9ff" },
  premium: { label: "Premium / Luxo", top: "#17130c", bottom: "#050505", accent: "#e8c66a", secondary: "#fff3c4" },
  festival: { label: "Festival", top: "#281036", bottom: "#07070d", accent: "#ff4db8", secondary: "#56d9ff" },
  sertanejo: { label: "Sertanejo", top: "#2d1b11", bottom: "#090604", accent: "#e8a85d", secondary: "#ffe3b5" },
  pagode: { label: "Pagode", top: "#2b1711", bottom: "#080605", accent: "#f6a84f", secondary: "#ffd77a" },
  funk: { label: "Funk", top: "#240b22", bottom: "#050507", accent: "#ff398a", secondary: "#6ee8ff" },
  electronic: { label: "Eletrônico", top: "#091b35", bottom: "#03050a", accent: "#25d9ff", secondary: "#e83cff" },
  pub: { label: "Bar / Pub", top: "#25140d", bottom: "#070504", accent: "#e28d48", secondary: "#ffd89b" },
  minimal: { label: "Minimalista", top: "#182235", bottom: "#070b12", accent: "#78a8ff", secondary: "#d9e7ff" },
  urban: { label: "Urbano", top: "#171719", bottom: "#050506", accent: "#f05252", secondary: "#dedede" },
  open_bar: { label: "Open Bar", top: "#24102d", bottom: "#070509", accent: "#ff42c8", secondary: "#55e3ff" },
  sunset: { label: "Sunset", top: "#45114b", bottom: "#180514", accent: "#ff6b35", secondary: "#ffca55" },
  clean: { label: "Clean", top: "#182235", bottom: "#070b12", accent: "#78a8ff", secondary: "#d9e7ff" },
};

const intensities = {
  clean: { label: "Clean", description: "Mais espaço e menos elementos" },
  balanced: { label: "Equilibrado", description: "Impacto sem poluição visual" },
  impactful: { label: "Impactante", description: "Mais luz, profundidade e energia" },
};

const imageUrl = (path) => {
  if (!path) return "";
  if (/^https?:\/\//i.test(path) || /^data:image\//i.test(path)) return path;
  return `${storageUrl}${String(path).replace(/^\/?storage\//, "").replace(/^\//, "")}`;
};

const productionImage = (production) => production?.background || production?.background_image || production?.cover || production?.image || production?.logo || "";

const readField = (name) => document.querySelector(`[name="${name}"]`)?.value?.trim?.() || "";
const readFirstField = (...names) => names.map(readField).find(Boolean) || "";

const readFormContext = () => ({
  productionId: readField("production_id"),
  productionName: document.querySelector('[name="production_id"] option:checked')?.textContent?.trim() || "",
  title: readField("title"),
  description: readField("description"),
  category: readFirstField("category", "event_category", "genre", "music_genre"),
  artist: readFirstField("artist", "artist_name", "artists", "dj", "attraction"),
  venue: readField("venue"),
  city: readField("city"),
  uf: readField("uf"),
  startDate: readField("start_date"),
});

const compactTextList = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item?.name || item?.title || item || "").trim()).filter(Boolean).slice(0, 8);
  return String(value).split(/[\n;|]+/).map((item) => item.trim()).filter(Boolean).slice(0, 8);
};

const productionCreativeContext = (production) => {
  if (!production) return { brandContext: "", featuredItems: [] };

  const brandContext = [
    production?.name || production?.title,
    production?.slogan || production?.tagline,
    production?.type || production?.category,
    production?.description,
  ].filter(Boolean).map((item) => String(item).trim()).join(" · ").slice(0, 500);

  const featuredItems = compactTextList(
    production?.items || production?.catalog_items || production?.products || production?.featured_items,
  );

  return { brandContext, featuredItems };
};

const roundedRect = (ctx, x, y, width, height, radius) => {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, width, height, r);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
};

const fitText = (ctx, text, maxWidth, startSize, minSize, weight = 800) => {
  let size = startSize;
  do {
    ctx.font = `${weight} ${size}px Inter, Arial, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) return size;
    size -= 2;
  } while (size > minSize);
  return minSize;
};

const wrapText = (ctx, text, maxWidth, maxLines = 3) => {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  let truncated = false;

  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !current) {
      current = candidate;
      continue;
    }
    if (lines.length < maxLines - 1) {
      lines.push(current);
      current = word;
      continue;
    }
    truncated = true;
    break;
  }

  if (current && lines.length < maxLines) lines.push(current);
  if (truncated && lines.length) {
    const last = lines.length - 1;
    while (ctx.measureText(`${lines[last]}…`).width > maxWidth && lines[last].length > 4) {
      lines[last] = lines[last].slice(0, -1);
    }
    lines[last] = `${lines[last].replace(/[.,;:]$/, "")}…`;
  }
  return lines;
};

const loadImage = (src) => new Promise((resolve, reject) => {
  if (!src) return reject(new Error("no-image"));
  const img = new Image();
  if (!/^data:image\//i.test(src)) img.crossOrigin = "anonymous";
  img.onload = () => resolve(img);
  img.onerror = reject;
  img.src = src;
});

const drawCoverImage = (ctx, img, width, height) => {
  const scale = Math.max(width / img.width, height / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
};

const formatDate = (value) => {
  if (!value) return { day: "EM BREVE", hour: "" };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { day: "EM BREVE", hour: "" };
  return {
    day: new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short" }).format(date).replace(".", "").toUpperCase(),
    hour: new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(date),
  };
};

async function renderFlyer({ data, production, formatKey, themeKey, intensityKey, generatedBackground = "" }) {
  const format = formats[formatKey] || formats.cover;
  const theme = themes[themeKey] || themes.automatic;
  const canvas = document.createElement("canvas");
  canvas.width = format.width;
  canvas.height = format.height;
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  const margin = Math.round(width * 0.065);

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, theme.top);
  gradient.addColorStop(1, theme.bottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const ref = generatedBackground || productionImage(production);
  if (ref) {
    try {
      const img = await loadImage(imageUrl(ref));
      ctx.save();
      const aiAlpha = intensityKey === "clean" ? 0.82 : (intensityKey === "impactful" ? 0.98 : 0.92);
      ctx.globalAlpha = generatedBackground ? aiAlpha : 0.48;
      drawCoverImage(ctx, img, width, height);
      ctx.restore();
    } catch (_) {
      // Production imagery is optional; the branded gradient remains a valid fallback.
    }
  }

  const overlay = ctx.createLinearGradient(0, 0, 0, height);
  overlay.addColorStop(0, "rgba(0,0,0,.06)");
  overlay.addColorStop(0.52, "rgba(0,0,0,.24)");
  overlay.addColorStop(1, "rgba(0,0,0,.90)");
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = theme.accent;
  ctx.fillRect(margin, margin, Math.round(width * 0.11), Math.max(10, Math.round(height * 0.007)));

  const producer = (data.productionName && data.productionName !== "Selecione")
    ? data.productionName
    : (production?.name || production?.title || "CUTINAPP");
  ctx.fillStyle = "rgba(255,255,255,.86)";
  ctx.font = `700 ${Math.max(24, Math.round(width * 0.022))}px Inter, Arial, sans-serif`;
  ctx.fillText(producer.toUpperCase(), margin, margin + Math.round(height * 0.07));

  const date = formatDate(data.startDate);
  const badgeW = Math.round(width * 0.28);
  const badgeH = Math.round(height * 0.095);
  const badgeX = width - margin - badgeW;
  const badgeY = margin;
  roundedRect(ctx, badgeX, badgeY, badgeW, badgeH, badgeH / 2);
  ctx.fillStyle = "rgba(4,4,8,.66)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.18)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = theme.secondary;
  ctx.font = `800 ${Math.max(20, Math.round(width * 0.019))}px Inter, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(`${date.day}${date.hour ? ` · ${date.hour}` : ""}`, badgeX + badgeW / 2, badgeY + badgeH * 0.62);
  ctx.textAlign = "left";

  const title = data.title || "NOVO EVENTO";
  const titleMax = width - margin * 2;
  const titleSize = fitText(ctx, title.toUpperCase(), titleMax, Math.round(width * (formatKey === "story" ? 0.105 : 0.083)), Math.round(width * 0.048));
  ctx.font = `900 ${titleSize}px Inter, Arial, sans-serif`;
  ctx.fillStyle = "#ffffff";
  const titleLines = wrapText(ctx, title.toUpperCase(), titleMax, formatKey === "cover" || formatKey === "og" ? 2 : 3);
  const lineHeight = titleSize * 0.96;
  let titleY = Math.round(height * (formatKey === "cover" || formatKey === "og" ? 0.58 : 0.57));

  if (data.artist) {
    ctx.fillStyle = theme.accent;
    ctx.font = `800 ${Math.max(20, Math.round(width * 0.022))}px Inter, Arial, sans-serif`;
    ctx.fillText(String(data.artist).toUpperCase(), margin, titleY - Math.round(height * 0.075));
  }

  ctx.fillStyle = "#ffffff";
  ctx.font = `900 ${titleSize}px Inter, Arial, sans-serif`;
  titleLines.forEach((line) => {
    ctx.fillText(line, margin, titleY);
    titleY += lineHeight;
  });

  const location = [data.venue, [data.city, data.uf].filter(Boolean).join("/")].filter(Boolean).join(" · ");
  if (location) {
    ctx.fillStyle = theme.secondary;
    ctx.font = `700 ${Math.max(24, Math.round(width * 0.027))}px Inter, Arial, sans-serif`;
    const locationLines = wrapText(ctx, location, titleMax, 2);
    let y = Math.min(height - margin * 1.9, titleY + Math.round(height * 0.035));
    locationLines.forEach((line) => { ctx.fillText(line, margin, y); y += Math.round(width * 0.037); });
  }

  ctx.fillStyle = "rgba(255,255,255,.72)";
  ctx.font = `700 ${Math.max(18, Math.round(width * 0.018))}px Inter, Arial, sans-serif`;
  ctx.fillText("INGRESSOS E EXPERIÊNCIAS NA CUTINAPP", margin, height - margin * 0.68);

  return canvas;
}

const canvasToFile = (canvas, name) => new Promise((resolve, reject) => {
  canvas.toBlob((blob) => blob ? resolve(new File([blob], name, { type: "image/jpeg" })) : reject(new Error("Não foi possível criar a imagem.")), "image/jpeg", 0.94);
});

export default function EventFlyerAssistant() {
  const [open, setOpen] = useState(false);
  const [formatKey, setFormatKey] = useState("cover");
  const [themeKey, setThemeKey] = useState("automatic");
  const [intensityKey, setIntensityKey] = useState("balanced");
  const [context, setContext] = useState(readFormContext);
  const [production, setProduction] = useState(null);
  const [presetCatalog, setPresetCatalog] = useState(null);
  const [preview, setPreview] = useState("");
  const [generatedFile, setGeneratedFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [aiError, setAiError] = useState("");
  const [generationSource, setGenerationSource] = useState("");

  const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
  const canOpen = pathname === "/event/create" || /^\/event\/edit\/[^/]+$/.test(pathname);
  const format = formats[formatKey] || formats.cover;

  const styleOptions = useMemo(() => {
    if (Array.isArray(presetCatalog?.styles) && presetCatalog.styles.length) return presetCatalog.styles;
    return Object.entries(themes).map(([key, item]) => ({ key, label: item.label }));
  }, [presetCatalog]);

  const intensityOptions = useMemo(() => {
    if (Array.isArray(presetCatalog?.intensities) && presetCatalog.intensities.length) return presetCatalog.intensities;
    return Object.entries(intensities).map(([key, item]) => ({ key, label: item.label }));
  }, [presetCatalog]);

  useEffect(() => () => { if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview); }, [preview]);

  useEffect(() => {
    if (!canOpen || presetCatalog) return;
    creativeService.getEventCreativePresets()
      .then(setPresetCatalog)
      .catch(() => {
        // Local catalog keeps the studio available while API deployments roll out.
      });
  }, [canOpen, presetCatalog]);

  const resetPreview = () => {
    setGeneratedFile(null);
    setPreview("");
    setAiError("");
    setGenerationSource("");
  };

  const openStudio = async () => {
    const data = readFormContext();
    setContext(data);
    setOpen(true);
    setError("");
    setAiError("");
    setGenerationSource("");
    setPreview("");
    setGeneratedFile(null);
    setProduction(null);
    if (data.productionId) {
      try { setProduction(await cutinappService.getProduction(data.productionId)); } catch (_) {
        // Production identity is optional for flyer generation.
      }
    }
  };

  useEffect(() => {
    const handleOpenRequest = () => {
      if (canOpen) openStudio();
    };
    window.addEventListener("cutinapp:open-event-flyer", handleOpenRequest);
    return () => window.removeEventListener("cutinapp:open-event-flyer", handleOpenRequest);
  });

  const generate = async () => {
    setBusy(true);
    setError("");
    setAiError("");
    setGeneratedFile(null);
    try {
      const data = readFormContext();
      setContext(data);
      if (!data.title) throw new Error("Preencha o nome do evento antes de gerar a capa.");

      const creativeContext = productionCreativeContext(production);
      const promotions = compactTextList(readFirstField("promotion_summary", "ticket_summary", "promotions"));

      let generatedBackground = "";
      try {
        const aiResult = await creativeService.generateEventFlyerBackground({
          title: data.title,
          description: data.description,
          category: data.category,
          artist: data.artist,
          style: themeKey,
          intensity: intensityKey,
          productionName: data.productionName,
          venue: data.venue,
          city: data.city,
          uf: data.uf,
          format: formatKey,
          brandContext: creativeContext.brandContext,
          promotions,
          featuredItems: creativeContext.featuredItems,
        });
        const candidate = String(aiResult?.image?.data_uri || "");
        if (!/^data:image\/(?:jpeg|jpg|png|webp)(?:;charset=[^;]+)?;base64,/i.test(candidate) || candidate.length < 2048) {
          throw new Error("A IA respondeu sem uma imagem utilizável.");
        }
        generatedBackground = candidate;
        setGenerationSource(aiResult?.image?.model || "cloudflare");
      } catch (err) {
        const message = err?.response?.data?.message || err?.message || "O serviço de IA não respondeu corretamente.";
        setAiError(message);
        setGenerationSource("local");
      }

      const canvas = await renderFlyer({
        data,
        production,
        formatKey,
        themeKey,
        intensityKey,
        generatedBackground,
      });
      const file = await canvasToFile(canvas, `flyer-${(data.title || "evento").toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "evento"}-${formatKey}.jpg`);
      if (!file?.size || file.size < 4096) throw new Error("A composição final da capa ficou inválida. Gere novamente.");

      const url = URL.createObjectURL(file);
      if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
      setPreview(url);
      setGeneratedFile(file);
      return file;
    } catch (err) {
      setGeneratedFile(null);
      setError(err?.message || "Não foi possível gerar o flyer.");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const useAsCover = async () => {
    const file = generatedFile || await generate();
    if (!file) return;

    window.dispatchEvent(new CustomEvent("cutinapp:event-cover-selected", {
      detail: { file, source: "ai_flyer" },
    }));

    const input = document.querySelector('[data-event-image-input="true"]') || document.querySelector('input[name="image"][type="file"]');
    if (input && typeof DataTransfer !== "undefined") {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
    }

    try {
      window.PeterTecnetTelemetry?.track?.("producer_event_flyer_generated", {
        label: context.title || "Evento",
        target: context.productionId || null,
        metadata: {
          format: formatKey,
          theme: themeKey,
          intensity: intensityKey,
          source: generationSource === "local" ? (productionImage(production) ? "production_identity" : "cutinapp_theme") : generationSource,
        },
      });
    } catch (_) {
      // Telemetry must never block the producer workflow.
    }
    setOpen(false);
  };

  const previewStyle = useMemo(() => ({ aspectRatio: `${format.width}/${format.height}` }), [format]);
  if (!canOpen) return null;

  return <>
    <Button type="button" className="cut-flyer-fab" onClick={openStudio} aria-label="Criar flyer automaticamente">
      <i className="fa-solid fa-wand-magic-sparkles" />
      <span>Criar flyer</span>
    </Button>

    <Modal show={open} onHide={() => !busy && setOpen(false)} centered size="lg" className="cut-flyer-modal">
      <Modal.Header closeButton={!busy}>
        <Modal.Title><i className="fa-solid fa-wand-magic-sparkles me-2" />Estúdio de flyer</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="cut-flyer-intro">
          <div>
            <strong>{context.title || "Seu evento"}</strong>
            <span>O Diretor Criativo interpreta o evento, cria a direção de arte e a Cutinapp finaliza o flyer com os dados reais.</span>
          </div>
          <span className="cut-flyer-beta">CREATIVE AI</span>
        </div>

        <div className="cut-flyer-controls">
          <Form.Group>
            <Form.Label>Formato</Form.Label>
            <div className="cut-flyer-options">
              {Object.entries(formats).map(([key, item]) => (
                <Button key={key} type="button" variant={formatKey === key ? "primary" : "outline-light"} onClick={() => { setFormatKey(key); resetPreview(); }}>
                  <strong>{item.ratio}</strong><span>{item.label}</span>
                </Button>
              ))}
            </div>
          </Form.Group>

          <Form.Group>
            <Form.Label>Direção visual</Form.Label>
            <div className="cut-flyer-options cut-flyer-options--themes">
              {styleOptions.map((item) => {
                const palette = themes[item.key] || themes.automatic;
                return <Button key={item.key} type="button" variant={themeKey === item.key ? "primary" : "outline-light"} onClick={() => { setThemeKey(item.key); resetPreview(); }}>
                  <span className="cut-flyer-theme-dot" style={{ background: `linear-gradient(135deg, ${palette.accent}, ${palette.secondary})` }} />{item.label}
                </Button>;
              })}
            </div>
          </Form.Group>

          <Form.Group>
            <Form.Label>Intensidade</Form.Label>
            <div className="cut-flyer-options cut-flyer-options--intensity">
              {intensityOptions.map((item) => (
                <Button key={item.key} type="button" variant={intensityKey === item.key ? "primary" : "outline-light"} onClick={() => { setIntensityKey(item.key); resetPreview(); }}>
                  <strong>{item.label}</strong>
                  <span>{intensities[item.key]?.description || "Direção criativa da composição"}</span>
                </Button>
              ))}
            </div>
          </Form.Group>
        </div>

        {error && <div className="alert alert-danger py-2">{error}</div>}
        {aiError && <div className="alert alert-warning py-2"><strong>A IA não gerou o fundo:</strong> {aiError} A Cutinapp montou uma capa local completa para você não ficar sem arte.</div>}

        <div className="cut-flyer-preview" style={previewStyle}>
          {preview
            ? <img src={preview} alt="Prévia do flyer gerado" />
            : <div><i className="fa-regular fa-image" /><strong>Gere uma prévia</strong><span>A IA cria a direção artística e a Cutinapp preserva nome, data, local e demais dados oficiais.</span></div>}
        </div>

        {generationSource && <small className="cut-flyer-note d-block mb-2">
          {generationSource === "local" ? "Modo local de segurança usado." : `Arte-base gerada por IA · ${generationSource}`}
        </small>}

        <div className="cut-flyer-actions">
          <Button type="button" variant="outline-light" onClick={generate} disabled={busy}>
            {busy ? <><Spinner size="sm" className="me-2" />Criando direção de arte...</> : "Gerar nova arte"}
          </Button>
          <Button type="button" onClick={useAsCover} disabled={busy}>
            {busy ? "Preparando..." : (generatedFile ? "Usar esta prévia como capa" : "Gerar e usar como capa")}
          </Button>
        </div>
        <small className="cut-flyer-note">A IA cria o visual. Os textos oficiais continuam sendo renderizados pela própria Cutinapp para evitar nomes, datas e preços escritos incorretamente pela imagem generativa.</small>
      </Modal.Body>
    </Modal>
  </>;
}
