import apiClient from "./ApiClient";

const apiServiceUrl = "user";
const multipart = { headers: { "Content-Type": "multipart/form-data" } };

const userService = {
  list: async () => {
    const response = await apiClient.get(`/${apiServiceUrl}`);
    return response.data;
  },

  search: async (query, perPage = 10) => {
    const response = await apiClient.get(`/${apiServiceUrl}/search`, {
      params: { q: String(query || "").trim(), per_page: perPage },
    });
    return response.data;
  },

  update: async (userId, userData) => {
    const response = await apiClient.post(`/${apiServiceUrl}/${userId}`, userData, multipart);
    return response.data;
  },

  store: async (userData) => {
    const response = await apiClient.post(`/${apiServiceUrl}/new`, userData);
    return response.data;
  },

  show: async (userId) => {
    const response = await apiClient.get(`/${apiServiceUrl}/${userId}`);
    return response.data;
  },

  view: async (userName) => {
    const response = await apiClient.get(`/${apiServiceUrl}/${userName}`);
    return response.data;
  },

  destroy: async (userId) => {
    const response = await apiClient.delete(`/${apiServiceUrl}/${userId}`);
    return response.data;
  },
};

export default userService;
