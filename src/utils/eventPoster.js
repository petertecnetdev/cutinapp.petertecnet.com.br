export const EVENT_POSTER_WIDTH = 1024;
export const EVENT_POSTER_HEIGHT = 1536;
export const EVENT_POSTER_RATIO = EVENT_POSTER_WIDTH / EVENT_POSTER_HEIGHT;
export const EVENT_POSTER_MAX_BYTES = 5 * 1024 * 1024;
export const EVENT_POSTER_SOURCE_MAX_BYTES = 30 * 1024 * 1024;
export const EVENT_POSTER_SOURCE_MAX_DIMENSION = 12000;
export const EVENT_POSTER_SOURCE_MAX_PIXELS = 60 * 1000 * 1000;
export const EVENT_POSTER_HINT = "Qualquer imagem pode ser ajustada. A Cutinapp converte para 1024 × 1536 px (2:3) antes do envio.";

const EVENT_POSTER_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));

const normalizedRotation = (rotation) => {
  const value = Math.round(Number(rotation) || 0);
  return ((value % 360) + 360) % 360;
};

const presetFilter = (preset) => {
  switch (preset) {
    case "vivid":
      return { brightness: 104, contrast: 112, saturation: 128, sepia: 0, hue: 0, grayscale: 0 };
    case "warm":
      return { brightness: 103, contrast: 106, saturation: 116, sepia: 10, hue: -6, grayscale: 0 };
    case "cool":
      return { brightness: 102, contrast: 106, saturation: 112, sepia: 0, hue: 10, grayscale: 0 };
    case "mono":
      return { brightness: 104, contrast: 118, saturation: 0, sepia: 0, hue: 0, grayscale: 100 };
    default:
      return { brightness: 100, contrast: 100, saturation: 100, sepia: 0, hue: 0, grayscale: 0 };
  }
};

const buildFilter = ({
  preset = "original",
  brightness = 100,
  contrast = 100,
  saturation = 100,
  background = false,
} = {}) => {
  if (background) {
    return "blur(28px) brightness(48%) saturate(125%)";
  }

  const base = presetFilter(preset);
  const effectiveBrightness = clamp((base.brightness * clamp(brightness, 20, 180)) / 100, 10, 220);
  const effectiveContrast = clamp((base.contrast * clamp(contrast, 20, 180)) / 100, 10, 220);
  const effectiveSaturation = clamp((base.saturation * clamp(saturation, 0, 200)) / 100, 0, 260);

  return [
    `brightness(${effectiveBrightness}%)`,
    `contrast(${effectiveContrast}%)`,
    `saturate(${effectiveSaturation}%)`,
    `sepia(${base.sepia}%)`,
    `hue-rotate(${base.hue}deg)`,
    `grayscale(${base.grayscale}%)`,
  ].join(" ");
};

export const loadEventPosterImage = (file) => new Promise((resolve, reject) => {
  if (!file) {
    reject(new Error("Nenhuma imagem foi selecionada."));
    return;
  }

  const objectUrl = URL.createObjectURL(file);
  const image = new Image();

  image.onload = () => {
    URL.revokeObjectURL(objectUrl);
    resolve(image);
  };

  image.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    reject(new Error("Não foi possível ler esta imagem. Envie um JPG, PNG ou WebP válido."));
  };

  image.src = objectUrl;
});

const fitScale = ({ image, width, height, mode, rotation }) => {
  const rotate = normalizedRotation(rotation);
  const swapsAxis = rotate === 90 || rotate === 270;
  const sourceWidth = swapsAxis ? image.naturalHeight : image.naturalWidth;
  const sourceHeight = swapsAxis ? image.naturalWidth : image.naturalHeight;

  if (mode === "fit") return Math.min(width / sourceWidth, height / sourceHeight);
  return Math.max(width / sourceWidth, height / sourceHeight);
};

const drawImage = (ctx, image, {
  width,
  height,
  mode = "fill",
  zoom = 1,
  panX = 0,
  panY = 0,
  rotation = 0,
  flipX = false,
  flipY = false,
  filter = "none",
}) => {
  const scale = fitScale({ image, width, height, mode, rotation }) * clamp(zoom, 1, 3);

  ctx.save();
  ctx.translate(
    width / 2 + clamp(panX, -0.55, 0.55) * width,
    height / 2 + clamp(panY, -0.55, 0.55) * height,
  );
  ctx.rotate((normalizedRotation(rotation) * Math.PI) / 180);
  ctx.scale(flipX ? -scale : scale, flipY ? -scale : scale);
  ctx.filter = filter;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  ctx.restore();
};

