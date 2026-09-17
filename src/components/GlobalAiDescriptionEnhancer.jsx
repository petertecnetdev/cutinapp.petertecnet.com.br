import { useEffect } from "react";
import aiContentService from "../services/AiContentService";
import "./GlobalAiDescriptionEnhancer.css";

const DESCRIPTION_HINT = /(^|[_\-\s])(description|descricao|descrição)([_\-\s]|$)/i;
const SENSITIVE_HINT = /(password|senha|token|secret|segredo|cpf|cnpj|document|documento|email|e-mail|phone|telefone|celular|whatsapp|pix|bank|banco|account|conta|card|cartao|cartão|cvv|security|auth)/i;
const TITLE_NAMES = ["title", "name", "event_name", "production_name", "product_name", "item_name", "service_name"];
const MAX_CONTEXT_FIELDS = 24;

const textHint = (textarea) => [
  textarea.name,
  textarea.id,
  textarea.getAttribute("aria-label"),
  textarea.getAttribute("placeholder"),
  textarea.dataset.aiDescription,
].filter(Boolean).join(" ");

const isEligibleDescription = (textarea) => {
  if (!(textarea instanceof HTMLTextAreaElement)) return false;
  if (textarea.disabled || textarea.readOnly) return false;
  if (textarea.dataset.aiDescription === "off" || textarea.dataset.ptAiDescription === "off") return false;
  if (textarea.dataset.aiDescription === "on" || textarea.dataset.ptAiDescription === "on") return true;
  return DESCRIPTION_HINT.test(textHint(textarea));
};

const inferEntityType = () => {
  const path = String(window.location?.pathname || "").toLowerCase();
  if (path.includes("/event/")) return "event";
  if (path.includes("/production/")) return "production";
  if (path.includes("/item/") || path.includes("/items/")) return "item";
  if (path.includes("/product/") || path.includes("/products/")) return "product";
  if (path.includes("/service/") || path.includes("/services/")) return "service";
  if (path.includes("/establishment/") || path.includes("/establishments/")) return "establishment";
  if (path.includes("/artist/")) return "artist";
  if (path.includes("/profile/")) return "profile";
  return "generic";
};

const fieldValue = (field) => {
  if (field instanceof HTMLSelectElement) {
    const selected = field.options?.[field.selectedIndex];
    const label = selected?.textContent?.trim();
    return label && label.toLowerCase() !== "selecione" ? label : String(field.value || "").trim();
  }

  if (field instanceof HTMLInputElement && (field.type === "checkbox" || field.type === "radio")) {
    return field.checked ? String(field.value || "sim").trim() : "";
  }

  return String(field.value || "").trim();
};

const findTitle = (form, textarea) => {
  const scope = form || textarea.closest("section, article, .card, main") || document;

  for (const name of TITLE_NAMES) {
    const candidate = scope.querySelector?.(`input[name="${name}"]`);
    const value = candidate ? fieldValue(candidate) : "";
    if (value) return value.slice(0, 200);
  }

  const heading = scope.querySelector?.("h1, h2");
  return String(heading?.textContent || "").trim().slice(0, 200);
};

const collectContext = (form, textarea) => {
  if (!form) return {};

  const context = {};
  const fields = Array.from(form.querySelectorAll("input[name], select[name], textarea[name]"));

  for (const field of fields) {
    if (Object.keys(context).length >= MAX_CONTEXT_FIELDS) break;
    if (field === textarea) continue;
    if (field instanceof HTMLInputElement && ["password", "hidden", "file"].includes(field.type)) continue;

    const name = String(field.name || "").trim();
    if (!name || SENSITIVE_HINT.test(name)) continue;
    if (DESCRIPTION_HINT.test(name)) continue;

    const value = fieldValue(field);
    if (!value) continue;

    context[name.slice(0, 80)] = value.slice(0, 500);
  }

  return context;
};

const setReactCompatibleValue = (textarea, value) => {
  const prototype = Object.getPrototypeOf(textarea);
  const prototypeSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  const ownSetter = Object.getOwnPropertyDescriptor(textarea, "value")?.set;

  if (prototypeSetter && ownSetter !== prototypeSetter) {
    prototypeSetter.call(textarea, value);
  } else if (ownSetter) {
    ownSetter.call(textarea, value);
  } else {
    textarea.value = value;
  }

  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.dispatchEvent(new Event("change", { bubbles: true }));
};

const telemetry = (eventName, metadata = {}) => {
  try {
    window.PeterTecnetTelemetry?.track?.(eventName, {
      label: "Assistente de descrição com IA",
      target: String(window.location?.pathname || ""),
      metadata,
    });
  } catch (_) {
    // Telemetry must never block content editing.
  }
};

