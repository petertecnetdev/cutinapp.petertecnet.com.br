import appApiClient from "./AppApiClient";

const unwrap = (response) => response?.data?.data ?? response?.data ?? null;

const adminCenterService = {
  async context() {
    return unwrap(await appApiClient.get("/admin/context"));
  },

  async overview() {
    return unwrap(await appApiClient.get("/admin/overview"));
  },

  async permissionCatalog() {
    return unwrap(await appApiClient.get("/admin/permissions"));
  },

  async profiles() {
    return unwrap(await appApiClient.get("/admin/profiles")) || [];
  },

  async createProfile(payload) {
    return unwrap(await appApiClient.post("/admin/profiles", payload));
  },

  async updateProfile(profileId, payload) {
    return unwrap(await appApiClient.put(`/admin/profiles/${profileId}`, payload));
  },

  async deleteProfile(profileId) {
    return unwrap(await appApiClient.delete(`/admin/profiles/${profileId}`));
  },

  async assignments() {
    return unwrap(await appApiClient.get("/admin/assignments")) || [];
  },

  async assign(payload) {
    return unwrap(await appApiClient.post("/admin/assignments", payload));
  },

  async revoke(assignmentId) {
    return unwrap(await appApiClient.delete(`/admin/assignments/${assignmentId}`));
  },

  async audit(perPage = 50) {
    return unwrap(await appApiClient.get("/admin/audit", { params: { per_page: perPage } }));
  },
};

export default adminCenterService;
