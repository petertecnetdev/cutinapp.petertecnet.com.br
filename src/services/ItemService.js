import apiClient from "./ApiClient";

const apiServiceUrl = "item";
const multipart = { headers: { "Content-Type": "multipart/form-data" } };

const itemService = {
  store: async (formData) => {
    const response = await apiClient.post(`/${apiServiceUrl}`, formData, multipart);
    return response.data;
  },

  listByEvent: async (eventId) => {
    const response = await apiClient.get(`/${apiServiceUrl}/event/${eventId}`);
    return response.data;
  },

  delete: async (id) => {
    const response = await apiClient.delete(`/${apiServiceUrl}/${id}`);
    return response.data;
  },

  show: async (id) => {
    const response = await apiClient.get(`/${apiServiceUrl}/show/${id}`);
    return response.data;
  },

  update: async (id, formData) => {
    const response = await apiClient.put(`/${apiServiceUrl}/${id}`, formData, multipart);
    return response.data;
  },
};

export default itemService;
