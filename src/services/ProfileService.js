import apiClient from "./ApiClient";

const apiServiceUrl = "profile";

const profileService = {
  list: async () => {
    const response = await apiClient.get(`/${apiServiceUrl}`);
    return response.data.profiles || [];
  },

  create: async (data) => apiClient.post(`/${apiServiceUrl}`, data),

  update: async (id, data) => apiClient.put(`/${apiServiceUrl}/${id}`, data),

  show: async (id) => {
    const response = await apiClient.get(`/${apiServiceUrl}/${id}`);
    return response.data.profile;
  },

  destroy: async (id) => {
    const response = await apiClient.delete(`/${apiServiceUrl}/${id}`);
    return response.data?.message || "Perfil excluído com sucesso.";
  },
};

export default profileService;
