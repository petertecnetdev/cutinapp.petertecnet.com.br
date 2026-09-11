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
  const status = Number(error?.response?.status || error?.status || 0);
  const config = error?.config || error?.response?.config;
  const requestUrl = String(config?.url || "");
  const match = requestUrl.match(/\/establishments\/(\d+)\/items(?:\?|$)/);

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
