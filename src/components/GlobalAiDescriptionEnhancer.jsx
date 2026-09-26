import { useEffect } from "react";
import aiContentService from "../services/AiContentService";
import "./GlobalAiDescriptionEnhancer.css";

const DESCRIPTION_HINT = /(^|[_\-\s])(description|descricao|descrição)([_\-\s]|$)/i;
const SENSITIVE_HINT = /(password|senha|token|secret|segredo|cpf|cnpj|document|documento|email|e-mail|phone|telefone|celular|whatsapp|pix|bank|banco|account|conta|card|cartao|cartão|cvv|security|auth)/i;
const TITLE_NAMES = ["title", "name", "event_name", "production_name", "product_name", "item_name", "service_name"];
const MAX_CONTEXT_FIELDS = 24;
const MAX_INLINE_MEDIA_BYTES = 5 * 1024 * 1024;

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

const inferEntityId = (entityType) => {
  const path = String(window.location?.pathname || "");
  const patterns = entityType === "event"
    ? [/\/event\/edit\/(\d+)(?:\/|$)/i, /\/event\/(\d+)\/edit(?:\/|$)/i, /\/event\/(\d+)(?:\/|$)/i]
    : entityType === "production"
      ? [/\/production\/edit\/(\d+)(?:\/|$)/i, /\/production\/(\d+)\/edit(?:\/|$)/i, /\/production\/(\d+)(?:\/|$)/i]
      : [];

  for (const pattern of patterns) {
    const match = path.match(pattern);
    if (match?.[1]) return match[1];
  }

  return "";
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

const editorScope = (textarea) => textarea.closest(
  "form, .cut-event-inline-editor, .cut-production-inline-editor, main, [role='main']",
) || document;

const collectContext = (scope, textarea) => {
  if (!scope) return {};

  const context = {};
  const fields = Array.from(scope.querySelectorAll("input[name], select[name], textarea[name]"));

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

const fileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ""));
  reader.onerror = () => reject(new Error("Não foi possível ler a arte anexada."));
  reader.readAsDataURL(file);
});

