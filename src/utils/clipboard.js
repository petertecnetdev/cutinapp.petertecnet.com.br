const fallbackCopyText = (text) => {
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

  return fallbackCopyText(text);
};

export const installClipboardFallback = () => {
  if (typeof navigator === "undefined") return;

  const clipboard = navigator.clipboard;
  const nativeWriteText = clipboard?.writeText?.bind(clipboard);
  const resilientWriteText = async (value) => {
    const text = String(value ?? "");
    if (!text) return;

    if (nativeWriteText) {
      try {
        await nativeWriteText(text);
        return;
      } catch (_) {
        // Some mobile/webview contexts expose Clipboard API but deny it at runtime.
      }
    }

    if (!fallbackCopyText(text)) {
      throw new Error("Não foi possível copiar o conteúdo neste navegador.");
    }
  };

  try {
    if (clipboard) {
      Object.defineProperty(clipboard, "writeText", {
        configurable: true,
        value: resilientWriteText,
      });
      return;
    }

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: resilientWriteText },
    });
  } catch (_) {
    // Browsers may expose readonly navigator properties; callers can still use copyText directly.
  }
};

export default copyText;
