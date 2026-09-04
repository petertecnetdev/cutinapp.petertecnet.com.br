export const copyText = async (value) => {
  const text = String(value ?? "");
  if (!text) return false;

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      // Fallback below covers browsers/contexts where Clipboard API is denied.
    }
  }

  if (typeof document === "undefined" || !document.body) return false;

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  textarea.style.left = "-9999px";

  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  let copied = false;
  try {
    copied = typeof document.execCommand === "function" && document.execCommand("copy");
  } catch (_) {
    copied = false;
  } finally {
    document.body.removeChild(textarea);
  }

  return copied;
};

export default copyText;
