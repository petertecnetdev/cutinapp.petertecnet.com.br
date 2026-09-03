import axios from "axios";
import { apiBaseUrl, apiV1BaseUrl, appSlug } from "../config";

const firstValidationMessage = (errors) => {
  if (!errors || typeof errors !== "object") return "";
  return Object.values(errors).flat().find((value) => typeof value === "string" && value.trim()) || "";
};

const humanizeMessage = (value, status) => {
  const raw = String(value || "").trim();
  if (!raw) {
    if (status === 403) return "Você não possui permissão para realizar esta ação.";
    if (status === 404) return "O registro solicitado não foi encontrado.";
    if (status === 422) return "Revise os campos informados e tente novamente.";
    if (status >= 500) return "O servidor não conseguiu concluir a solicitação. Tente novamente.";
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
  return raw;
};

const createApiClient = (baseURL) => {
  const client = axios.create({
    baseURL,
    timeout: 20000,
    headers: {
      Accept: "application/json",
      "X-Peter-App": appSlug,
    },
  });

  client.interceptors.request.use((config) => {
    const token = localStorage.getItem("token");
    if (token) config.headers.Authorization = `Bearer ${token}`;

    const isFormData = typeof FormData !== "undefined" && config.data instanceof FormData;
    if (isFormData) {
      // Never force multipart/form-data here. The browser must add the boundary.
      if (typeof config.headers?.delete === "function") {
        config.headers.delete("Content-Type");
      } else if (config.headers) {
        delete config.headers["Content-Type"];
        delete config.headers["content-type"];
      }
    } else if (config.data != null && config.headers) {
      config.headers["Content-Type"] = "application/json";
    }

    return config;
  });

  client.interceptors.response.use(
    (response) => response,
    (error) => {
      const status = error.response?.status;
      const requestUrl = String(error.config?.url || "");
      const keepSessionOn401 =
        requestUrl.includes("/auth/login") ||
        requestUrl.includes("/auth/google") ||
        requestUrl.includes("/auth/change-password");

      if (status === 401 && !keepSessionOn401) {
        localStorage.removeItem("token");
      }

      const data = error.response?.data;
      const validationMessage = firstValidationMessage(data?.errors);
      const candidate = validationMessage || data?.message || data?.error || error.message;
      const message = humanizeMessage(candidate, status);

      const normalizedError = new Error(message);
      normalizedError.status = status;
      normalizedError.errors = data?.errors || null;
      normalizedError.original = error;
      return Promise.reject(normalizedError);
    }
  );

  return client;
};

const apiClient = createApiClient(apiBaseUrl);
const applicationApiClient = createApiClient(apiV1BaseUrl);

export { applicationApiClient };
export default apiClient;
