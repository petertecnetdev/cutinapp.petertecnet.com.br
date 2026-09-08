import apiClient from "./ApiClient";
import { appSlug } from "../config";
import { createIdempotentMutation, createMutationRequestKey } from "../utils/idempotencyAttempts";

const unwrap = (response) => response?.data?.data ?? response?.data ?? null;

const createContent = createIdempotentMutation({
  storagePrefix: "cutinapp_blog_create_attempt_",
  keyPrefix: "blog-content-create",
  requestKeyFor: (payload) => createMutationRequestKey(payload),
  mutate: async ({ idempotencyKey }, payload) => unwrap(await apiClient.post("/admin/content", payload, {
    headers: { "Idempotency-Key": idempotencyKey },
  })),
});

const updateContent = createIdempotentMutation({
  storagePrefix: "cutinapp_blog_update_attempt_",
  keyPrefix: "blog-content-update",
  requestKeyFor: (id, payload) => `${Number(id)}:${createMutationRequestKey(payload)}`,
  mutate: async ({ idempotencyKey }, id, payload) => unwrap(await apiClient.patch(`/admin/content/${Number(id)}`, payload, {
    headers: { "Idempotency-Key": idempotencyKey },
  })),
});

const publishContent = createIdempotentMutation({
  storagePrefix: "cutinapp_blog_publish_attempt_",
  keyPrefix: "blog-content-publish",
  requestKeyFor: (id) => String(Number(id)),
  mutate: async ({ idempotencyKey }, id) => unwrap(await apiClient.post(`/admin/content/${Number(id)}/publish`, undefined, {
    headers: { "Idempotency-Key": idempotencyKey },
  })),
});

const removeContent = createIdempotentMutation({
  storagePrefix: "cutinapp_blog_delete_attempt_",
  keyPrefix: "blog-content-delete",
  requestKeyFor: (id) => String(Number(id)),
  mutate: async ({ idempotencyKey }, id) => {
    await apiClient.delete(`/admin/content/${Number(id)}`, {
      headers: { "Idempotency-Key": idempotencyKey },
    });
  },
});

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

  create: (payload) => createContent(payload),
  update: (id, payload) => updateContent(id, payload),
  publish: (id) => publishContent(id),
  remove: (id) => removeContent(id),
};

export default blogService;
