import apiClient from "./ApiClient";

const apiServiceUrl = "event";
const multipart = { headers: { "Content-Type": "multipart/form-data" } };

const unwrapCollection = (value) => {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  return [];
};

const eventService = {
  store: async (formData) => {
    const response = await apiClient.post(`/${apiServiceUrl}`, formData, multipart);
    return response.data;
  },

  list: async (params = {}) => {
    const response = await apiClient.get(`/${apiServiceUrl}`, { params });
    return unwrapCollection(response.data.events);
  },

  update: async (eventId, formData) => {
    const response = await apiClient.post(`/${apiServiceUrl}/${eventId}`, formData, multipart);
    return response.data;
  },

  show: async (eventId) => {
    const response = await apiClient.get(`/${apiServiceUrl}/show/${eventId}`);
    return response.data.event;
  },

  view: async (slug) => {
    const response = await apiClient.get(`/${apiServiceUrl}/${slug}`);
    return response.data;
  },

  delete: async (eventId) => {
    const response = await apiClient.delete(`/${apiServiceUrl}/${eventId}`);
    return response.data;
  },

  myEvents: async () => {
    const response = await apiClient.get(`/${apiServiceUrl}/myevents/list`);
    return unwrapCollection(response.data.events);
  },
};

export default eventService;
