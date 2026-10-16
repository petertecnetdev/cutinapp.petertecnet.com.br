/**
 * Fronteira de validação de contexto administrativo, isolada do runtime.
 * Não concede papéis, não cria permissões e não substitui a autorização da API.
 * A integração depende do contrato de application_id confirmado pelo backend.
 */
export const createScopedAdminContextGuard = () => {
  let activeScope = null;
  let generation = 0;
  const issuedRequests = new WeakSet();

  const invalidate = () => {
    generation += 1;
    activeScope = null;
  };

  const begin = ({ token, applicationId } = {}) => {
    if (!token || applicationId === null || applicationId === undefined || String(applicationId) === "") {
      invalidate();
      return null;
    }

    const applicationKey = String(applicationId);
    const scope = JSON.stringify([String(token), applicationKey]);
    if (scope !== activeScope) {
      generation += 1;
      activeScope = scope;
    }

    const request = Object.freeze({ generation, applicationId: applicationKey });
    issuedRequests.add(request);
    return request;
  };

  const resolve = (request, { status, context } = {}) => {
    if (!request || !issuedRequests.has(request)) return null;
    if (status !== undefined && (!Number.isInteger(status) || status < 200 || status >= 300)) {
      if (activeScope && request.generation === generation) invalidate();
      return null;
    }
    if (!activeScope || request.generation !== generation) return null;
    if (!context || context.authorized !== true) return null;
    if (context.application_id === null || context.application_id === undefined) return null;
    if (String(context.application_id) !== request.applicationId) return null;
    return context;
  };

  return Object.freeze({ begin, resolve, invalidate });
};
