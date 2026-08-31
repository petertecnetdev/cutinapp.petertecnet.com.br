import apiClient from "./ApiClient";

const apiServiceUrl = "ticket";

const unwrapCollection = (value) => {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  return [];
};

const ticketService = {
  store: async (formData) => {
    const response = await apiClient.post(`/${apiServiceUrl}`, formData);
    return response.data;
  },

  listByEvent: async (eventId) => {
    const response = await apiClient.get(`/${apiServiceUrl}/event/${eventId}`);
    return unwrapCollection(response.data);
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
    return response.data.ticket || response.data;
  },
};

export default ticketService;