const collectMedia = async (scope) => {
  const input = Array.from(scope?.querySelectorAll?.('input[type="file"]') || [])
    .find((candidate) => candidate.files?.[0]?.type?.startsWith("image/"));
  const file = input?.files?.[0];
  if (!file) return [];
  if (file.size > MAX_INLINE_MEDIA_BYTES) {
    throw new Error("A arte excede 5 MB. Salve a imagem primeiro ou envie uma versão menor.");
  }
  if (!/^image\/(?:png|jpe?g|webp)$/i.test(file.type)) {
    throw new Error("Use uma arte JPG, PNG ou WebP para gerar a descrição.");
  }
  return [{ kind: "flyer", dataUrl: await fileAsDataUrl(file) }];
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

  const actions = document.createElement("div");
  actions.className = "pt-ai-description__actions";

  const createButton = ({ action, iconClass, text, secondary = false }) => {
    const actionButton = document.createElement("button");
    actionButton.type = "button";
    actionButton.dataset.aiAction = action;
    actionButton.className = "pt-ai-description__button" + (secondary ? " is-secondary" : "");

    const actionIcon = document.createElement("i");
    actionIcon.className = iconClass;
    actionIcon.setAttribute("aria-hidden", "true");

    const actionLabel = document.createElement("span");
    actionLabel.className = "pt-ai-description__label";
    actionLabel.textContent = text;

    actionButton.append(actionIcon, actionLabel);
    return { button: actionButton, icon: actionIcon, label: actionLabel };
  };

  const primary = createButton({
    action: "improve",
    iconClass: "fa-solid fa-wand-magic-sparkles",
    text: "Aprimorar com IA",
  });

  const badge = document.createElement("span");
  badge.className = "pt-ai-description__badge";
  badge.textContent = "IA";
  badge.setAttribute("aria-hidden", "true");
  primary.button.append(badge);

  const rewrite = createButton({
    action: "rewrite",
    iconClass: "fa-solid fa-arrows-rotate",
    text: "Outra versão",
    secondary: true,
  });

  const enrich = createButton({
    action: "enrich",
    iconClass: "fa-solid fa-layer-group",
    text: "Enriquecer",
    secondary: true,
  });

  const actionButtons = [primary, rewrite, enrich];
  actions.append(...actionButtons.map(({ button: actionButton }) => actionButton));

  const status = document.createElement("span");
  status.className = "pt-ai-description__status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");

  container.append(actions, status);
  textarea.parentNode?.insertBefore(container, textarea);

  const syncLabel = () => {
    const hasText = String(textarea.value || "").trim().length > 0;
    primary.label.textContent = hasText ? "Aprimorar com IA" : "Gerar com IA";
    primary.button.setAttribute(
      "aria-label",
      hasText ? "Corrigir, enriquecer e aprimorar esta descrição com inteligência artificial" : "Gerar descrição com inteligência artificial",
    );
    rewrite.button.disabled = !hasText && container.dataset.loading !== "true";
  };

  const setStatus = (message, state = "") => {
    status.textContent = message;
    status.dataset.state = state;
  };

  const onInput = () => {
    syncLabel();
    if (status.dataset.state === "success") setStatus("");
  };

  const setLoading = (loading, activeAction = "") => {
    if (loading) container.dataset.loading = "true";
    actionButtons.forEach(({ button: actionButton, icon: actionIcon }) => {
      actionButton.disabled = loading;
      const isActive = actionButton.dataset.aiAction === activeAction;
      if (loading && isActive) {
        actionIcon.dataset.originalClass = actionIcon.className;
        actionIcon.className = "fa-solid fa-circle-notch fa-spin";
      } else if (!loading && actionIcon.dataset.originalClass) {
        actionIcon.className = actionIcon.dataset.originalClass;
        delete actionIcon.dataset.originalClass;
      }
    });
    if (!loading) {
      delete container.dataset.loading;
      syncLabel();
    }
  };

  const runAction = async (action, event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (container.dataset.loading === "true" || textarea.disabled || textarea.readOnly) return;

    const scope = editorScope(textarea);
    const title = findTitle(scope, textarea);
    const currentDescription = String(textarea.value || "").trim();
    const context = collectContext(scope, textarea);
    const entityType = inferEntityType();
    const entityId = inferEntityId(entityType);
    if (entityId) context.entityId = entityId;

    if (!title && !currentDescription && Object.keys(context).length === 0) {
      setStatus("Preencha ao menos o nome para a IA ter contexto.", "error");
      textarea.focus();
      return;
    }

    setLoading(true, action);
    const actionMessages = {
      improve: currentDescription
        ? "Corrigindo seu texto e enriquecendo a ideia com os dados reais do evento..."
        : "Criando uma descrição a partir dos dados reais do evento...",
      rewrite: "Criando uma versão realmente diferente das anteriores...",
      enrich: "Buscando contexto, histórico e dados confirmados para enriquecer o texto...",
    };
    setStatus(actionMessages[action] || actionMessages.improve, "loading");

    telemetry("ai_description_generation_started", {
      entity_type: entityType,
      action,
      context_fields: Object.keys(context).length,
    });

    try {
      const media = await collectMedia(scope);
      const result = await aiContentService.generateDescription({
        entityType,
        title,
        currentDescription,
        context,
        action,
        locale: navigator.language || document.documentElement.lang || "pt-BR",
        media,
        useAttachedMedia: media.length > 0 || Boolean(entityId),
      });

      setReactCompatibleValue(textarea, result.description);
      textarea.focus();
      textarea.setSelectionRange?.(result.description.length, result.description.length);

      const successMessages = {
        improve: "Descrição revisada e enriquecida. Você ainda pode editar o texto.",
        rewrite: "Nova versão criada sem repetir o texto anterior.",
        enrich: "Descrição enriquecida com os dados confirmados do evento.",
      };
      const mediaStatus = result?.meta?.media_status;
      const hasMediaConflicts = Array.isArray(result?.meta?.media_conflicts) && result.meta.media_conflicts.length > 0;
      const mediaMessage = hasMediaConflicts
        ? " A arte diverge de campos preenchidos; os dados conflitantes não foram usados. Revise antes de publicar."
        : mediaStatus === "used"
          ? " A arte anexada também foi analisada; confira datas, valores e regras antes de publicar."
        : mediaStatus === "unavailable"
          ? " A arte não pôde ser lida; o texto usou apenas os campos preenchidos."
          : "";
      setStatus((successMessages[action] || successMessages.improve) + mediaMessage, "success");

      telemetry("ai_description_generation_succeeded", {
        entity_type: entityType,
        action,
        output_length: result.description.length,
        model: result?.meta?.model || null,
        prompt_version: result?.meta?.prompt_version || null,
        media_status: mediaStatus || "not_requested",
        media_conflicts: result?.meta?.media_conflicts?.length || 0,
      });
    } catch (error) {
      const message = String(error?.message || "Não foi possível gerar a descrição agora.");
      setStatus(message, "error");
      telemetry("ai_description_generation_failed", {
        entity_type: entityType,
        action,
        status: error?.status || null,
        code: error?.code || null,
      });
    } finally {
      setLoading(false);
    }
  };

  const listeners = actionButtons.map(({ button: actionButton }) => {
    const handler = (event) => runAction(actionButton.dataset.aiAction || "improve", event);
    actionButton.addEventListener("click", handler);
    return [actionButton, handler];
  });

  textarea.addEventListener("input", onInput);
  syncLabel();

  return () => {
    textarea.removeEventListener("input", onInput);
    listeners.forEach(([actionButton, handler]) => actionButton.removeEventListener("click", handler));
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
