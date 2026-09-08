const timeoutCodes = new Set(["ECONNABORTED", "ETIMEDOUT"]);

export const classifyApiFailure = ({ value, status, code, networkStatus = "unknown" } = {}) => {
  const raw = String(value || "").trim();
  const normalizedCode = String(code || "").toUpperCase();
  const numericStatus = Number(status || 0);

  if (networkStatus === "offline") return "offline";
  if (timeoutCodes.has(normalizedCode) || /timeout|timed out/i.test(raw) || numericStatus === 408) return "timeout";
  if (numericStatus === 401) return "auth";
  if (numericStatus === 403) return "permission";
  if (numericStatus === 409) return "conflict";
  if (numericStatus === 422) return "validation";
  if (numericStatus === 429) return "rate_limit";
  if (numericStatus >= 500) return "server";
  if (!numericStatus && (!raw || /network error|failed to fetch|load failed/i.test(raw) || normalizedCode === "ERR_NETWORK")) return "transport";
  if (numericStatus >= 400) return "http";
  return "unknown";
};

export const humanizeApiErrorMessage = (value, status, code, context = {}) => {
  const raw = String(value || "").trim();
  const kind = classifyApiFailure({ value, status, code, networkStatus: context.networkStatus });

  if (kind === "offline") {
    return "Seu dispositivo está sem conexão com a internet. Reconecte-se e tente novamente.";
  }
  if (kind === "timeout") {
    return "A API demorou mais que o esperado para responder. Sua conexão pode estar funcionando normalmente; tente novamente em instantes.";
  }
  if (kind === "transport") {
    return "A comunicação com a API foi interrompida. Isso pode indicar indisponibilidade do servidor, bloqueio CORS ou falha temporária de rede. Tente novamente.";
  }

  // Defense in depth: malformed 5xx responses must never expose SQL fragments,
  // filesystem paths, stack traces or provider diagnostics to the interface.
  if (Number(status || 0) >= 500) {
    return "O servidor não conseguiu concluir a solicitação. Tente novamente em instantes.";
  }

  if (!raw) {
    if (status === 401) return "Sua sessão expirou. Entre novamente para continuar.";
    if (status === 403) return "Você não possui permissão para realizar esta ação.";
    if (status === 404) return "O registro solicitado não foi encontrado.";
    if (status === 408) return "A solicitação expirou. Tente novamente.";
    if (status === 409) return "Esta operação ainda está sendo processada ou entrou em conflito. Aguarde um instante e tente novamente.";
    if (status === 422) return "Revise os campos informados e tente novamente.";
    if (status === 429) return "Muitas solicitações foram feitas em pouco tempo. Aguarde um instante e tente novamente.";
    return "Não foi possível concluir a solicitação.";
  }

  const keyMap = {
    "validation.required": "Preencha os campos obrigatórios.",
    "validation.unique": "Já existe um registro com esta informação.",
    "validation.exists": "Uma das informações selecionadas não existe mais.",
  };

  if (keyMap[raw]) return keyMap[raw];
  if (/^(the given data was invalid|dados enviados são inválidos|os dados fornecidos são inválidos)\.?$/i.test(raw)) {
    return "Revise os campos informados e tente novamente.";
  }
  if (status === 429 && /too many requests/i.test(raw)) {
    return "Muitas solicitações foram feitas em pouco tempo. Aguarde um instante e tente novamente.";
  }
  return raw;
};

export const apiDiagnostic = (error) => {
  if (!error) return null;
  const requestId = String(error.requestId || error?.response?.headers?.["x-request-id"] || "").trim();
  const status = Number(error.status || error?.response?.status || 0) || null;
  const code = String(error.code || "").trim() || null;
  const kind = String(error.kind || "").trim() || null;
  if (!requestId && !status && !code && !kind) return null;
  return { requestId: requestId || null, status, code, kind };
};
