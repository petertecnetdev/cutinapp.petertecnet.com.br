import apiClient from "./ApiClient";

const unwrap = (value) => Array.isArray(value) ? value : Array.isArray(value?.data) ? value.data : [];

const adaptOrganizationPayload = (data = {}) => ({
  ...data,
  production: data.production || data.organization || null,
});

const adaptOrganizationsPayload = (data = {}) => ({
  ...data,
  productions: data.productions || data.organizations || null,
});

const platformService = {
  publicConfig: async () => {
    const data = (await apiClient.get("/config")).data;
    return {
      ...data,
      app: data.app || data.application?.slug || null,
      app_id: data.app_id || data.application?.id || null,
    };
  },
  discoveryFacets: async () => (await apiClient.get("/events/facets")).data,
  locationStates: async () => (await apiClient.get("/locations/states")).data.states || [],
  locationCities: async (uf, q = "") => (await apiClient.get("/locations/cities", { params: { uf, q } })).data.cities || [],
  lookupCep: async (cep) => (await apiClient.get(`/locations/cep/${String(cep).replace(/\D/g, "")}`)).data.address,

  profileOverview: async () => (await apiClient.get("/profile/overview")).data,
  myProductions: async () => unwrap((await apiClient.get("/organizations/mine")).data.organizations),
  publicProductions: async (params = {}) => adaptOrganizationsPayload((await apiClient.get("/organizations/public", { params })).data),
  getProduction: async (id) => (await apiClient.get(`/organizations/${id}`)).data.organization,
  publicProduction: async (slug) => adaptOrganizationPayload((await apiClient.get(`/organizations/public/${slug}`)).data),
  createProduction: async (formData) => adaptOrganizationPayload((await apiClient.post("/organizations", formData)).data),
  updateProduction: async (id, formData) => adaptOrganizationPayload((await apiClient.put(`/organizations/${id}`, formData)).data),
  producerContract: async (organizationId) => (await apiClient.get(`/organizations/${organizationId}/agreement`)).data.contract,
  signProducerContract: async (organizationId, payload) => (await apiClient.post(`/organizations/${organizationId}/agreement/sign`, payload)).data,
  resendProducerContract: async (organizationId) => (await apiClient.post(`/organizations/${organizationId}/agreement/resend`)).data,
  downloadProducerContract: async (organizationId) => (await apiClient.get(`/organizations/${organizationId}/agreement/pdf`, { responseType: "blob" })).data,

  artists: async (params = {}) => (await apiClient.get("/artists", { params })).data,
  publicArtist: async (slug) => (await apiClient.get(`/artists/${slug}`)).data,
  publicArtistMembers: async (slug) => (await apiClient.get(`/artists/${slug}/members`)).data,
  publicEventArtists: async (slug) => (await apiClient.get(`/events/public/${slug}/artists`)).data.artists || [],
  eventCommunity: async (slug, params = {}) => (await apiClient.get(`/events/public/${slug}/community`, { params })).data,
  createEventPost: async (eventId, payload) => (await apiClient.post(`/events/${eventId}/community`, payload)).data,
  deleteEventPost: async (postId) => (await apiClient.delete(`/community/${postId}`)).data,
  likeEventPost: async (postId) => (await apiClient.post(`/community/${postId}/like`)).data,
  unlikeEventPost: async (postId) => (await apiClient.delete(`/community/${postId}/like`)).data,
  rateEvent: async (eventId, rating) => (await apiClient.put(`/events/${eventId}/rating`, { rating })).data,
  reportEvent: async (eventId, payload) => (await apiClient.post(`/events/${eventId}/report`, payload)).data,
  moderationReports: async (params = {}) => (await apiClient.get("/moderation/reports", { params })).data,
  updateModerationReport: async (reportId, payload) => (await apiClient.put(`/moderation/reports/${reportId}`, payload)).data,

  myArtists: async () => unwrap((await apiClient.get("/artists/manageable", { params: { per_page: 100 } })).data.artists),
  createArtist: async (payload) => (await apiClient.post("/artists/provisional", payload)).data,
  updateArtist: async (id, payload) => (await apiClient.put(`/artists/${id}/managed`, payload)).data,
  updateArtistType: async (id, artistType) => (await apiClient.put(`/artists/${id}/type`, { artist_type: artistType })).data,
  artistMembers: async (id) => (await apiClient.get(`/artists/${id}/members`)).data.members || [],
  createArtistMember: async (id, payload) => (await apiClient.post(`/artists/${id}/members`, payload)).data,
  updateArtistMember: async (id, memberId, payload) => (await apiClient.put(`/artists/${id}/members/${memberId}`, payload)).data,
  deleteArtistMember: async (id, memberId) => (await apiClient.delete(`/artists/${id}/members/${memberId}`)).data,
  artistClaimability: async (eventId, artistId) => (await apiClient.get(`/events/${eventId}/artists/${artistId}/claim`)).data,
  claimArtistEvent: async (eventId, artistId, payload = {}) => (await apiClient.post(`/events/${eventId}/artists/${artistId}/claim`, payload)).data,
  myArtistClaims: async () => (await apiClient.get("/artist-claims/mine")).data,
  eventArtistClaims: async (eventId) => (await apiClient.get(`/events/${eventId}/artist-claims`)).data,
  reviewArtistClaim: async (eventId, claimId, payload) => (await apiClient.put(`/events/${eventId}/artist-claims/${claimId}`, payload)).data,
  eventArtists: async (eventId) => (await apiClient.get(`/events/${eventId}/artists`)).data,
  attachArtist: async (eventId, payload) => (await apiClient.post(`/events/${eventId}/artists`, payload)).data,
  detachArtist: async (eventId, artistId) => (await apiClient.delete(`/events/${eventId}/artists/${artistId}`)).data,

  follow: async (targetType, targetId) => (await apiClient.post("/social/follow", { target_type: targetType, target_id: targetId })).data,
  unfollow: async (targetType, targetId) => (await apiClient.delete("/social/follow", { data: { target_type: targetType, target_id: targetId } })).data,
  preferences: async () => (await apiClient.get("/social/preferences")).data.preferences,
  savePreferences: async (payload) => (await apiClient.put("/social/preferences", payload)).data,
  engagement: async (eventId, payload) => (await apiClient.put(`/events/${eventId}/engagement`, payload)).data,
  feed: async (params = {}) => (await apiClient.get("/feed", { params })).data,

  notifications: async (params = {}) => (await apiClient.get("/notifications", { params })).data,
  markNotificationRead: async (notificationId) => (await apiClient.patch(`/notifications/${notificationId}/read`)).data,
  markAllNotificationsRead: async () => (await apiClient.patch("/notifications/read-all")).data,

  publishEvent: async (eventId) => (await apiClient.post(`/events/${eventId}/publish`)).data,
  unpublishEvent: async (eventId) => (await apiClient.post(`/events/${eventId}/unpublish`)).data,
  eventCourtesies: async (eventId) => (await apiClient.get(`/events/${eventId}/tickets`)).data,
  updateCourtesy: async (ticketId, payload) => (await apiClient.patch(`/tickets/${ticketId}`, payload)).data,
  deleteCourtesy: async (ticketId) => (await apiClient.delete(`/tickets/${ticketId}`)).data,
  claimCourtesy: async (ticketId) => (await apiClient.post(`/passes/claim/${ticketId}`)).data,
  myPasses: async () => unwrap((await apiClient.get("/passes/mine")).data.passes),
  getPass: async (passId) => (await apiClient.get(`/passes/${passId}`)).data.pass,
  eventParticipants: async (eventId) => (await apiClient.get(`/events/${eventId}/participants`)).data,
  checkIn: async (token, eventId) => (await apiClient.post("/checkin", { token, event_id: Number(eventId) })).data,
  checkInStats: async (eventId) => (await apiClient.get(`/checkin/events/${eventId}/stats`)).data,
};

export default platformService;
