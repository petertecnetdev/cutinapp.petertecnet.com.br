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
};

const themes = {
  neon: { label: "Neon", top: "#19002f", bottom: "#05050a", accent: "#ef37ff", secondary: "#25d9ff" },
  premium: { label: "Premium", top: "#17130c", bottom: "#050505", accent: "#e8c66a", secondary: "#fff3c4" },
  sunset: { label: "Vibrante", top: "#45114b", bottom: "#180514", accent: "#ff6b35", secondary: "#ffca55" },
  clean: { label: "Minimalista", top: "#182235", bottom: "#070b12", accent: "#78a8ff", secondary: "#d9e7ff" },
};

const imageUrl = (path) => {
  if (!path) return "";
  if (/^https?:\/\//i.test(path) || /^data:image\//i.test(path)) return path;
  return `${storageUrl}${String(path).replace(/^\/?storage\//, "").replace(/^\//, "")}`;
};

const productionImage = (production) => production?.background || production?.background_image || production?.cover || production?.image || production?.logo || "";

const readField = (name) => document.querySelector(`[name="${name}"]`)?.value?.trim?.() || "";

const readFormContext = () => ({
  productionId: readField("production_id"),
  productionName: document.querySelector('[name="production_id"] option:checked')?.textContent?.trim() || "",
  title: readField("title"),
  description: readField("description"),
  venue: readField("venue"),
  city: readField("city"),
  uf: readField("uf"),
  startDate: readField("start_date"),
});

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

async function renderFlyer({ data, production, formatKey, themeKey, generatedBackground = "" }) {
  const format = formats[formatKey];
  const theme = themes[themeKey];
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
      ctx.globalAlpha = generatedBackground ? 0.9 : 0.48;
      drawCoverImage(ctx, img, width, height);
      ctx.restore();
    } catch (_) {
      // Gradient fallback keeps flyer generation available if a remote image cannot be drawn.
    }
  }

  const overlay = ctx.createLinearGradient(0, 0, 0, height);
  overlay.addColorStop(0, "rgba(0,0,0,.08)");
  overlay.addColorStop(0.56, "rgba(0,0,0,.38)");
  overlay.addColorStop(1, "rgba(0,0,0,.92)");
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = theme.accent;
  ctx.fillRect(margin, margin, Math.round(width * 0.11), Math.max(10, Math.round(height * 0.007)));

  const producer = (data.productionName && data.productionName !== "Selecione") ? data.productionName : "CUTINAPP";
  ctx.fillStyle = "rgba(255,255,255,.82)";
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
  const titleLines = wrapText(ctx, title.toUpperCase(), titleMax, formatKey === "cover" ? 2 : 3);
  const lineHeight = titleSize * 0.96;
  let titleY = Math.round(height * (formatKey === "cover" ? 0.58 : 0.57));
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

  ctx.fillStyle = "rgba(255,255,255,.68)";
  ctx.font = `600 ${Math.max(18, Math.round(width * 0.018))}px Inter, Arial, sans-serif`;
  ctx.fillText("DESCUBRA · CONECTE · VIVA O EVENTO", margin, height - margin * 0.68);

  return canvas;
}

const canvasToFile = (canvas, name) => new Promise((resolve, reject) => {
  canvas.toBlob((blob) => blob ? resolve(new File([blob], name, { type: "image/jpeg" })) : reject(new Error("Não foi possível criar a imagem.")), "image/jpeg", 0.92);
});

