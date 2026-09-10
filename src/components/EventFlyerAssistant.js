import React, { useEffect, useMemo, useRef, useState } from "react";
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

const regenerationModes = [
  ["more_premium", "Mais premium"],
  ["more_elegant", "Mais elegante"],
  ["more_bold", "Mais impactante"],
  ["more_party", "Mais festa"],
  ["more_realistic", "Mais realista"],
  ["change_subject", "Trocar personagem"],
  ["change_scene", "Trocar cenário"],
];

const imageUrl = (path) => {
  if (!path) return "";
  if (/^https?:\/\//i.test(path) || /^data:image\//i.test(path)) return path;
  return `${storageUrl}${String(path).replace(/^\/?storage\//, "").replace(/^\//, "")}`;
};

const productionImage = (production) => production?.background || production?.background_image || production?.cover || production?.image || production?.logo || "";
const productionLogo = (production) => production?.logo || production?.image || "";
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
  if (!production) return { brandContext: "", featuredItems: [], brandColors: [] };
  const brandContext = [
    production?.name || production?.title,
    production?.slogan || production?.tagline,
    production?.type || production?.category,
    production?.description,
  ].filter(Boolean).map((item) => String(item).trim()).join(" · ").slice(0, 500);
  const featuredItems = compactTextList(production?.items || production?.catalog_items || production?.products || production?.featured_items);
  const brandColors = compactTextList(production?.brand_colors || production?.colors).filter((item) => /^#[0-9a-f]{6}$/i.test(item)).slice(0, 5);
  return { brandContext, featuredItems, brandColors };
};

const roundedRect = (ctx, x, y, width, height, radius) => {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") { ctx.roundRect(x, y, width, height, r); return; }
  ctx.moveTo(x + r, y); ctx.lineTo(x + width - r, y); ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r); ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height); ctx.quadraticCurveTo(x, y + height, x, y + height - r); ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
};

const loadImage = (src) => new Promise((resolve, reject) => {
  if (!src) return reject(new Error("no-image"));
  const img = new Image();
  if (!/^data:image\//i.test(src)) img.crossOrigin = "anonymous";
  img.onload = () => resolve(img); img.onerror = reject; img.src = src;
});

const drawCoverImage = (ctx, img, width, height) => {
  const scale = Math.max(width / img.width, height / img.height);
  const w = img.width * scale; const h = img.height * scale;
  ctx.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
};

const fitText = (ctx, text, maxWidth, startSize, minSize, font = "Arial Black, Inter, Arial, sans-serif") => {
  let size = startSize;
  while (size > minSize) {
    ctx.font = `900 ${size}px ${font}`;
    if (ctx.measureText(text).width <= maxWidth) return size;
    size -= 2;
  }
  return minSize;
};

const wrapText = (ctx, text, maxWidth, maxLines = 3) => {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = []; let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (!current || ctx.measureText(next).width <= maxWidth) { current = next; continue; }
    if (lines.length >= maxLines - 1) { current = `${current}…`; break; }
    lines.push(current); current = word;
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines;
};

const formatDate = (value) => {
  if (!value) return { day: "EM BREVE", hour: "" };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { day: "EM BREVE", hour: "" };
  return {
    day: new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short" }).format(date).replace(/\./g, "").toUpperCase(),
    hour: new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(date),
  };
};

const fileToReferenceDataUri = async (file) => {
  const raw = await new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || "")); reader.onerror = reject; reader.readAsDataURL(file);
  });
  const img = await loadImage(raw);
  const max = 512; const scale = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(img.width * scale)); canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext("2d"); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.84);
};

