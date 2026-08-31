import apiClient from "./ApiClient";

const apiServiceUrl = "event";
const multipart = { headers: { "Content-Type": "multipart/form-data" } };

const eventService = {
  store: async (formData) => {
    const response = await apiClient.post(`/${apiServiceUrl}`, formData, multipart);
    return response.data.message;
  },

  list: async () => {
    const response = await apiClient.get(`/${apiServiceUrl}`);
    return response.data.events || [];
  },

  update: async (eventId, formData) => {
    const response = await apiClient.post(`/${apiServiceUrl}/${eventId}`, formData, multipart);
    return response.data.message;
  },

  show: async (eventId) => {
    const response = await apiClient.get(`/${apiServiceUrl}/show/${eventId}`);
    return response.data.event;
  },

  view: async (slug) => apiClient.get(`/${apiServiceUrl}/${slug}`),

  delete: async (eventId) => {
    const response = await apiClient.delete(`/${apiServiceUrl}/${eventId}`);
    return response.data.message;
  },

  myEvents: async () => {
    const response = await apiClient.get(`/${apiServiceUrl}/myevents/list`);
    return response.data.events || [];
  },
};

export default eventService;
