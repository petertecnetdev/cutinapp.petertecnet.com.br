import apiClient from "./ApiClient";
const ticketService = {
  store: async (payload) => {
    const response = await apiClient.post("/cutinapp/courtesies", {
      event_id: payload.event_id,
      name: payload.name,
      quantity: payload.quantity,
      limit_date: payload.limit_date || null,
      description: payload.description || null,
    });
    return response.data;
  },
};
export default ticketService;