async function renderFlyer({ data, production, formatKey, themeKey, intensityKey, generatedBackground = "" }) {
  const format = formats[formatKey] || formats.cover;
  const theme = themes[themeKey] || themes.automatic;
  const canvas = document.createElement("canvas"); canvas.width = format.width; canvas.height = format.height;
  const ctx = canvas.getContext("2d"); const { width, height } = canvas;
  const margin = Math.round(width * 0.06); const portrait = height > width;

  const base = ctx.createLinearGradient(0, 0, width, height); base.addColorStop(0, theme.top); base.addColorStop(1, theme.bottom);
  ctx.fillStyle = base; ctx.fillRect(0, 0, width, height);

  const ref = generatedBackground || productionImage(production);
  if (ref) {
    try {
      const img = await loadImage(imageUrl(ref));
      ctx.save(); ctx.globalAlpha = generatedBackground ? 1 : 0.56; drawCoverImage(ctx, img, width, height); ctx.restore();
    } catch (_) { /* branded fallback stays visible */ }
  }

  const side = ctx.createLinearGradient(0, 0, width * 0.82, 0);
  side.addColorStop(0, portrait ? "rgba(2,2,7,.82)" : "rgba(2,2,7,.88)");
  side.addColorStop(0.48, portrait ? "rgba(2,2,7,.42)" : "rgba(2,2,7,.48)");
  side.addColorStop(1, "rgba(2,2,7,.02)"); ctx.fillStyle = side; ctx.fillRect(0, 0, width, height);
  const bottom = ctx.createLinearGradient(0, height * 0.25, 0, height); bottom.addColorStop(0, "rgba(0,0,0,0)"); bottom.addColorStop(1, "rgba(0,0,0,.92)"); ctx.fillStyle = bottom; ctx.fillRect(0, 0, width, height);

  ctx.save(); ctx.globalAlpha = intensityKey === "impactful" ? 0.18 : 0.1; ctx.fillStyle = theme.accent;
  for (let i = 0; i < 4; i += 1) { ctx.beginPath(); ctx.arc(width * (0.15 + i * 0.22), height * (0.16 + (i % 2) * 0.12), width * 0.13, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();

  const date = formatDate(data.startDate);
  const meta = `${date.day}${date.hour ? `  •  ${date.hour}` : ""}`;
  ctx.font = `800 ${Math.max(20, Math.round(width * 0.018))}px Inter, Arial, sans-serif`; ctx.fillStyle = theme.secondary; ctx.letterSpacing = "2px";
  ctx.fillText(meta, margin, margin + Math.round(height * 0.055));

  const artist = String(data.artist || "").trim();
  const title = String(data.title || "NOVO EVENTO").toUpperCase();
  const textWidth = portrait ? width - margin * 2 : width * 0.61;
  const headlineY = portrait ? height * 0.49 : height * 0.47;
  if (artist) {
    ctx.font = `800 ${Math.max(20, Math.round(width * 0.021))}px Inter, Arial, sans-serif`; ctx.fillStyle = theme.accent;
    ctx.fillText(artist.toUpperCase(), margin, headlineY - height * 0.075);
  }

  const titleSize = fitText(ctx, title, textWidth, Math.round(width * (portrait ? 0.09 : 0.068)), Math.round(width * 0.043));
  ctx.font = `900 ${titleSize}px Arial Black, Inter, Arial, sans-serif`; ctx.textBaseline = "alphabetic";
  const lines = wrapText(ctx, title, textWidth, portrait ? 3 : 2); let y = headlineY;
  ctx.shadowColor = "rgba(0,0,0,.55)"; ctx.shadowBlur = Math.round(width * 0.012); ctx.shadowOffsetY = Math.round(width * 0.006);
  lines.forEach((line, index) => {
    ctx.fillStyle = index === lines.length - 1 && lines.length > 1 ? theme.secondary : "#fff";
    ctx.fillText(line, margin, y); y += titleSize * 1.02;
  });
  ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;

  const producer = (data.productionName && data.productionName !== "Selecione") ? data.productionName : (production?.name || production?.title || "CUTINAPP");
  const location = [data.venue, [data.city, data.uf].filter(Boolean).join("/")].filter(Boolean).join(" · ");
  const infoY = Math.min(height - margin * 1.6, y + height * 0.05);
  ctx.font = `700 ${Math.max(22, Math.round(width * 0.022))}px Inter, Arial, sans-serif`; ctx.fillStyle = "rgba(255,255,255,.9)";
  if (location) ctx.fillText(location, margin, infoY);
  ctx.font = `700 ${Math.max(16, Math.round(width * 0.016))}px Inter, Arial, sans-serif`; ctx.fillStyle = "rgba(255,255,255,.58)";
  ctx.fillText(`${producer.toUpperCase()}  •  INGRESSOS E EXPERIÊNCIAS NA CUTINAPP`, margin, height - margin * 0.62);

  const logo = productionLogo(production);
  if (logo) {
    try {
      const img = await loadImage(imageUrl(logo)); const logoMax = Math.round(width * (portrait ? 0.16 : 0.11));
      const scale = Math.min(logoMax / img.width, logoMax / img.height); const lw = img.width * scale; const lh = img.height * scale;
      const lx = width - margin - lw; const ly = margin;
      ctx.save(); ctx.globalAlpha = 0.94; ctx.drawImage(img, lx, ly, lw, lh); ctx.restore();
    } catch (_) { /* logo is optional */ }
  }

  return canvas;
}

const canvasToFile = (canvas, name) => new Promise((resolve, reject) => {
  canvas.toBlob((blob) => blob ? resolve(new File([blob], name, { type: "image/jpeg" })) : reject(new Error("Não foi possível criar a imagem.")), "image/jpeg", 0.95);
});

const historyKey = (productionId) => `cutinapp_creative_history_${productionId || "global"}`;
const loadHistory = (productionId) => {
  try { return JSON.parse(localStorage.getItem(historyKey(productionId)) || "[]").slice(0, 8); } catch (_) { return []; }
};
const saveHistory = (productionId, item) => {
  try {
    const next = [item, ...loadHistory(productionId)].slice(0, 8);
    localStorage.setItem(historyKey(productionId), JSON.stringify(next));
    return next;
  } catch (_) { return []; }
};

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
  const [candidates, setCandidates] = useState([]);
  const [selectedVariation, setSelectedVariation] = useState("");
  const [isFinal, setIsFinal] = useState(false);
  const [referenceImages, setReferenceImages] = useState([]);
  const [referenceNames, setReferenceNames] = useState([]);
  const [history, setHistory] = useState([]);
  const lastInputRef = useRef(null);

  const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
  const canOpen = pathname === "/event/create" || /^\/event\/edit\/[^/]+$/.test(pathname);
  const format = formats[formatKey] || formats.cover;
  const styleOptions = useMemo(() => Array.isArray(presetCatalog?.styles) && presetCatalog.styles.length ? presetCatalog.styles : Object.entries(themes).map(([key, item]) => ({ key, label: item.label })), [presetCatalog]);
  const intensityOptions = useMemo(() => Array.isArray(presetCatalog?.intensities) && presetCatalog.intensities.length ? presetCatalog.intensities : Object.entries(intensities).map(([key, item]) => ({ key, label: item.label })), [presetCatalog]);

  useEffect(() => () => { if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => {
    if (!canOpen || presetCatalog) return;
    creativeService.getEventCreativePresets().then(setPresetCatalog).catch(() => {});
  }, [canOpen, presetCatalog]);

  const resetPreview = () => {
    setGeneratedFile(null); setPreview(""); setAiError(""); setGenerationSource(""); setCandidates([]); setSelectedVariation(""); setIsFinal(false);
  };

  const openStudio = async () => {
    const data = readFormContext(); setContext(data); setOpen(true); setError(""); setAiError(""); resetPreview(); setProduction(null); setHistory(loadHistory(data.productionId));
    if (data.productionId) {
      try { setProduction(await cutinappService.getProduction(data.productionId)); } catch (_) { /* identity optional */ }
    }
  };

  useEffect(() => {
    const handler = () => { if (canOpen) openStudio(); };
    window.addEventListener("cutinapp:open-event-flyer", handler);
    return () => window.removeEventListener("cutinapp:open-event-flyer", handler);
  });

  const buildInput = (data) => {
    const creativeContext = productionCreativeContext(production);
    const promotions = compactTextList(readFirstField("promotion_summary", "ticket_summary", "promotions"));
    return {
      title: data.title, description: data.description, category: data.category, artist: data.artist,
      style: themeKey, intensity: intensityKey, productionName: data.productionName, venue: data.venue, city: data.city, uf: data.uf,
      format: formatKey, brandContext: creativeContext.brandContext, brandColors: creativeContext.brandColors,
      referenceNotes: referenceImages.length ? "Use as imagens enviadas como referência de estilo/ambiente, sem copiar textos." : "",
      referenceImages, promotions, featuredItems: creativeContext.featuredItems,
      creativeMemory: history.map((item) => [item.theme, item.variation].filter(Boolean).join(" / ")).filter(Boolean).slice(0, 8),
      candidateCount: 3, includeCandidates: true,
    };
  };

  const composeFromBackground = async (data, background, finalState = false, variation = "") => {
    const canvas = await renderFlyer({ data, production, formatKey, themeKey, intensityKey, generatedBackground: background });
    const slug = (data.title || "evento").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "evento";
    const file = await canvasToFile(canvas, `flyer-${slug}-${formatKey}${finalState ? "-final" : "-preview"}.jpg`);
    if (!file?.size || file.size < 4096) throw new Error("A composição final ficou inválida. Gere novamente.");
    const url = URL.createObjectURL(file); if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    setPreview(url); setGeneratedFile(file); setIsFinal(finalState); if (variation) setSelectedVariation(variation);
    return file;
  };

  const generate = async (regenerationMode = "") => {
    setBusy(true); setError(""); setAiError(""); setGeneratedFile(null); setIsFinal(false);
    try {
      const data = readFormContext(); setContext(data); if (!data.title) throw new Error("Preencha o nome do evento antes de gerar o flyer.");
      const input = buildInput(data); lastInputRef.current = input;
      const aiResult = regenerationMode
        ? await creativeService.regenerateEventFlyerBackground(input, regenerationMode)
        : await creativeService.generateEventFlyerBackground(input);
      const main = String(aiResult?.image?.data_uri || "");
      if (!/^data:image\/(?:jpeg|jpg|png|webp).*;base64,/i.test(main) || main.length < 2048) throw new Error("A IA respondeu sem uma imagem utilizável.");
      const returned = (aiResult?.creative?.candidates || []).filter((item) => item?.image?.data_uri);
      setCandidates(returned);
      const variation = aiResult?.creative?.selected_candidate?.variation || returned[0]?.variation || "";
      setGenerationSource(aiResult?.image?.model || "cloudflare");
      await composeFromBackground(data, main, false, variation);
    } catch (err) {
      const message = err?.response?.data?.message || err?.message || "O serviço de IA não respondeu corretamente.";
      setAiError(message); setGenerationSource("local");
      try { await composeFromBackground(readFormContext(), "", false, "local"); } catch (composeError) { setError(composeError?.message || "Não foi possível montar o flyer."); }
    } finally { setBusy(false); }
  };

  const chooseCandidate = async (candidate) => {
    const background = candidate?.image?.data_uri; if (!background) return;
    setSelectedVariation(candidate.variation || ""); setGenerationSource(candidate?.image?.model || generationSource); setError("");
    try { await composeFromBackground(readFormContext(), background, false, candidate.variation || ""); } catch (err) { setError(err?.message || "Não foi possível aplicar esta opção."); }
  };

  const finalize = async () => {
    setBusy(true); setError(""); setAiError("");
    try {
      const data = readFormContext(); const input = lastInputRef.current || buildInput(data);
      const result = await creativeService.finalizeEventFlyerBackground(input, selectedVariation);
      const background = String(result?.image?.data_uri || "");
      if (!/^data:image\/(?:jpeg|jpg|png|webp).*;base64,/i.test(background) || background.length < 2048) throw new Error("A renderização premium não retornou uma imagem válida.");
      setGenerationSource(result?.image?.model || "cloudflare");
      await composeFromBackground(data, background, true, result?.creative?.selected_candidate?.variation || selectedVariation);
    } catch (err) { setError(err?.response?.data?.message || err?.message || "Não foi possível finalizar em alta qualidade."); }
    finally { setBusy(false); }
  };

  const onReferences = async (event) => {
    const files = Array.from(event.target.files || []).filter((file) => file.type.startsWith("image/")).slice(0, 4);
    if (!files.length) return;
    setBusy(true); setError("");
    try {
      const values = await Promise.all(files.map(fileToReferenceDataUri)); setReferenceImages(values); setReferenceNames(files.map((file) => file.name)); resetPreview();
    } catch (_) { setError("Não foi possível preparar uma das imagens de referência."); }
    finally { setBusy(false); }
  };

  const useAsCover = async () => {
    if (!generatedFile) { await generate(); return; }
    window.dispatchEvent(new CustomEvent("cutinapp:event-cover-selected", { detail: { file: generatedFile, source: "ai_flyer" } }));
    const input = document.querySelector('[data-event-image-input="true"]') || document.querySelector('input[name="image"][type="file"]');
    if (input && typeof DataTransfer !== "undefined") { const transfer = new DataTransfer(); transfer.items.add(generatedFile); input.files = transfer.files; }
    const item = { at: Date.now(), title: context.title, format: formatKey, theme: themeKey, intensity: intensityKey, variation: selectedVariation, source: generationSource, final: isFinal };
    setHistory(saveHistory(context.productionId, item));
    try {
      window.PeterTecnetTelemetry?.track?.("producer_event_flyer_generated", {
        label: context.title || "Evento", target: context.productionId || null,
        metadata: { format: formatKey, theme: themeKey, intensity: intensityKey, variation: selectedVariation || null, quality: isFinal ? "final" : "preview", source: generationSource },
      });
    } catch (_) { /* telemetry never blocks */ }
    setOpen(false);
  };

  const previewStyle = useMemo(() => ({ aspectRatio: `${format.width}/${format.height}` }), [format]);
  if (!canOpen) return null;

  return <>
    <Button type="button" className="cut-flyer-fab" onClick={openStudio} aria-label="Criar flyer automaticamente"><i className="fa-solid fa-wand-magic-sparkles" /><span>Criar flyer</span></Button>
    <Modal show={open} onHide={() => !busy && setOpen(false)} centered size="xl" className="cut-flyer-modal">
      <Modal.Header closeButton={!busy}><Modal.Title><i className="fa-solid fa-wand-magic-sparkles me-2" />Creative Studio</Modal.Title></Modal.Header>
      <Modal.Body>
        <div className="cut-flyer-intro"><div><strong>{context.title || "Seu evento"}</strong><span>O Diretor Criativo produz opções visuais; a Cutinapp escreve nome, data e local com os dados reais.</span></div><span className="cut-flyer-beta">PREMIUM AI</span></div>
        <div className="cut-flyer-layout">
          <div className="cut-flyer-controls">
            <Form.Group><Form.Label>Formato</Form.Label><div className="cut-flyer-options">{Object.entries(formats).map(([key, item]) => <Button key={key} type="button" variant={formatKey === key ? "primary" : "outline-light"} onClick={() => { setFormatKey(key); resetPreview(); }}><strong>{item.ratio}</strong><span>{item.label}</span></Button>)}</div></Form.Group>
            <Form.Group><Form.Label>Direção visual</Form.Label><div className="cut-flyer-options cut-flyer-options--themes">{styleOptions.map((item) => { const palette = themes[item.key] || themes.automatic; return <Button key={item.key} type="button" variant={themeKey === item.key ? "primary" : "outline-light"} onClick={() => { setThemeKey(item.key); resetPreview(); }}><span className="cut-flyer-theme-dot" style={{ background: `linear-gradient(135deg, ${palette.accent}, ${palette.secondary})` }} />{item.label}</Button>; })}</div></Form.Group>
            <Form.Group><Form.Label>Intensidade</Form.Label><div className="cut-flyer-options cut-flyer-options--intensity">{intensityOptions.map((item) => <Button key={item.key} type="button" variant={intensityKey === item.key ? "primary" : "outline-light"} onClick={() => { setIntensityKey(item.key); resetPreview(); }}><strong>{item.label}</strong><span>{intensities[item.key]?.description || "Direção criativa"}</span></Button>)}</div></Form.Group>
            <Form.Group><Form.Label>Referências visuais <span className="text-secondary">(até 4)</span></Form.Label><Form.Control type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={onReferences} disabled={busy} />{referenceNames.length > 0 && <div className="cut-flyer-reference-list">{referenceNames.map((name) => <span key={name}>{name}</span>)}<button type="button" onClick={() => { setReferenceImages([]); setReferenceNames([]); resetPreview(); }}>Limpar</button></div>}</Form.Group>
            {preview && <Form.Group><Form.Label>Ajustar sem perder o briefing</Form.Label><div className="cut-flyer-regeneration">{regenerationModes.map(([key, label]) => <Button key={key} size="sm" type="button" variant="outline-light" disabled={busy} onClick={() => generate(key)}>{label}</Button>)}</div></Form.Group>}
          </div>
          <div className="cut-flyer-stage">
            {error && <div className="alert alert-danger py-2">{error}</div>}
            {aiError && <div className="alert alert-warning py-2"><strong>IA indisponível:</strong> {aiError}</div>}
            <div className={`cut-flyer-preview ${isFinal ? "is-final" : ""}`} style={previewStyle}>{preview ? <img src={preview} alt="Prévia do flyer" /> : <div><i className="fa-regular fa-image" /><strong>Gere 3 propostas</strong><span>Primeiro usamos previews rápidos e econômicos. A opção escolhida é finalizada em alta qualidade.</span></div>}</div>
            {candidates.length > 1 && <div className="cut-flyer-candidates">{candidates.map((candidate) => <button type="button" key={candidate.variation} className={selectedVariation === candidate.variation ? "active" : ""} onClick={() => chooseCandidate(candidate)}><img src={candidate.image.data_uri} alt={`Opção ${candidate.variation}`} /><span>{candidate.variation} · nota {candidate?.quality?.score ?? "—"}</span></button>)}</div>}
            {generationSource && <small className="cut-flyer-note">{generationSource === "local" ? "Fallback local utilizado." : `${isFinal ? "Render premium" : "Preview"} · ${generationSource}${selectedVariation ? ` · ${selectedVariation}` : ""}`}</small>}
            <div className="cut-flyer-actions">
              <Button type="button" variant="outline-light" onClick={() => generate()} disabled={busy}>{busy ? <><Spinner size="sm" className="me-2" />Criando...</> : "Gerar 3 propostas"}</Button>
              {preview && generationSource !== "local" && !isFinal && <Button type="button" variant="warning" onClick={finalize} disabled={busy}>Finalizar em alta qualidade</Button>}
              <Button type="button" onClick={useAsCover} disabled={busy || !generatedFile}>{isFinal ? "Usar flyer final" : "Usar esta arte"}</Button>
            </div>
            <small className="cut-flyer-note">A IA nunca escreve o conteúdo oficial. Título, data, local e identidade são compostos pela Cutinapp para eliminar erros de português e informações inventadas.</small>
          </div>
        </div>
      </Modal.Body>
    </Modal>
  </>;
}
