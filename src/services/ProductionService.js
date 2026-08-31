import apiClient from "./ApiClient";

const apiServiceUrl = "production";
const multipart = { headers: { "Content-Type": "multipart/form-data" } };

const productionService = {
  store: async (formData) => {
    const response = await apiClient.post(`/${apiServiceUrl}`, formData, multipart);
    return response.data;
  },

  list: async () => {
    const response = await apiClient.get(`/${apiServiceUrl}`);
    const value = response.data.productions;
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.data)) return value.data;
    return [];
  },

  update: async (productionId, formData) => {
    const response = await apiClient.post(`/${apiServiceUrl}/${productionId}`, formData, multipart);
    return response.data;
  },

  show: async (productionId) => {
    const response = await apiClient.get(`/${apiServiceUrl}/show/${productionId}`);
    return response.data.production;
  },

  view: async (slug) => {
    const response = await apiClient.get(`/${apiServiceUrl}/${slug}`);
    return response.data;
  },

  delete: async (productionId) => {
    const response = await apiClient.delete(`/${apiServiceUrl}/${productionId}`);
    return response.data;
  },

  companyInfo: async (cnpj) => {
    const normalized = String(cnpj || "").replace(/\D/g, "");
    const response = await apiClient.get(`/${apiServiceUrl}/cnpj/get-company-info`, {
      params: { cnpj: normalized },
    });
    return response.data;
  },
};

export default productionService;
