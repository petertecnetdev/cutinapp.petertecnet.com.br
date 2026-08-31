import apiClient from "./ApiClient";

const cutinappService = {
  publicConfig: async () => {
    const response = await apiClient.get("/cutinapp/config");
    return response.data || {};
  },

  myProductions: async () => {
    const response = await apiClient.get("/cutinapp/productions/mine");
    return response.data.productions || [];
  },

  createProduction: async (formData) => {
    const response = await apiClient.post("/cutinapp/productions", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  },

  claimCourtesy: async (ticketId) => {
    const response = await apiClient.post(`/cutinapp/passes/claim/${ticketId}`);
    return response.data;
  },

  myPasses: async () => {
    const response = await apiClient.get("/cutinapp/passes/mine");
    return response.data.passes || [];
  },

  checkIn: async (token) => {
    const response = await apiClient.post("/cutinapp/checkin", { token });
    return response.data;
  },

  checkInStats: async (eventId) => {
    const response = await apiClient.get(`/cutinapp/checkin/event/${eventId}/stats`);
    return response.data;
  },
};

export default cutinappService;
