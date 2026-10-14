/**
 * Reuses the Cutinapp SweetAlert conventions for incomplete event registration.
 * Plain text (not HTML) is deliberately supplied to showImportantAlert so that
 * the shared helper escapes content before rendering the dialog.
 */
export const buildEventValidationAlert = (fieldLabels = []) => {
  const missing = fieldLabels.map((label) => String(label || "").trim()).filter(Boolean);
  return {
    title: missing.length === 1 ? "Falta revisar 1 campo" : `Falta revisar ${missing.length} campos`,
    text: missing.map((label) => `• ${label}`).join("\n"),
    icon: "warning",
    confirmButtonText: "Revisar campos",
    allowOutsideClick: false,
    enableRecoveryAction: false,
  };
};
