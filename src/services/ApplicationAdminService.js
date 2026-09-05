import appApiClient from "./AppApiClient";

const applicationAdminService = {
  overview: async () => (await appApiClient.get("/admin/overview")).data,
  users: async (params = {}) => (await appApiClient.get("/admin/users", { params })).data,
  updateUserAccess: async (userId, payload) => (await appApiClient.patch(`/admin/users/${userId}/access`, payload)).data,
  productions: async (params = {}) => (await appApiClient.get("/admin/productions", { params })).data,
  updateProductionStatus: async (productionId, payload) => (await appApiClient.patch(`/admin/productions/${productionId}/status`, payload)).data,
  events: async (params = {}) => (await appApiClient.get("/admin/events", { params })).data,
  updateEventStatus: async (eventId, payload) => (await appApiClient.patch(`/admin/events/${eventId}/status`, payload)).data,
  activity: async (params = {}) => (await appApiClient.get("/admin/activity", { params })).data,
};

export default applicationAdminService;
