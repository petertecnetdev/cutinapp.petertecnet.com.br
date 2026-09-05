import { humanizeMessage } from "./ApiClient";

describe("ApiClient error messages", () => {
  test("never exposes backend internals for 5xx responses", () => {
    const internal = "SQLSTATE[42S22]: Column not found at /var/www/api/app/Models/Pass.php:91";

    expect(humanizeMessage(internal, 500)).toBe(
      "O servidor não conseguiu concluir a solicitação. Tente novamente."
    );
    expect(humanizeMessage("upstream connect error: 127.0.0.1:8080", 502)).toBe(
      "O servidor não conseguiu concluir a solicitação. Tente novamente."
    );
  });

  test("keeps actionable client-side and validation messages", () => {
    expect(humanizeMessage("validation.unique", 422)).toBe(
      "Já existe um registro com esta informação."
    );
    expect(humanizeMessage("", 403)).toBe(
      "Você não possui permissão para realizar esta ação."
    );
    expect(humanizeMessage("", 401)).toBe(
      "Sua sessão expirou. Entre novamente para continuar."
    );
  });

  test("keeps network failures understandable without technical details", () => {
    expect(humanizeMessage("Network Error", undefined, "ERR_NETWORK")).toBe(
      "Não foi possível conectar ao servidor. Verifique sua internet e tente novamente."
    );
    expect(humanizeMessage("timeout of 20000ms exceeded", undefined, "ECONNABORTED")).toBe(
      "A solicitação demorou mais que o esperado. Verifique sua conexão e tente novamente."
    );
  });
});
