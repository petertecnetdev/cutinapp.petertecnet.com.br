import apiClient from "./ApiClient";
import { createIdempotentMutation, createMutationRequestKey } from "../utils/idempotencyAttempts";

const apiServiceUrl = "user";
const multipart = { "Content-Type": "multipart/form-data" };

const updateUser = createIdempotentMutation({
  storagePrefix: "cutinapp_user_update_attempt_",
  keyPrefix: "user-update",
  requestKeyFor: (userId, userData) => `${Number(userId)}:${createMutationRequestKey(userData)}`,
  mutate: async ({ idempotencyKey }, userId, userData) => (
    await apiClient.post(`/${apiServiceUrl}/${Number(userId)}`, userData, {
      headers: {
        ...multipart,
        "Idempotency-Key": idempotencyKey,
      },
    })
  ).data,
});

const createUser = createIdempotentMutation({
  storagePrefix: "cutinapp_user_create_attempt_",
  keyPrefix: "user",
  requestKeyFor: (userData) => createMutationRequestKey(userData),
  mutate: async ({ idempotencyKey }, userData) => (
    await apiClient.post(`/${apiServiceUrl}/new`, userData, {
      headers: { "Idempotency-Key": idempotencyKey },
    })
  ).data,
});

const deleteUser = createIdempotentMutation({
  storagePrefix: "cutinapp_user_delete_attempt_",
  keyPrefix: "user-delete",
  requestKeyFor: (userId) => String(Number(userId)),
  mutate: async ({ idempotencyKey }, userId) => (
    await apiClient.delete(`/${apiServiceUrl}/${Number(userId)}`, {
      headers: { "Idempotency-Key": idempotencyKey },
    })
  ).data,
});

const userService = {
  list: async () => {
    const response = await apiClient.get(`/${apiServiceUrl}`);
    return response.data;
  },

  update: (userId, userData) => updateUser(userId, userData),

  store: (userData) => createUser(userData),

  show: async (userId) => {
    const response = await apiClient.get(`/${apiServiceUrl}/${userId}`);
    return response.data;
  },

  view: async (userName) => {
    const response = await apiClient.get(`/${apiServiceUrl}/${userName}`);
    return response.data;
  },

  destroy: (userId) => deleteUser(userId),
};

export default userService;
