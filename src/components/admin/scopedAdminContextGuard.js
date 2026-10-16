/**
 * Fronteira de validação de contexto administrativo, isolada do runtime.
 * Não concede papéis, não cria permissões e não substitui a autorização da API.
 * A integração depende do contrato de application_id confirmado pelo backend.
 */
const MAX_SIGNED_64_BIT_ID = "9223372036854775807";

// IDs vindos de JSON numérico não podem ultrapassar a precisão segura do JavaScript.
// Para IDs maiores, aceitar apenas strings decimais canônicas dentro do limite de 64 bits.
const normalizeApplicationId = (value) => {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  }
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  if (value.length > MAX_SIGNED_64_BIT_ID.length ||
      (value.length === MAX_SIGNED_64_BIT_ID.length && value > MAX_SIGNED_64_BIT_ID)) return null;
  return value;
};

export const createScopedAdminContextGuard = () => {
  let activeScope = null;
  let generation = 0;
  const issuedRequests = new WeakSet();

  const invalidate = () => {
    generation += 1;
    activeScope = null;
  };

  const begin = ({ token, applicationId } = {}) => {
    const applicationKey = normalizeApplicationId(applicationId);
    if (typeof token !== "string" || !token.trim() || applicationKey === null) {
      invalidate();
      return null;
    }
    const scope = JSON.stringify([token, applicationKey]);
    if (scope !== activeScope) {
      generation += 1;
      activeScope = scope;
    }

    const request = Object.freeze({ generation, applicationId: applicationKey });
    issuedRequests.add(request);
    return request;
  };

  const resolve = (request, { status, context } = {}) => {
    if (!request || typeof request !== "object" || !issuedRequests.has(request)) return null;
    if (status !== undefined && (!Number.isInteger(status) || status < 200 || status >= 300)) {
      if (activeScope && request.generation === generation) invalidate();
      return null;
    }
    if (!activeScope || request.generation !== generation) return null;
    if (!context || context.authorized !== true) return null;
    if (normalizeApplicationId(context.application_id) !== request.applicationId) return null;
    return context;
  };

  return Object.freeze({ begin, resolve, invalidate });
};
