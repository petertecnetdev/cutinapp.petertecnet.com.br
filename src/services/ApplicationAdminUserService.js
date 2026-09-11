import appApiClient from "./AppApiClient";
import { createIdempotentMutation, createMutationRequestKey } from "../utils/idempotencyAttempts";

const normalizeUserPayload = (payload = {}) => ({
  first_name: String(payload.first_name || "").trim(),
  last_name: String(payload.last_name || "").trim(),
  email: String(payload.email || "").trim().toLowerCase(),
  role: String(payload.role || "participant").trim() || "participant",
});

const createUser = createIdempotentMutation({
  storagePrefix: "cutinapp_admin_user_create_attempt_",
  keyPrefix: "admin-user",
  requestKeyFor: (payload) => createMutationRequestKey(payload),
  mutate: async ({ idempotencyKey }, payload) => (
    await appApiClient.post("/admin/users", payload, {
      headers: { "Idempotency-Key": idempotencyKey },
    })
  ).data,
});

const applicationAdminUserService = {
  list: async (params = {}) => (await appApiClient.get("/admin/users", { params })).data,
  create: (payload = {}) => createUser(normalizeUserPayload(payload)),
  impersonate: async (userId, reason) => (
    await appApiClient.post(`/admin/users/${userId}/impersonate`, { reason: String(reason || "").trim() })
  ).data,
  impersonationHistory: async (params = {}) => (
    await appApiClient.get("/admin/impersonations", { params })
  ).data,
  impersonationAudit: async (sessionId, params = {}) => (
    await appApiClient.get(`/admin/impersonations/${sessionId}/audit`, { params })
  ).data,
  endImpersonation: async (sessionId) => (
    await appApiClient.post(`/admin/impersonations/${sessionId}/end`)
  ).data,
};

export default applicationAdminUserService;
