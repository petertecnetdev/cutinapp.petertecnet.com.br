import { useEffect } from "react";
import "./GlobalImageInputEnhancer.css";

const IMAGE_HINT = /(image|imagem|avatar|logo|banner|cover|capa|photo|foto|flyer|picture|thumbnail|thumb|media|midia)/i;
const VISUAL_HINT = /(image|imagem|avatar|logo|banner|cover|capa|photo|foto|flyer|preview|media|midia)/i;
const LEGACY_TRIGGER_HINT = /(btn|button|upload|alterar|trocar|escolher|selecionar|change)/i;

let imageInputSequence = 0;

const textHint = (input) => [
  input.name,
  input.id,
  input.getAttribute("aria-label"),
  input.getAttribute("data-image-kind"),
  input.getAttribute("data-role"),
].filter(Boolean).join(" ");

const isImageInput = (input) => {
  if (!(input instanceof HTMLInputElement) || input.type !== "file") return false;
  if (input.closest('[data-global-image-uploader="true"]')) return false;
  if (input.dataset.imageEnhancer === "off" || input.dataset.ptImageEnhancer === "off") return false;

  const accept = String(input.accept || "").toLowerCase();
  return accept.includes("image/") || accept.includes(".png") || accept.includes(".jpg")
    || accept.includes(".jpeg") || accept.includes(".webp") || IMAGE_HINT.test(textHint(input));
};

const inferShape = (input) => {
  const hint = textHint(input);
  if (/(avatar|perfil|profile|user|usuario)/i.test(hint)) return "avatar";
  if (/logo/i.test(hint)) return "logo";
  if (/(banner|cover|capa|flyer|hero)/i.test(hint)) return "cover";
  return "image";
};

const inputLabel = (input) => {
  const explicit = input.getAttribute("aria-label") || input.dataset.label;
  if (explicit) return explicit;

  const group = input.closest(".form-group, .mb-3, .form-field, fieldset, .card, .col, [class*='field']");
  const label = group?.querySelector("label");
  const text = label?.textContent?.trim();
  return text || "imagem";
};

const visualTargetFrom = (input) => {
  const labels = Array.from(input.labels || []);
  const visualLabel = labels.find((label) => (
    label.querySelector("img, picture, [class*='preview'], [class*='upload-placeholder'], [class*='avatar'], [class*='logo'], [class*='banner'], [class*='cover']")
    || VISUAL_HINT.test(String(label.className || ""))
  ));
  if (visualLabel) return visualLabel;

  const parent = input.parentElement;
  if (!parent) return null;

  const nearby = parent.querySelector(
    "[data-image-preview], [data-image-picker], .image-preview, .avatar-preview, .logo-preview, .banner-preview, .cover-preview, .photo-preview, [class*='image-preview'], [class*='upload-preview'], [class*='upload-placeholder'], [class*='avatar-preview'], [class*='logo-preview'], [class*='banner-preview'], [class*='cover-preview']"
  );
  if (nearby && nearby !== input) return nearby;

  const sibling = input.previousElementSibling;
  if (sibling?.querySelector?.("img") || sibling?.matches?.("img, picture, [class*='image-preview'], [class*='upload-preview'], [class*='upload-placeholder'], [class*='avatar-preview'], [class*='logo-preview'], [class*='banner-preview'], [class*='cover-preview']")) return sibling;

  return null;
};

const markLegacyTextTriggers = (input) => {
  Array.from(input.labels || []).forEach((label) => {
    const hasVisual = Boolean(label.querySelector("img, picture, [class*='preview']"));
    if (!hasVisual && LEGACY_TRIGGER_HINT.test(String(label.className || ""))) {
      label.dataset.ptImageLegacyTrigger = "true";
    }
  });
};

