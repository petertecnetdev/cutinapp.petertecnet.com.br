import { apiV1BaseUrl } from "../config";
import { normalizeCommercePaymentStatuses } from "../utils/commercePaymentStatus";
import { createApiClient } from "./ApiClient";

const appApiClient = createApiClient(apiV1BaseUrl);

appApiClient.interceptors.response.use((response) => {
  const requestUrl = String(response?.config?.url || "");
  if (requestUrl.includes("/commerce/")) {
    response.data = normalizeCommercePaymentStatuses(response.data);
  }
  return response;
});

export default appApiClient;
