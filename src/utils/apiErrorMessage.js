export const humanizeApiErrorMessage = (value, status, code) => {
  const raw = String(value || "").trim();

  if (!status) {
    if (code === "ECONNABORTED" || /timeout|timed out/i.test(raw)) {
      return "A API demorou mais que o esperado para responder. Tente novamente em instantes.";
    }
    if (!raw || /network error|failed to fetch|load failed/i.test(raw)) {
      return "Não foi possível concluir a comunicação com o servidor. Isso pode ser uma indisponibilidade da API ou um bloqueio do navegador. Tente novamente.";
    }
  }

  // Defense in depth: a malformed production 5xx response must never expose
  // SQL fragments, filesystem paths, stack traces or provider diagnostics.
  if (status >= 500) {
    return "O servidor não conseguiu concluir a solicitação. Tente novamente.";
  }

  if (!raw) {
    if (status === 401) return "Sua sessão expirou. Entre novamente para continuar.";
    if (status === 403) return "Você não possui permissão para realizar esta ação.";
    if (status === 404) return "O registro solicitado não foi encontrado.";
    if (status === 408) return "A solicitação expirou. Tente novamente.";
    if (status === 409) return "Esta operação entrou em conflito com o estado atual. Atualize a página e tente novamente.";
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
