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
}) => {
  const Swal = getSwal() || await waitForSwal();

  if (!Swal) {
    // Nunca voltar para window.alert()/window.confirm().
    // Se o CDN do SweetAlert falhar, preservamos o fluxo sem abrir diálogo nativo.
    return fallbackResult(!showCancelButton);
  }

  return Swal.fire({
    title,
    text,
    icon,
    confirmButtonText,
    cancelButtonText,
    showCancelButton,
    reverseButtons: true,
    buttonsStyling: false,
    customClass: defaultClasses,
    allowOutsideClick,
    allowEscapeKey,
    background: "#0d0d24",
    color: "#f7f5ff",
    backdrop: "rgba(2, 3, 18, .78)",
  });
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
