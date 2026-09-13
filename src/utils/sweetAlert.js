const fallbackResult = (confirmed = true) => ({
  isConfirmed: confirmed,
  isDenied: false,
  isDismissed: !confirmed,
});

const nativeAlert = typeof window !== "undefined" && typeof window.alert === "function"
  ? window.alert.bind(window)
  : null;

const nativeConfirm = typeof window !== "undefined" && typeof window.confirm === "function"
  ? window.confirm.bind(window)
  : null;

const getSwal = () => {
  if (typeof window === "undefined") return null;
  return window.Swal || null;
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
  const message = String(value ?? "").trim();
  if (!message) {
    return {
      title: "Atenção",
      text: "Há uma informação importante que precisa da sua atenção.",
      icon: "info",
    };
  }

  const lines = message
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  let title = "Atenção";
  let text = message;

  if (lines.length > 1 && lines[0].length <= 90) {
    title = lines[0];
    text = lines.slice(1).join(" ");
  }

  const normalized = message.toLocaleLowerCase("pt-BR");
  let icon = "info";

  if (/erro|falha|não foi possível|nao foi possivel|inválid|invalido|indisponível|indisponivel/.test(normalized)) {
    icon = "error";
  } else if (/atenção|atencao|aviso|não encontr|nao encontr|necessário|necessario|obrigat|pendente/.test(normalized)) {
    icon = "warning";
  } else if (/sucesso|concluíd|concluid|salvo|criado|atualizado/.test(normalized)) {
    icon = "success";
  }

  return { title, text, icon };
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
  const Swal = getSwal();

  if (!Swal) {
    const message = [title, text].filter(Boolean).join("\n\n");
    if (showCancelButton && nativeConfirm) {
      return fallbackResult(nativeConfirm(message));
    }
    if (nativeAlert) nativeAlert(message);
    return fallbackResult(true);
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

export const installGlobalSweetAlertBridge = () => {
  if (typeof window === "undefined" || window.__cutSweetAlertBridgeInstalled) return;

  window.__cutSweetAlertBridgeInstalled = true;
  window.__cutNativeAlert = nativeAlert;

  window.alert = (message) => {
    const alert = normalizeLegacyAlert(message);
    void showImportantAlert({
      ...alert,
      confirmButtonText: "Entendi",
      allowOutsideClick: false,
      allowEscapeKey: false,
    });
  };
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
