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
  async events(params = {}) { return data(await api.get("/event", { params })); },
  async event(slug) { return data(await api.get(`/event/${slug}`)); },
  async myEvents() { return data(await api.get("/event/myevents/list")); },
  async createEvent(payload) { return data(await api.post("/event", payload)); },
  async updateEvent(id, payload) { return data(await api.put(`/event/${id}`, payload)); },
  async deleteEvent(id) { return data(await api.delete(`/event/${id}`)); },

  async productions(params = {}) { return data(await api.get("/production", { params })); },
  async production(slug) { return data(await api.get(`/production/${slug}`)); },
  async createProduction(payload) { return data(await api.post("/production", payload)); },
  async updateProduction(id, payload) { return data(await api.put(`/production/${id}`, payload)); },

  async ticketsByEvent(eventId) { return data(await api.get(`/ticket/event/${eventId}`)); },
  async myTickets() { return data(await api.get("/ticket/user")); },
  async productionTickets(productionId) { return data(await api.get(`/ticket/production/${productionId}`)); },
  async createTicket(payload) { return data(await api.post("/ticket", payload)); },
  async updateTicket(id, payload) { return data(await api.put(`/ticket/${id}`, payload)); },

  async itemsByEntity(identifier) { return data(await api.get(`/item/list-by-entity/${identifier}`)); },
  async createItem(payload) { return data(await api.post("/item", payload)); },
  async updateItem(id, payload) { return data(await api.put(`/item/${id}`, payload)); },
};

export default CutinService;