export const renderEventPosterCanvas = (canvas, image, options = {}) => {
  if (!canvas || !image) return;

  const width = Math.max(1, Number(canvas.width) || EVENT_POSTER_WIDTH);
  const height = Math.max(1, Number(canvas.height) || EVENT_POSTER_HEIGHT);
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return;

  ctx.save();
  ctx.filter = "none";
  ctx.fillStyle = "#050505";
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  if (options.mode === "fit") {
    drawImage(ctx, image, {
      width,
      height,
      mode: "fill",
      zoom: 1.08,
      panX: 0,
      panY: 0,
      rotation: options.rotation,
      flipX: options.flipX,
      flipY: options.flipY,
      filter: buildFilter({ background: true }),
    });
  }

  drawImage(ctx, image, {
    width,
    height,
    mode: options.mode === "fit" ? "fit" : "fill",
    zoom: options.zoom,
    panX: options.panX,
    panY: options.panY,
    rotation: options.rotation,
    flipX: options.flipX,
    flipY: options.flipY,
    filter: buildFilter(options),
  });
};

const canvasToBlob = (canvas, quality) => new Promise((resolve, reject) => {
  canvas.toBlob((blob) => {
    if (!blob) {
      reject(new Error("Não foi possível gerar a imagem final."));
      return;
    }
    resolve(blob);
  }, "image/jpeg", quality);
});

const safePosterName = (fileName = "evento.jpg") => {
  const base = String(fileName || "evento")
    .replace(/\.[^.]+$/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "") || "evento";

  return `${base}-1024x1536.jpg`;
};

export const normalizeEventPosterFile = async (file, options = {}) => {
  const validation = await validateEventPosterFile(file);
  if (!validation.ok) throw new Error(validation.message);

  const image = await loadEventPosterImage(file);
  const canvas = document.createElement("canvas");
  canvas.width = EVENT_POSTER_WIDTH;
  canvas.height = EVENT_POSTER_HEIGHT;

  renderEventPosterCanvas(canvas, image, options);

  let quality = 0.9;
  let blob = await canvasToBlob(canvas, quality);

  while (blob.size > EVENT_POSTER_MAX_BYTES && quality > 0.58) {
    quality -= 0.08;
    blob = await canvasToBlob(canvas, quality);
  }

  if (blob.size > EVENT_POSTER_MAX_BYTES) {
    throw new Error("A imagem final ainda ficou muito grande. Reduza o zoom ou escolha outra imagem.");
  }

  return new File([blob], safePosterName(file.name), {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
};

export const validateEventPosterFile = async (file) => {
  if (!file) return { ok: true, width: 0, height: 0, normalized: false };

  const mimeType = String(file.type || "").toLowerCase();
  if (!EVENT_POSTER_TYPES.has(mimeType)) {
    return { ok: false, message: "Envie uma imagem JPG, PNG ou WebP." };
  }

  if (file.size > EVENT_POSTER_SOURCE_MAX_BYTES) {
    return { ok: false, message: "A imagem original deve ter no máximo 30 MB para poder ser editada." };
  }

  try {
    const image = await loadEventPosterImage(file);
    const width = Number(image.naturalWidth || 0);
    const height = Number(image.naturalHeight || 0);
    if (!width || !height) throw new Error("Dimensões inválidas.");

    if (width > EVENT_POSTER_SOURCE_MAX_DIMENSION || height > EVENT_POSTER_SOURCE_MAX_DIMENSION || (width * height) > EVENT_POSTER_SOURCE_MAX_PIXELS) {
      return {
        ok: false,
        message: "A imagem tem resolução excessiva para edição segura. Use uma imagem de até 12.000 px por lado e 60 megapixels.",
      };
    }

    const ratio = width / height;
    return {
      ok: true,
      width,
      height,
      normalized: Math.abs(ratio - EVENT_POSTER_RATIO) > 0.005
        || width !== EVENT_POSTER_WIDTH
        || height !== EVENT_POSTER_HEIGHT
        || mimeType !== "image/jpeg",
    };
  } catch (error) {
    return {
      ok: false,
      message: error?.message || "Não foi possível ler esta imagem. Envie um JPG, PNG ou WebP válido.",
    };
  }
};
