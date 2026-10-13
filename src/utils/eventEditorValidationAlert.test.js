import { buildEventValidationAlert } from "./eventEditorValidationAlert";

describe("create-event required-field SweetAlert", () => {
  it("lists every missing field in the shared modal instead of an inline grid alert", () => {
    expect(buildEventValidationAlert([
      "Descrição",
      "Endereço do evento",
      "Cidade",
      "UF (2 letras)",
    ])).toEqual({
      title: "Falta revisar 4 campos",
      text: "• Descrição\n• Endereço do evento\n• Cidade\n• UF (2 letras)",
      icon: "warning",
      confirmButtonText: "Revisar campos",
      allowOutsideClick: false,
      enableRecoveryAction: false,
    });
  });

  it("uses singular grammar when one field remains", () => {
    const alert = buildEventValidationAlert(["Descrição"]);
    expect(alert.title).toBe("Falta revisar 1 campo");
    expect(alert.text).toBe("• Descrição");
  });

  it("discards blank labels and keeps copy in plain text", () => {
    const alert = buildEventValidationAlert([" ", "Cidade", ""]);
    expect(alert.title).toBe("Falta revisar 1 campo");
    expect(alert.text).toBe("• Cidade");
    expect(alert).not.toHaveProperty("html");
  });
});
