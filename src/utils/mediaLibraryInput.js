const MEDIA_ACCEPT_TOKENS = [
  "image/", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif",
  "audio/", ".mp3", ".m4a", ".aac", ".ogg", ".oga", ".wav", ".opus",
  "video/", ".mp4", ".mov", ".m4v", ".webm",
];

const SENSITIVE_UPLOAD_TOKENS = [
  "documento",
  "document",
  "identidade",
  "identity",
  "cnh",
  "rg",
  "cpf",
  "kyc",
  "comprovante",
  "proof",
];

export const mediaLibraryTypeForInput = (input) => {
  const accept = String(input?.accept || "").toLowerCase();
  const types = [];
  if (accept.includes("image/") || /\.(png|jpe?g|webp|gif|avif)(,|$)/i.test(accept)) types.push("image");
  if (accept.includes("audio/") || /\.(mp3|m4a|aac|ogg|oga|wav|opus)(,|$)/i.test(accept)) types.push("audio");
  if (accept.includes("video/") || /\.(mp4|mov|m4v|webm)(,|$)/i.test(accept)) types.push("video");
  return types.length === 1 ? types[0] : "";
};

export const isEligibleMediaLibraryInput = (input) => {
  if (!(input instanceof HTMLInputElement) || input.type !== "file") return false;
  if (input.dataset.mediaLibrary === "off") return false;

  const accept = String(input.accept || "").toLowerCase();
  if (!MEDIA_ACCEPT_TOKENS.some((token) => accept.includes(token))) return false;
  if (accept.includes("application/pdf")) return false;

  const contextText = [
    input.name,
    input.id,
    input.getAttribute("aria-label"),
    input.closest(".form-group, .mb-3, .card, fieldset")?.textContent,
  ].filter(Boolean).join(" ").toLowerCase();

  return !SENSITIVE_UPLOAD_TOKENS.some((token) => contextText.includes(token));
};
