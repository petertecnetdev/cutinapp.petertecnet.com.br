const IMAGE_ACCEPT_TOKENS = ["image/", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"];
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

export const isEligibleMediaLibraryInput = (input) => {
  if (!(input instanceof HTMLInputElement) || input.type !== "file") return false;
  if (input.dataset.mediaLibrary === "off") return false;

  const accept = String(input.accept || "").toLowerCase();
  if (!IMAGE_ACCEPT_TOKENS.some((token) => accept.includes(token))) return false;
  if (accept.includes("application/pdf")) return false;

  const contextText = [
    input.name,
    input.id,
    input.getAttribute("aria-label"),
    input.closest(".form-group, .mb-3, .card, fieldset")?.textContent,
  ].filter(Boolean).join(" ").toLowerCase();

  return !SENSITIVE_UPLOAD_TOKENS.some((token) => contextText.includes(token));
};
