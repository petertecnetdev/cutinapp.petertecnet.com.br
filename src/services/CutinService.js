import axios from "axios";
import { apiBaseUrl } from "../config";

const api = axios.create({
  baseURL: apiBaseUrl,
  timeout: 12000,
  headers: { Accept: "application/json" },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token") || localStorage.getItem("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const data = (response) => response?.data?.data ?? response?.data?.item ?? response?.data ?? [];
const cache = new Map();
const pending = new Map();
const DEFAULT_TTL = 10000;

const stableParams = (params = {}) => Object.keys(params).sort().map((key) => `${key}:${JSON.stringify(params[key])}`).join("|");
const keyFor = (url, params) => `${url}?${stableParams(params)}`;

const clearCache = (prefix = "") => {
  [...cache.keys()].forEach((key) => {
    if (!prefix || key.startsWith(prefix)) cache.delete(key);
  });
};

const getCached = async (url, params = {}, ttl = DEFAULT_TTL) => {
  const key = keyFor(url, params);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  if (pending.has(key)) return pending.get(key);

  const request = api.get(url, { params })
    .then((response) => {
      const value = data(response);
      cache.set(key, { value, at: Date.now() });
      return value;
    })
    .finally(() => pending.delete(key));

  pending.set(key, request);
  return request;
};

const mutate = async (method, url, payload, invalidate = "") => {
  const response = await api.request({ method, url, data: payload });
  clearCache(invalidate);
  return data(response);
};

const CutinService = {
  clearCache,

  async events(params = {}) { return getCached("/cutinapp/events", params, 15000); },
  async publicEvent(id) { return getCached(`/cutinapp/events/${id}`, {}, 15000); },
  async legacyEvent(slug) { return getCached(`/event/${slug}`, {}, 15000); },
  async myEvents() { return getCached("/event/myevents/list", {}, 7000); },
  async createEvent(payload) { return mutate("post", "/event", payload); },
  async updateEvent(id, payload) { return mutate("put", `/event/${id}`, payload); },
  async deleteEvent(id) { return mutate("delete", `/event/${id}`, undefined); },

  async productions(params = {}) { return getCached("/production", params, 15000); },
  async production(slug) { return getCached(`/production/${slug}`, {}, 15000); },
  async createProduction(payload) { return mutate("post", "/production", payload, "/production"); },
  async updateProduction(id, payload) { return mutate("put", `/production/${id}`, payload, "/production"); },

  async ticketsByEvent(eventId) { return getCached(`/ticket/event/${eventId}`, {}, 8000); },
  async myTickets() { return getCached("/cutinapp/my/tickets", {}, 5000); },
  async mySales() { return getCached("/cutinapp/my/sales", {}, 5000); },
  async productionTickets(productionId) { return getCached(`/ticket/production/${productionId}`, {}, 8000); },
  async createTicket(payload) { return mutate("post", "/ticket", payload, "/ticket"); },
  async updateTicket(id, payload) { return mutate("put", `/ticket/${id}`, payload, "/ticket"); },
  async deleteTicket(id) { return mutate("delete", `/ticket/${id}`, undefined, "/ticket"); },

  async eventProducts(eventId) { return getCached(`/cutinapp/events/${eventId}/products`, {}, 8000); },
  async createEventProduct(eventId, payload) { return mutate("post", `/cutinapp/events/${eventId}/products`, payload, `/cutinapp/events/${eventId}`); },
  async updateEventProduct(eventId, itemId, payload) { return mutate("put", `/cutinapp/events/${eventId}/products/${itemId}`, payload, `/cutinapp/events/${eventId}`); },
  async deleteEventProduct(eventId, itemId) { return mutate("delete", `/cutinapp/events/${eventId}/products/${itemId}`, undefined, `/cutinapp/events/${eventId}`); },

  async dashboard(eventId) { return getCached(`/cutinapp/events/${eventId}/dashboard`, {}, 5000); },
  async members(eventId) { return getCached(`/cutinapp/events/${eventId}/members`, {}, 5000); },
  async createMember(eventId, payload) { return mutate("post", `/cutinapp/events/${eventId}/members`, payload, `/cutinapp/events/${eventId}`); },
  async updateMember(eventId, memberId, payload) { return mutate("put", `/cutinapp/events/${eventId}/members/${memberId}`, payload, `/cutinapp/events/${eventId}`); },
  async deleteMember(eventId, memberId) { return mutate("delete", `/cutinapp/events/${eventId}/members/${memberId}`, undefined, `/cutinapp/events/${eventId}`); },

  async promoters(eventId) { return getCached(`/cutinapp/events/${eventId}/promoters`, {}, 5000); },
  async createPromoter(eventId, payload) { return mutate("post", `/cutinapp/events/${eventId}/promoters`, payload, `/cutinapp/events/${eventId}`); },
  async updatePromoter(eventId, promoterId, payload) { return mutate("put", `/cutinapp/events/${eventId}/promoters/${promoterId}`, payload, `/cutinapp/events/${eventId}`); },
  async promoterStats(eventId, promoterId) { return getCached(`/cutinapp/events/${eventId}/promoters/${promoterId}/stats`, {}, 5000); },
  async promoterCommissions(eventId, promoterId) { return getCached(`/cutinapp/events/${eventId}/promoters/${promoterId}/commissions`, {}, 5000); },
  async payoutPromoter(eventId, promoterId, payload = {}) { return mutate("post", `/cutinapp/events/${eventId}/promoters/${promoterId}/payout`, payload, `/cutinapp/events/${eventId}`); },
  async myPromoterPortal() { return getCached("/cutinapp/my/promoter", {}, 5000); },

  async promotions(eventId) { return getCached(`/cutinapp/events/${eventId}/promotions`, {}, 7000); },
  async createPromotion(eventId, payload) { return mutate("post", `/cutinapp/events/${eventId}/promotions`, payload, `/cutinapp/events/${eventId}`); },
  async updatePromotion(eventId, promotionId, payload) { return mutate("put", `/cutinapp/events/${eventId}/promotions/${promotionId}`, payload, `/cutinapp/events/${eventId}`); },

  async checkout(eventId, payload) { return mutate("post", `/cutinapp/events/${eventId}/checkout`, payload, `/cutinapp/events/${eventId}`); },
  async createPix(salePublicId) { return mutate("post", `/cutinapp/sales/${salePublicId}/pix`); },
  async paymentStatus(salePublicId) { return getCached(`/cutinapp/sales/${salePublicId}/payment-status`, {}, 1500); },
  async confirmPayment(eventId, saleId, payload = {}) { return mutate("post", `/cutinapp/events/${eventId}/sales/${saleId}/confirm-payment`, payload, "/cutinapp"); },
  async checkin(tokenValue) { return mutate("post", "/cutinapp/checkin", { token: tokenValue }, "/cutinapp"); },
};

export default CutinService;
