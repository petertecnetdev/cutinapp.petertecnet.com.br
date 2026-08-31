import axios from "axios";
import { apiBaseUrl, appSlug } from "../config";

const apiClient = axios.create({
  baseURL: apiBaseUrl,
  timeout: 20000,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-Peter-App": appSlug,
  },
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
    }

    const data = error.response?.data;
    const message =
      data?.message ||
      data?.error ||
      (data?.errors && Object.values(data.errors).flat().filter(Boolean)[0]) ||
      error.message ||
      "Não foi possível concluir a solicitação.";

    const normalizedError = new Error(message);
    normalizedError.status = error.response?.status;
    normalizedError.errors = data?.errors || null;
    normalizedError.original = error;
    return Promise.reject(normalizedError);
  }
);

export default apiClient;
