import apiClient from "./ApiClient";

const apiServiceUrl = "production";
const multipart = { headers: { "Content-Type": "multipart/form-data" } };

const productionService = {
  store: async (formData) => {
    const response = await apiClient.post(`/${apiServiceUrl}`, formData, multipart);
    return response.data.message;
  },

  list: async () => {
    const response = await apiClient.get(`/${apiServiceUrl}`);
    return response.data.productions || [];
  },

  update: async (productionId, formData) => {
    const response = await apiClient.post(`/${apiServiceUrl}/${productionId}`, formData, multipart);
    return response.data.message;
  },

  show: async (productionId) => {
    const response = await apiClient.get(`/${apiServiceUrl}/show/${productionId}`);
    return response.data.production;
  },

  view: async (slug) => apiClient.get(`/${apiServiceUrl}/${slug}`),

  delete: async (productionId) => {
    const response = await apiClient.delete(`/${apiServiceUrl}/${productionId}`);
    return response.data.message;
  },

  companyInfo: async (cnpj) => {
    const response = await apiClient.get(`/${apiServiceUrl}/get-company-info`, {
      params: { cnpj },
    });
    return response.data;
  },
};

export default productionService;
