import apiClient from "./ApiClient";

const apiServiceUrl = "ticket";

const ticketService = {
  store: async (formData) => {
    const response = await apiClient.post(`/${apiServiceUrl}`, formData);
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

  update: async (id, updateData) => {
    const response = await apiClient.put(`/${apiServiceUrl}/${id}`, updateData);
    return response.data;
  },

  show: async (id) => {
    const response = await apiClient.get(`/${apiServiceUrl}/show/${id}`);
    return response.data;
  },
};

export default ticketService;
