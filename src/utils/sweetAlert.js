const fallbackResult = (confirmed = true) => ({
  isConfirmed: confirmed,
  isDenied: false,
  isDismissed: !confirmed,
});

const getSwal = () => {
  if (typeof window === "undefined") return null;
  return window.Swal || null;
};

const waitForSwal = async (timeoutMs = 3000) => {
  const immediate = getSwal();
  if (immediate) return immediate;
  if (typeof window === "undefined") return null;

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => window.setTimeout(resolve, 40));
    const Swal = getSwal();
    if (Swal) return Swal;
  }

  return null;
};

const defaultClasses = {
  popup: "cut-swal-popup",
  title: "cut-swal-title",
  htmlContainer: "cut-swal-copy",
  actions: "cut-swal-actions",
  confirmButton: "btn btn-primary cut-swal-confirm",
  cancelButton: "btn btn-outline-light cut-swal-cancel",
};

const normalizeLegacyAlert = (value) => {
  const message = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!message) {
    return {
      title: "Atenção",
      text: "Há uma informação importante que precisa da sua atenção.",
      icon: "info",
    };
  }

  const normalized = message.toLocaleLowerCase("pt-BR");
  let icon = "info";

  if (/erro|falha|não foi possível|nao foi possivel|inválid|invalido|indisponível|indisponivel|não pode|nao pode/.test(normalized)) {
    icon = "error";
  } else if (/atenção|atencao|aviso|não encontr|nao encontr|necessário|necessario|obrigat|pendente|revise|selecione/.test(normalized)) {
    icon = "warning";
  } else if (/sucesso|concluíd|concluid|salvo|criado|atualizado|publicado|copiado/.test(normalized)) {
    icon = "success";
  }

  const title = icon === "error"
    ? "Não foi possível continuar"
    : icon === "warning"
      ? "Atenção"
      : icon === "success"
        ? "Concluído"
        : "Informação";

  return { title, text: message, icon };
};

export const resolveAlertRecoveryAction = (message, context = {}) => {
  const normalized = String(message || "").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();
  if (!normalized) return null;

  const productionId = Number(context?.productionId || context?.organizationId || 0);
  const eventId = Number(context?.eventId || 0);
  const productionQuery = productionId > 0 ? `?production=${encodeURIComponent(productionId)}&focus=activation` : "?focus=activation";
  const contractQuery = productionId > 0 ? `?production=${encodeURIComponent(productionId)}` : "";
  const eventQuery = eventId > 0 ? `?eventId=${encodeURIComponent(eventId)}` : "";

  if (/(recebiment|repasse|chave pix|prova de vida|biometria|identidade).*(ativ|verific|cadastr|pend|obrig|necess|falt)|ativ.*(recebiment|repasse)|cadastrar uma chave pix/.test(normalized)) {
    return {
      label: "Resolver recebimentos",
      url: `/producer/finance${productionQuery}`,
    };
  }

  if (/(termo de ades[aã]o|contrato do produtor|assinar.*termo|termo.*pendente)/.test(normalized)) {
    return {
      label: "Resolver termo de adesão",
      url: `/producer/contracts${contractQuery}`,
    };
  }

  if (/(e-?mail|email).*(verific|confirm)|verific.*(e-?mail|email)/.test(normalized)) {
    return {
      label: "Verificar e-mail",
      url: "/email-verify",
    };
  }

  if (/(nenhum ingresso|sem ingresso|cadastre.*ingresso|crie.*ingresso|pelo menos um ingresso|criar lote)/.test(normalized)) {
    return {
      label: "Gerenciar ingressos",
      url: `/ticket/create${eventQuery}`,
    };
  }

  if (/(nenhuma produ[cç][aã]o|sem produ[cç][aã]o|cadastre.*produ[cç][aã]o|crie.*produ[cç][aã]o)/.test(normalized)) {
    return {
      label: "Criar produção",
      url: "/production/create",
    };
  }

  if (eventId > 0 && /(revise nome|descri[cç][aã]o|endere[cç]o|datas?|hor[aá]rio|uf|capacidade).*(salvar|publicar|continuar)|dados essenciais/.test(normalized)) {
    return {
      label: "Corrigir dados do evento",
      url: `/event/edit/${eventId}#event-editor-info`,
    };
  }

  if (eventId > 0 && /(flyer|arte|imagem).*(falt|obrig|necess|revise|defin)/.test(normalized)) {
    return {
      label: "Corrigir arte do evento",
      url: `/event/edit/${eventId}#event-editor-media`,
    };
  }

  return null;
};