const createAssistant = (textarea) => {
  const container = document.createElement("div");
  container.className = "pt-ai-description";
  container.dataset.ptAiDescriptionGenerated = "true";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "pt-ai-description__button";

  const icon = document.createElement("i");
  icon.className = "fa-solid fa-wand-magic-sparkles";
  icon.setAttribute("aria-hidden", "true");

  const label = document.createElement("span");
  label.className = "pt-ai-description__label";

  const badge = document.createElement("span");
  badge.className = "pt-ai-description__badge";
  badge.textContent = "IA";
  badge.setAttribute("aria-hidden", "true");

  const status = document.createElement("span");
  status.className = "pt-ai-description__status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");

  button.append(icon, label, badge);
  container.append(button, status);

  const anchor = textarea;
  anchor.parentNode?.insertBefore(container, anchor);

  const syncLabel = () => {
    const hasText = String(textarea.value || "").trim().length > 0;
    label.textContent = hasText ? "Aprimorar com IA" : "Gerar descrição com IA";
    button.setAttribute(
      "aria-label",
      hasText ? "Aprimorar esta descrição com inteligência artificial" : "Gerar descrição com inteligência artificial",
    );
  };

  const setStatus = (message, state = "") => {
    status.textContent = message;
    status.dataset.state = state;
  };

  const onInput = () => {
    syncLabel();
    if (status.dataset.state === "success") setStatus("");
  };

  const onClick = async () => {
    if (button.disabled || textarea.disabled || textarea.readOnly) return;

    const form = textarea.closest("form");
    const title = findTitle(form, textarea);
    const currentDescription = String(textarea.value || "").trim();
    const context = collectContext(form, textarea);
    const entityType = inferEntityType();

    if (!title && !currentDescription && Object.keys(context).length === 0) {
      setStatus("Preencha ao menos o nome para a IA ter contexto.", "error");
      textarea.focus();
      return;
    }

    const mode = currentDescription ? "improve" : "generate";
    button.disabled = true;
    container.dataset.loading = "true";
    icon.className = "fa-solid fa-circle-notch fa-spin";
    label.textContent = mode === "improve" ? "Aprimorando..." : "Gerando...";
    setStatus("Criando uma descrição com base nos dados já preenchidos...", "loading");

    telemetry("ai_description_generation_started", {
      entity_type: entityType,
      mode,
      context_fields: Object.keys(context).length,
    });

    try {
      const result = await aiContentService.generateDescription({
        entityType,
        title,
        currentDescription,
        context,
      });

      setReactCompatibleValue(textarea, result.description);
      textarea.focus();
      textarea.setSelectionRange?.(result.description.length, result.description.length);
      setStatus(mode === "improve" ? "Descrição aprimorada. Você ainda pode editar o texto." : "Descrição criada. Você ainda pode editar o texto.", "success");

      telemetry("ai_description_generation_succeeded", {
        entity_type: entityType,
        mode,
        output_length: result.description.length,
        model: result?.meta?.model || null,
      });
    } catch (error) {
      const message = String(error?.message || "Não foi possível gerar a descrição agora.");
      setStatus(message, "error");
      telemetry("ai_description_generation_failed", {
        entity_type: entityType,
        mode,
        status: error?.status || null,
        code: error?.code || null,
      });
    } finally {
      button.disabled = false;
      delete container.dataset.loading;
      icon.className = "fa-solid fa-wand-magic-sparkles";
      syncLabel();
    }
  };

  textarea.addEventListener("input", onInput);
  button.addEventListener("click", onClick);
  syncLabel();

  return () => {
    textarea.removeEventListener("input", onInput);
    button.removeEventListener("click", onClick);
    container.remove();
  };
};

export default function GlobalAiDescriptionEnhancer() {
  useEffect(() => {
    if (typeof document === "undefined") return undefined;

    const cleanups = new Map();

    const enhance = (textarea) => {
      if (!isEligibleDescription(textarea) || textarea.dataset.ptAiDescriptionEnhanced === "true") return;

      textarea.dataset.ptAiDescriptionEnhanced = "true";
      const cleanupAssistant = createAssistant(textarea);

      cleanups.set(textarea, () => {
        cleanupAssistant();
        delete textarea.dataset.ptAiDescriptionEnhanced;
      });
    };

    const enhanceTree = (root) => {
      if (root instanceof HTMLTextAreaElement) enhance(root);
      root.querySelectorAll?.("textarea").forEach(enhance);
    };

    enhanceTree(document);

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) enhanceTree(node);
        });

        mutation.removedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          cleanups.forEach((cleanup, textarea) => {
            if (node === textarea || node.contains(textarea)) {
              cleanup();
              cleanups.delete(textarea);
            }
          });
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
