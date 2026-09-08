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
};

export default applicationAdminUserService;
