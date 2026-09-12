const fallbackResult = (confirmed = true) => ({
  isConfirmed: confirmed,
  isDenied: false,
  isDismissed: !confirmed,
});

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
    if (showCancelButton && typeof window !== "undefined" && typeof window.confirm === "function") {
      return fallbackResult(window.confirm(message));
    }
    if (typeof window !== "undefined" && typeof window.alert === "function") window.alert(message);
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