const createPickerSurface = (input) => {
  if (!input.id) {
    imageInputSequence += 1;
    input.id = `pt-image-input-${imageInputSequence}`;
  }

  const shape = inferShape(input);
  const label = document.createElement("label");
  label.className = "pt-image-input-surface";
  label.htmlFor = input.id;
  label.tabIndex = input.disabled ? -1 : 0;
  label.dataset.ptImageGenerated = "true";
  label.dataset.ptImageShape = shape;
  label.setAttribute("role", "button");
  label.setAttribute("aria-label", `Selecionar ${inputLabel(input)}`);

  const frame = document.createElement("span");
  frame.className = "pt-image-input-surface__frame";

  const preview = document.createElement("img");
  preview.className = "pt-image-input-surface__preview";
  preview.alt = "";
  preview.hidden = true;

  const placeholder = document.createElement("span");
  placeholder.className = "pt-image-input-surface__placeholder";
  placeholder.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 5.75A1.75 1.75 0 0 1 5.75 4h12.5A1.75 1.75 0 0 1 20 5.75v12.5A1.75 1.75 0 0 1 18.25 20H5.75A1.75 1.75 0 0 1 4 18.25V5.75Zm1.5 0v8.66l3.03-3.03a1.75 1.75 0 0 1 2.48 0l1.63 1.63 1.63-1.63a1.75 1.75 0 0 1 2.48 0l1.75 1.75V5.75a.25.25 0 0 0-.25-.25H5.75a.25.25 0 0 0-.25.25Zm13 9.5-2.81-2.81a.25.25 0 0 0-.36 0l-4.69 4.69-2.11-2.11a.25.25 0 0 0-.36 0L5.5 17.69v.56c0 .14.11.25.25.25h12.5a.25.25 0 0 0 .25-.25v-3ZM8.25 7.25a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z"/>
    </svg>
    <strong>Clique para adicionar imagem</strong>
    <small>PNG, JPG ou WebP</small>
  `;

  const action = document.createElement("span");
  action.className = "pt-image-input-surface__action";
  action.innerHTML = '<span aria-hidden="true">✎</span><span>Alterar imagem</span>';
  action.hidden = true;

  frame.append(preview, placeholder, action);
  label.append(frame);

  label.addEventListener("keydown", (event) => {
    if (input.disabled) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      input.click();
    }
  });

  input.parentNode?.insertBefore(label, input);
  return { label, preview, placeholder, action };
};

const enableExistingVisual = (input, target) => {
  target.dataset.ptImageClickable = "true";
  target.tabIndex = input.disabled ? -1 : (target.tabIndex >= 0 ? target.tabIndex : 0);
  if (!target.getAttribute("role")) target.setAttribute("role", "button");
  if (!target.getAttribute("aria-label")) target.setAttribute("aria-label", `Alterar ${inputLabel(input)}`);

  const click = (event) => {
    if (input.disabled) return;
    if (event.target?.closest?.("button, a, input, select, textarea")) return;
    event.preventDefault();
    input.click();
  };
  const keydown = (event) => {
    if (input.disabled) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      input.click();
    }
  };

  target.addEventListener("click", click);
  target.addEventListener("keydown", keydown);
  return () => {
    target.removeEventListener("click", click);
    target.removeEventListener("keydown", keydown);
    delete target.dataset.ptImageClickable;
  };
};

export default function GlobalImageInputEnhancer() {
  useEffect(() => {
    if (typeof document === "undefined") return undefined;

    const cleanups = new Map();

    const enhance = (input) => {
      if (!isImageInput(input) || input.dataset.ptImageEnhanced === "true") return;

      input.dataset.ptImageEnhanced = "true";
      input.classList.add("pt-image-input-native");
      markLegacyTextTriggers(input);

      const existingVisual = visualTargetFrom(input);
      let generated = null;
      let removeVisualListeners = null;
      let objectUrl = "";

      if (existingVisual) {
        removeVisualListeners = enableExistingVisual(input, existingVisual);
      } else {
        generated = createPickerSurface(input);
      }

      const syncPreview = () => {
        if (!generated) return;

        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
          objectUrl = "";
        }

        const files = Array.from(input.files || []);
        const file = files.find((candidate) => String(candidate?.type || "").startsWith("image/")) || files[0];

        if (!file) {
          generated.preview.removeAttribute("src");
          generated.preview.hidden = true;
          generated.placeholder.hidden = false;
          generated.action.hidden = true;
          return;
        }

        objectUrl = URL.createObjectURL(file);
        generated.preview.src = objectUrl;
        generated.preview.hidden = false;
        generated.placeholder.hidden = true;
        generated.action.hidden = false;
        generated.label.dataset.ptImageHasPreview = "true";
        generated.label.setAttribute("aria-label", `Alterar ${inputLabel(input)}`);

        const selectedText = generated.action.querySelector("span:last-child");
        if (selectedText) selectedText.textContent = files.length > 1 ? `Alterar ${files.length} imagens` : "Alterar imagem";
      };

      input.addEventListener("change", syncPreview);

      cleanups.set(input, () => {
        input.removeEventListener("change", syncPreview);
        removeVisualListeners?.();
        generated?.label?.remove();
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        input.classList.remove("pt-image-input-native");
        delete input.dataset.ptImageEnhanced;
        Array.from(input.labels || []).forEach((label) => delete label.dataset.ptImageLegacyTrigger);
      });
    };

    const enhanceTree = (root) => {
      if (root instanceof HTMLInputElement) enhance(root);
      root.querySelectorAll?.('input[type="file"]').forEach(enhance);
    };

    enhanceTree(document);

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) enhanceTree(node);
        });
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      cleanups.forEach((cleanup) => cleanup());
      cleanups.clear();
    };
  }, []);

  return null;
}
