import { getRetryDelayMs, shouldRetryRequest } from "./ApiClient";
import { humanizeApiErrorMessage } from "../utils/apiErrorMessage";

describe("ApiClient error messages", () => {
  test("never exposes backend internals for 5xx responses", () => {
    const internal = "SQLSTATE[42S22]: Column not found at /var/www/api/app/Models/Pass.php:91";

    expect(humanizeApiErrorMessage(internal, 500)).toBe(
      "O servidor não conseguiu concluir a solicitação. Tente novamente."
    );
    expect(humanizeApiErrorMessage("upstream connect error: 127.0.0.1:8080", 502)).toBe(
      "O servidor não conseguiu concluir a solicitação. Tente novamente."
    );
  });

  test("keeps actionable client-side and validation messages", () => {
    expect(humanizeApiErrorMessage("validation.unique", 422)).toBe(
      "Já existe um registro com esta informação."
    );
    expect(humanizeApiErrorMessage("", 403)).toBe(
      "Você não possui permissão para realizar esta ação."
    );
    expect(humanizeApiErrorMessage("", 401)).toBe(
      "Sua sessão expirou. Entre novamente para continuar."
    );
  });

  test("keeps network failures understandable without technical details", () => {
    expect(humanizeApiErrorMessage("Network Error", undefined, "ERR_NETWORK")).toBe(
      "Não foi possível conectar ao servidor. Verifique sua internet e tente novamente."
    );
    expect(humanizeApiErrorMessage("timeout of 20000ms exceeded", undefined, "ECONNABORTED")).toBe(
      "A solicitação demorou mais que o esperado. Verifique sua conexão e tente novamente."
    );
  });
});

describe("ApiClient transient retry policy", () => {
  test("retries transient failures only for read-only methods", () => {
    expect(shouldRetryRequest({
      config: { method: "get" },
      response: { status: 503 },
    })).toBe(true);

    expect(shouldRetryRequest({
      config: { method: "post" },
      response: { status: 503 },
    })).toBe(false);

    expect(shouldRetryRequest({
      config: { method: "post" },
      code: "ERR_NETWORK",
    })).toBe(false);
  });

  test("does not retry client errors or exceed the retry budget", () => {
    expect(shouldRetryRequest({
      config: { method: "get" },
      response: { status: 422 },
    })).toBe(false);

    expect(shouldRetryRequest({
      config: { method: "get", _peterRetryCount: 2 },
      response: { status: 503 },
    })).toBe(false);
  });

  test("retries temporary network failures for safe requests", () => {
    expect(shouldRetryRequest({
      config: { method: "get" },
      code: "ERR_NETWORK",
    })).toBe(true);

    expect(shouldRetryRequest({
      config: { method: "head" },
      code: "ECONNABORTED",
    })).toBe(true);
  });

  test("honors Retry-After while capping excessive waits", () => {
    expect(getRetryDelayMs({
      config: { _peterRetryCount: 0 },
      response: { headers: { "retry-after": "2" } },
    })).toBe(2000);

    expect(getRetryDelayMs({
      config: { _peterRetryCount: 0 },
      response: { headers: { "retry-after": "60" } },
    })).toBe(5000);
  });
});
