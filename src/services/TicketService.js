import { applicationApiClient as apiClient } from "./ApiClient";

const ticketService = {
  store: async (payload) => {
    const response = await apiClient.post("/tickets", {
      event_id: payload.event_id,
      name: payload.name,
      quantity: payload.quantity,
      limit_date: payload.limit_date || null,
      description: payload.description || null,
      price: Number(payload.price || 0),
      ticket_type: payload.ticket_type || (Number(payload.price || 0) > 0 ? "standard" : "courtesy"),
    });
    return response.data;
  },
};

export default ticketService;