export default function EventFlyerAssistant() {
  const [open, setOpen] = useState(false);
  const [formatKey, setFormatKey] = useState("cover");
  const [themeKey, setThemeKey] = useState("neon");
  const [context, setContext] = useState(readFormContext);
  const [production, setProduction] = useState(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [generationSource, setGenerationSource] = useState("");

  const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
  const canOpen = pathname === "/event/create" || /^\/event\/edit\/[^/]+$/.test(pathname);
  const format = formats[formatKey];

  useEffect(() => () => { if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview); }, [preview]);

  const openStudio = async () => {
    const data = readFormContext();
    setContext(data);
    setOpen(true);
    setError("");
    setGenerationSource("");
    setProduction(null);
    if (data.productionId) {
      try { setProduction(await cutinappService.getProduction(data.productionId)); } catch (_) { /* optional reference */ }
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
    try {
      const data = readFormContext();
      setContext(data);
      let generatedBackground = "";

      if (data.title) {
        try {
          const aiResult = await creativeService.generateEventFlyerBackground({
            title: data.title,
            description: data.description,
            style: themeKey,
            productionName: data.productionName,
            venue: data.venue,
            city: data.city,
            uf: data.uf,
            format: formatKey,
          });
          generatedBackground = aiResult?.image?.data_uri || "";
          setGenerationSource(generatedBackground ? "cloudflare" : "local");
        } catch (_) {
          setGenerationSource("local");
        }
      } else {
        setGenerationSource("local");
      }

      const canvas = await renderFlyer({ data, production, formatKey, themeKey, generatedBackground });
      const file = await canvasToFile(canvas, `flyer-${(data.title || "evento").toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "evento"}-${formatKey}.jpg`);
      const url = URL.createObjectURL(file);
      if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
      setPreview(url);
      return file;
    } catch (err) {
      setError(err?.message || "Não foi possível gerar o flyer.");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const useAsCover = async () => {
    const file = await generate();
    if (!file) return;
    const input = document.querySelector('input[type="file"][accept*="image"]');
    if (!input) {
      setError("O campo de imagem do evento não foi encontrado. Feche e abra o estúdio novamente.");
      return;
    }
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    try {
      window.PeterTecnetTelemetry?.track?.("producer_event_flyer_generated", {
        label: context.title || "Evento",
        target: context.productionId || null,
        metadata: {
          format: formatKey,
          theme: themeKey,
          source: generationSource === "cloudflare" ? "cloudflare_workers_ai" : (productionImage(production) ? "production_identity" : "cutinapp_theme"),
        },
      });
    } catch (_) { /* telemetry cannot block the flow */ }
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
          <div><strong>{context.title || "Seu evento"}</strong><span>A Cutinapp cria o fundo com IA e finaliza a arte com os dados reais do cadastro.</span></div>
          <span className="cut-flyer-beta">IA</span>
        </div>

        <div className="cut-flyer-controls">
          <Form.Group><Form.Label>Formato</Form.Label><div className="cut-flyer-options">{Object.entries(formats).map(([key, item]) => <Button key={key} type="button" variant={formatKey === key ? "primary" : "outline-light"} onClick={() => setFormatKey(key)}><strong>{item.ratio}</strong><span>{item.label}</span></Button>)}</div></Form.Group>
          <Form.Group><Form.Label>Estilo</Form.Label><div className="cut-flyer-options cut-flyer-options--themes">{Object.entries(themes).map(([key, item]) => <Button key={key} type="button" variant={themeKey === key ? "primary" : "outline-light"} onClick={() => setThemeKey(key)}><span className="cut-flyer-theme-dot" style={{ background: `linear-gradient(135deg, ${item.accent}, ${item.secondary})` }} />{item.label}</Button>)}</div></Form.Group>
        </div>

        {error && <div className="alert alert-danger py-2">{error}</div>}
        <div className="cut-flyer-preview" style={previewStyle}>
          {preview ? <img src={preview} alt="Prévia do flyer gerado" /> : <div><i className="fa-regular fa-image" /><strong>Gere uma prévia</strong><span>A IA cria a arte de fundo e a Cutinapp aplica os dados corretos por cima.</span></div>}
        </div>

        {generationSource && <small className="cut-flyer-note d-block mb-2">{generationSource === "cloudflare" ? "Fundo criado com Cloudflare Workers AI · FLUX" : "Modo local usado automaticamente para preservar a disponibilidade."}</small>}

        <div className="cut-flyer-actions">
          <Button type="button" variant="outline-light" onClick={generate} disabled={busy}>{busy ? <><Spinner size="sm" className="me-2" />Gerando com IA...</> : "Gerar com IA"}</Button>
          <Button type="button" onClick={useAsCover} disabled={busy}>{busy ? "Preparando..." : "Usar como capa do evento"}</Button>
        </div>
        <small className="cut-flyer-note">A IA não escreve o flyer. Nome, data, horário e local são desenhados pela Cutinapp a partir dos campos do evento, evitando alterações nos dados oficiais.</small>
      </Modal.Body>
    </Modal>
  </>;
}
