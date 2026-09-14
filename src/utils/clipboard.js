const focusWithoutJump = (element) => {
  if (!element || typeof element.focus !== "function") return;
  try {
    element.focus({ preventScroll: true });
  } catch (_) {
    element.focus();
  }
};

const fallbackCopyText = (text) => {
  if (typeof document === "undefined" || !document.body) return false;

  const previousActiveElement = document.activeElement;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.setAttribute("aria-hidden", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.width = "1px";
  textarea.style.height = "1px";
  textarea.style.padding = "0";
  textarea.style.border = "0";
  textarea.style.fontSize = "16px";
  textarea.style.opacity = "0.001";
  textarea.style.pointerEvents = "none";

  document.body.appendChild(textarea);
  focusWithoutJump(textarea);
  textarea.select();
  if (typeof textarea.setSelectionRange === "function") {
    textarea.setSelectionRange(0, textarea.value.length);
  }

  let copied = false;
  try {
    copied = typeof document.execCommand === "function" && document.execCommand("copy");
  } catch (_) {
    copied = false;
  } finally {
    document.body.removeChild(textarea);
    if (previousActiveElement && previousActiveElement !== document.body) {
      focusWithoutJump(previousActiveElement);
    }
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