const bootstrapAlertInfo = (element) => {
  if (!(element instanceof HTMLElement)) return null;
  if (!element.matches(".alert")) return null;
  if (element.closest(".swal2-container")) return null;
  if (element.dataset.ptSwalIgnore === "true") return null;

  const text = String(element.textContent || "")
    .replace(/[×✕]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return null;

  let icon = "info";
  if (element.classList.contains("alert-danger")) icon = "error";
  else if (element.classList.contains("alert-warning")) icon = "warning";
  else if (element.classList.contains("alert-success")) icon = "success";

  const title = icon === "error"
    ? "Não foi possível continuar"
    : icon === "warning"
      ? "Atenção"
      : icon === "success"
        ? "Concluído"
        : "Informação";

  return {
    title,
    text,
    icon,
    key: [icon, text].join(":"),
  };
};

export const showImportantAlert = async ({
  title,
  text,
  icon = "info",
  confirmButtonText = "Entendi",
  cancelButtonText = "Cancelar",
  showCancelButton = false,
  allowOutsideClick = true,
  allowEscapeKey = true,
  recoveryContext = null,
  recoveryAction = null,
  enableRecoveryAction = true,
}) => {
  const Swal = getSwal() || await waitForSwal();

  if (!Swal) {
    // Nunca voltar para window.alert()/window.confirm().
    // Se o CDN do SweetAlert falhar, preservamos o fluxo sem abrir diálogo nativo.
    return fallbackResult(!showCancelButton);
  }

  const inferredRecoveryAction = enableRecoveryAction && icon === "error" && !showCancelButton
    ? resolveAlertRecoveryAction(text, recoveryContext || {})
    : null;
  const effectiveRecoveryAction = recoveryAction || inferredRecoveryAction;
  const result = await Swal.fire({
    title,
    text,
    icon,
    confirmButtonText: effectiveRecoveryAction?.label || confirmButtonText,
    cancelButtonText: effectiveRecoveryAction ? "Agora não" : cancelButtonText,
    showCancelButton: effectiveRecoveryAction ? true : showCancelButton,
    reverseButtons: true,
    buttonsStyling: false,
    customClass: defaultClasses,
    allowOutsideClick,
    allowEscapeKey,
    background: "#0d0d24",
    color: "#f7f5ff",
    backdrop: "rgba(2, 3, 18, .78)",
  });

  if (result?.isConfirmed && effectiveRecoveryAction?.url && typeof window !== "undefined") {
    window.location.assign(effectiveRecoveryAction.url);
  }

  return result;
};

const installBootstrapAlertObserver = () => {
  if (typeof document === "undefined") return () => undefined;

  let observer = null;

  const convert = (element) => {
    const info = bootstrapAlertInfo(element);
    if (!info || element.dataset.ptSwalKey === info.key) return;

    element.dataset.ptSwalKey = info.key;
    element.dataset.ptSwalConverted = "true";
    element.style.setProperty("display", "none", "important");

    const closeButton = element.querySelector(".btn-close, [data-bs-dismiss='alert']");
    void showImportantAlert({
      title: info.title,
      text: info.text,
      icon: info.icon,
      confirmButtonText: "Entendi",
      allowOutsideClick: info.icon === "success" || info.icon === "info",
      allowEscapeKey: true,
    }).finally(() => {
      if (closeButton instanceof HTMLElement && document.body.contains(closeButton)) {
        closeButton.click();
      }
    });
  };

  const scan = (root = document) => {
    if (root instanceof HTMLElement && root.matches(".alert")) convert(root);
    root.querySelectorAll?.(".alert").forEach(convert);
  };

  const start = () => {
    if (!document.body || observer) return;
    scan(document);
    observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "characterData") {
          const parent = mutation.target?.parentElement?.closest?.(".alert");
          if (parent) convert(parent);
          return;
        }

        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) scan(node);
        });

        const targetAlert = mutation.target instanceof HTMLElement
          ? mutation.target.closest?.(".alert")
          : null;
        if (targetAlert) convert(targetAlert);
      });
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  };

  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });

  return () => {
    document.removeEventListener("DOMContentLoaded", start);
    observer?.disconnect();
  };
};

export const installGlobalSweetAlertBridge = () => {
  if (typeof window === "undefined" || window.__cutSweetAlertBridgeInstalled) return;

  window.__cutSweetAlertBridgeInstalled = true;

  // Compatibilidade com qualquer trecho legado ainda chamando alert().
  // A aplicação nunca deve abrir o diálogo nativo do navegador.
  window.alert = (message) => {
    const alert = normalizeLegacyAlert(message);
    void showImportantAlert({
      ...alert,
      confirmButtonText: "Entendi",
      allowOutsideClick: false,
      allowEscapeKey: false,
    });
  };

  installBootstrapAlertObserver();
};

export const showProducerAgreementRequired = ({
  productionName = "esta produção",
} = {}) => showImportantAlert({
  title: "Termo de adesão pendente",
  text: `Antes de criar o primeiro evento de ${productionName}, é necessário ler e assinar o termo de adesão.`,
  icon: "warning",
  confirmButtonText: "Ler e assinar agora",
  cancelButtonText: "Agora não",
  showCancelButton: true,
  allowOutsideClick: false,
});

export default showImportantAlert;
