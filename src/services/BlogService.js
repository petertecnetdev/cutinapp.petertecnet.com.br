import apiClient from "./ApiClient";
import { appSlug } from "../config";

const unwrap = (response) => response?.data?.data ?? response?.data ?? null;

const blogService = {
  async list(params = {}) {
    const response = await apiClient.get("/v1/content", {
      params: { application: appSlug, type: "article", per_page: 18, ...params },
    });
    return unwrap(response);
  },

  async show(slug) {
    const response = await apiClient.get(`/v1/content/${encodeURIComponent(slug)}`, {
      params: { application: appSlug },
    });
    return unwrap(response);
  },

  async adminContext() {
    const response = await apiClient.get("/admin/content", { params: { type: "article" } });
    return unwrap(response);
  },

  async create(payload) {
    const response = await apiClient.post("/admin/content", payload);
    return unwrap(response);
  },

  async update(id, payload) {
    const response = await apiClient.patch(`/admin/content/${id}`, payload);
    return unwrap(response);
  },

  async publish(id) {
    const response = await apiClient.post(`/admin/content/${id}/publish`);
    return unwrap(response);
  },

  async remove(id) {
    await apiClient.delete(`/admin/content/${id}`);
  },
};

export default blogService;
