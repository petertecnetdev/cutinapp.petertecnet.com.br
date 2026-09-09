import { storageUrl } from "../config";
import "../styles/event-media.css";

export const EVENT_FLYER_RECOMMENDED_WIDTH = 1080;
export const EVENT_FLYER_RECOMMENDED_HEIGHT = 1920;
export const EVENT_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

const absoluteUrl = (value) => /^https?:\/\//i.test(String(value || ""));
const pipelineVariantPattern = /\/(?:original|thumbnail|card|feed|hero|background|og)\.webp$/i;

export const eventMediaPath = (value, variant = "original") => {
  if (!value) return "";
  const image = String(value);
  if (absoluteUrl(image)) return image;

  const normalized = image.replace(/^\/+/, "");
  if (!pipelineVariantPattern.test(normalized)) return normalized;

  const supported = new Set(["original", "thumbnail", "card", "feed", "hero", "background", "og"]);
  const requested = supported.has(variant) ? variant : "original";
  return normalized.replace(pipelineVariantPattern, `/${requested}.webp`);
};

export const eventImageUrl = (value, variant = "original") => {
  const path = eventMediaPath(value, variant);
  if (!path) return "";
  return absoluteUrl(path) ? path : `${storageUrl}${path.replace(/^\/+/, "")}`;
};

export const eventMediaBackgroundStyle = (value) => {
  const background = eventImageUrl(value, "background") || eventImageUrl(value, "original");
  return background ? { "--cut-event-media-bg": `url("${background}")` } : undefined;
};

export const fallbackToOriginalEventImage = (event, originalValue) => {
  const fallback = eventImageUrl(originalValue, "original");
  if (!fallback || event.currentTarget.src === fallback) return;
  event.currentTarget.onerror = null;
  event.currentTarget.src = fallback;
};

export const classifyImageQuality = (width) => {
  const numericWidth = Number(width || 0);
  if (numericWidth >= 1080) return { level: "excellent", label: "Excelente" };
  if (numericWidth >= 900) return { level: "good", label: "Boa" };
  if (numericWidth >= 720) return { level: "acceptable", label: "Aceitável" };
  if (numericWidth >= 480) return { level: "low", label: "Baixa" };
  return { level: "very-low", label: "Muito baixa" };
};

export const inspectImageFile = async (file) => {
  if (!file) return null;

  let width = 0;
  let height = 0;

  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    width = bitmap.width;
    height = bitmap.height;
    bitmap.close?.();
  } else {
    const objectUrl = URL.createObjectURL(file);
    try {
      const dimensions = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = reject;
        image.src = objectUrl;
      });
      width = dimensions.width;
      height = dimensions.height;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  const quality = classifyImageQuality(width);
  return {
    width,
    height,
    aspectRatio: height > 0 ? width / height : 0,
    orientation: width === height ? "square" : width > height ? "landscape" : "portrait",
    quality,
    meetsRecommendedFlyerSize: width >= EVENT_FLYER_RECOMMENDED_WIDTH && height >= EVENT_FLYER_RECOMMENDED_HEIGHT,
  };
};
