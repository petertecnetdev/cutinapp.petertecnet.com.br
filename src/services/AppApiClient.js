import { apiV1BaseUrl } from "../config";
import { normalizeCommercePaymentStatuses } from "../utils/commercePaymentStatus";
import { createApiClient } from "./ApiClient";

const appApiClient = createApiClient(apiV1BaseUrl);

const normalizeProductionItemsResponse = (response) => {
  if (!response) return response;
  const payload = response.data;
  if (Array.isArray(payload?.items)) {
    response.data = { ...payload, data: payload.items };
  } else if (Array.isArray(payload)) {
    response.data = { data: payload };
  }
  return response;
};

const responseHeader = (response, name) => {
  const headers = response?.headers || {};
  const normalizedName = String(name || "").toLowerCase();
  if (typeof headers?.get === "function") return headers.get(name) ?? headers.get(normalizedName);
  const key = Object.keys(headers).find((candidate) => String(candidate).toLowerCase() === normalizedName);
  return key ? headers[key] : undefined;
};

appApiClient.interceptors.response.use((response) => {
  const requestUrl = String(response?.config?.url || "");
  if (requestUrl.includes("/commerce/")) {
    response.data = normalizeCommercePaymentStatuses(response.data);
  }
  if (/\/establishments\/\d+\/items(?:\?|$)/.test(requestUrl)) {
    return normalizeProductionItemsResponse(response);
  }
  return response;
}, async (error) => {
  let status = Number(error?.response?.status || error?.status || 0);
  const config = error?.config || error?.response?.config;
  const requestUrl = String(config?.url || "");
  const match = requestUrl.match(/\/establishments\/(\d+)\/items(?:\?|$)/);

  // O middleware idempotente da API usa 425 enquanto a mesma mutação ainda
  // está executando. O checkout já possui recuperação limitada para o contrato
  // legado 409 + Idempotency-Status=processing. Normalize somente esse caso
  // específico para preservar a mesma Idempotency-Key e impedir nova cobrança.
  const idempotencyStatus = String(responseHeader(error?.response, "idempotency-status") || "").toLowerCase();
  if (status === 425 && requestUrl.includes("/commerce/") && idempotencyStatus === "processing") {
    if (error?.response) error.response.status = 409;
    error.status = 409;
    status = 409;
  }

  // Compatibilidade com o catálogo genérico legado. Algumas instalações ainda
  // expõem Item por /item/list-by-entity/{id}, enquanto a UI nova usa o contrato
  // /establishments/{id}/items. O fallback só acontece em 404 e uma única vez.
  if (status === 404 && match && !config?.__productionItemsFallback) {
    const fallbackConfig = {
      ...config,
      url: `/item/list-by-entity/${match[1]}`,
      method: "get",
      __productionItemsFallback: true,
    };
    delete fallbackConfig.data;
    const response = await appApiClient.request(fallbackConfig);
    return normalizeProductionItemsResponse(response);
  }

  return Promise.reject(error);
});

export default appApiClient;
