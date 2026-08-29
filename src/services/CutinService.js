import axios from "axios";
import { apiBaseUrl } from "../config";

const api = axios.create({ baseURL: apiBaseUrl, timeout: 20000 });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token") || localStorage.getItem("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.headers.Accept = "application/json";
  return config;
});

const data = (response) => response?.data?.data ?? response?.data ?? [];

const CutinService = {
  async events(params = {}) { return data(await api.get("/cutinapp/events", { params })); },
  async publicEvent(id) { return data(await api.get(`/cutinapp/events/${id}`)); },
  async legacyEvent(slug) { return data(await api.get(`/event/${slug}`)); },
  async myEvents() { return data(await api.get("/event/myevents/list")); },
  async createEvent(payload) { return data(await api.post("/event", payload)); },
  async updateEvent(id, payload) { return data(await api.put(`/event/${id}`, payload)); },
  async deleteEvent(id) { return data(await api.delete(`/event/${id}`)); },

  async productions(params = {}) { return data(await api.get("/production", { params })); },
  async production(slug) { return data(await api.get(`/production/${slug}`)); },
  async createProduction(payload) { return data(await api.post("/production", payload)); },
  async updateProduction(id, payload) { return data(await api.put(`/production/${id}`, payload)); },

  async ticketsByEvent(eventId) { return data(await api.get(`/ticket/event/${eventId}`)); },
  async myTickets() { return data(await api.get("/cutinapp/my/tickets")); },
  async mySales() { return data(await api.get("/cutinapp/my/sales")); },
  async productionTickets(productionId) { return data(await api.get(`/ticket/production/${productionId}`)); },
  async createTicket(payload) { return data(await api.post("/ticket", payload)); },
  async updateTicket(id, payload) { return data(await api.put(`/ticket/${id}`, payload)); },
  async deleteTicket(id) { return data(await api.delete(`/ticket/${id}`)); },

  async itemsByEntity(identifier) { return data(await api.get(`/item/list-by-entity/${identifier}`)); },
  async createItem(payload) { return data(await api.post("/item", payload)); },
  async updateItem(id, payload) { return data(await api.put(`/item/${id}`, payload)); },

  async dashboard(eventId) { return data(await api.get(`/cutinapp/events/${eventId}/dashboard`)); },
  async members(eventId) { return data(await api.get(`/cutinapp/events/${eventId}/members`)); },
  async createMember(eventId, payload) { return data(await api.post(`/cutinapp/events/${eventId}/members`, payload)); },
  async updateMember(eventId, memberId, payload) { return data(await api.put(`/cutinapp/events/${eventId}/members/${memberId}`, payload)); },
  async deleteMember(eventId, memberId) { return data(await api.delete(`/cutinapp/events/${eventId}/members/${memberId}`)); },

  async promoters(eventId) { return data(await api.get(`/cutinapp/events/${eventId}/promoters`)); },
  async createPromoter(eventId, payload) { return data(await api.post(`/cutinapp/events/${eventId}/promoters`, payload)); },
  async updatePromoter(eventId, promoterId, payload) { return data(await api.put(`/cutinapp/events/${eventId}/promoters/${promoterId}`, payload)); },
  async promoterStats(eventId, promoterId) { return data(await api.get(`/cutinapp/events/${eventId}/promoters/${promoterId}/stats`)); },

  async promotions(eventId) { return data(await api.get(`/cutinapp/events/${eventId}/promotions`)); },
  async createPromotion(eventId, payload) { return data(await api.post(`/cutinapp/events/${eventId}/promotions`, payload)); },
  async updatePromotion(eventId, promotionId, payload) { return data(await api.put(`/cutinapp/events/${eventId}/promotions/${promotionId}`, payload)); },

  async checkout(eventId, payload) { return data(await api.post(`/cutinapp/events/${eventId}/checkout`, payload)); },
  async createPix(salePublicId) { return data(await api.post(`/cutinapp/sales/${salePublicId}/pix`)); },
  async paymentStatus(salePublicId) { return data(await api.get(`/cutinapp/sales/${salePublicId}/payment-status`)); },
  async confirmPayment(eventId, saleId, payload = {}) { return data(await api.post(`/cutinapp/events/${eventId}/sales/${saleId}/confirm-payment`, payload)); },
  async checkin(token) { return data(await api.post("/cutinapp/checkin", { token })); },
};

export default CutinService;
