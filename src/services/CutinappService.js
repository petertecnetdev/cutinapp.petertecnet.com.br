import appApiClient from "./AppApiClient";
import { createIdempotencyAttemptManager, shouldKeepIdempotencyAttempt } from "../utils/idempotencyAttempts";

const unwrap = (value) => Array.isArray(value) ? value : Array.isArray(value?.data) ? value.data : [];
const rename = (data, from, to) => {
  if (!data || typeof data !== "object" || !(from in data)) return data;
  const result = { ...data, [to]: data[from] };
  delete result[from];
  return result;
};

const pendingProductionCreates = new Map();
const productionCreateAttempts = createIdempotencyAttemptManager({
  storagePrefix: "cutinapp_production_create_attempt_",
  keyPrefix: "production",
});

const pendingCourtesyClaims = new Map();
const courtesyClaimAttempts = createIdempotencyAttemptManager({
  storagePrefix: "cutinapp_courtesy_claim_attempt_",
  keyPrefix: "courtesy-claim",
});

const productionValueSignature = (value) => {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return String(value ?? "");
  return {
    name: String(value.name || ""),
    size: Number(value.size || 0),
    type: String(value.type || ""),
    lastModified: Number(value.lastModified || 0),
  };
};

const productionRequestKey = (payload) => {
  if (payload && typeof payload.entries === "function") {
    return JSON.stringify(Array.from(payload.entries())
      .map(([key, value]) => [String(key), productionValueSignature(value)])
      .sort(([left], [right]) => left.localeCompare(right)));
  }

  if (payload && typeof payload === "object") {
    return JSON.stringify(Object.keys(payload).sort().map((key) => [key, productionValueSignature(payload[key])]));
  }

  return JSON.stringify(payload ?? null);
};

const createProduction = (payload) => {
  const requestKey = productionRequestKey(payload);
  const pending = pendingProductionCreates.get(requestKey);
  if (pending) return pending;

  const idempotencyKey = productionCreateAttempts.keyFor(requestKey);
  const request = appApiClient.post("/organizations", payload, {
    headers: { "Idempotency-Key": idempotencyKey },
  }).then((response) => {
    productionCreateAttempts.clear(requestKey);
    return rename(response.data, "organization", "production");
  }).catch((error) => {
    if (!shouldKeepIdempotencyAttempt(error)) productionCreateAttempts.clear(requestKey);
    throw error;
  }).finally(() => {
    if (pendingProductionCreates.get(requestKey) === request) pendingProductionCreates.delete(requestKey);
  });

  pendingProductionCreates.set(requestKey, request);
  return request;
};

const claimCourtesy = (ticketId) => {
  const requestKey = String(ticketId);
  const pending = pendingCourtesyClaims.get(requestKey);
  if (pending) return pending;

  const idempotencyKey = courtesyClaimAttempts.keyFor(requestKey);
  const request = appApiClient.post(`/passes/claim/${ticketId}`, undefined, {
    headers: { "Idempotency-Key": idempotencyKey },
  }).then((response) => {
    courtesyClaimAttempts.clear(requestKey);
    return response.data;
  }).catch((error) => {
    if (!shouldKeepIdempotencyAttempt(error)) courtesyClaimAttempts.clear(requestKey);
    throw error;
  }).finally(() => {
    if (pendingCourtesyClaims.get(requestKey) === request) pendingCourtesyClaims.delete(requestKey);
  });

  pendingCourtesyClaims.set(requestKey, request);
  return request;
};

// Product UI facade. Every request below consumes a reusable capability from
// /api/v1/apps/{application}; product-specific backend URLs are intentionally
// absent. Small response aliases keep the current UI stable during vocabulary
// migration from "production" to the generic "organization" domain.
const cutinappService = {
  publicConfig: async () => {
    const data = (await appApiClient.get("/config")).data;
    return {
      ...data,
      app: data?.application?.slug || null,
      app_id: data?.application?.id || null,
    };
  },
  publicEvents: async (params = {}) => (await appApiClient.get("/events", { params })).data,
  discoveryFacets: async () => (await appApiClient.get("/events/facets")).data,
  locationStates: async () => (await appApiClient.get("/locations/states")).data.states || [],
  locationCities: async (uf, q = "") => (await appApiClient.get("/locations/cities", { params: { uf, q } })).data.cities || [],
  lookupCep: async (cep) => (await appApiClient.get(`/locations/cep/${String(cep).replace(/\D/g, "")}`)).data.address,

  profileOverview: async () => (await appApiClient.get("/profile/overview")).data,
  publicProfile: async (userId) => (await appApiClient.get(`/profiles/${Number(userId)}`)).data,
  myProductions: async () => unwrap((await appApiClient.get("/organizations/mine")).data.organizations),
  publicProductions: async (params = {}) => rename((await appApiClient.get("/organizations/public", { params })).data, "organizations", "productions"),
  getProduction: async (id) => (await appApiClient.get(`/organizations/${id}`)).data.organization,
  productionItems: async (id) => unwrap((await appApiClient.get(`/establishments/${id}/items`)).data.data),
  productionWorkspace: async (id) => (await appApiClient.get(`/organizations/${id}/workspace`)).data,
  productionExperience: async (slug) => (await appApiClient.get(`/organizations/public/${slug}/experience`)).data,
  updateProductionExperience: async (id, payload) => (await appApiClient.patch(`/organizations/${id}/experience-profile`, payload)).data,
  productionCommunity: async (slug, params = {}) => (await appApiClient.get(`/organizations/public/${slug}/community`, { params })).data,
  createProductionPost: async (organizationId, payload) => (await appApiClient.post(`/organizations/${organizationId}/community`, payload)).data,
  deleteProductionPost: async (postId) => (await appApiClient.delete(`/organization-community/${postId}`)).data,
  likeProductionPost: async (postId) => (await appApiClient.post(`/organization-community/${postId}/like`)).data,
  unlikeProductionPost: async (postId) => (await appApiClient.delete(`/organization-community/${postId}/like`)).data,
  uploadProductionMedia: async (organizationId, formData) => (await appApiClient.post(`/organizations/${organizationId}/media`, formData)).data,
  deleteProductionMedia: async (organizationId, mediaId) => (await appApiClient.delete(`/organizations/${organizationId}/media/${mediaId}`)).data,
  publicProduction: async (slug) => rename((await appApiClient.get(`/organizations/public/${slug}`)).data, "organization", "production"),
  createProduction,
  updateProduction: async (id, formData) => rename((await appApiClient.patch(`/organizations/${id}`, formData)).data, "organization", "production"),
  deleteProduction: async (id) => (await appApiClient.delete(`/organizations/${id}`)).data,
  producerContract: async (organizationId) => {
    const data = (await appApiClient.get(`/organizations/${organizationId}/agreement`)).data;
    return data?.agreement ?? data?.contract ?? null;
  },
  signProducerContract: async (organizationId, payload) => (await appApiClient.post(`/organizations/${organizationId}/agreement/sign`, payload)).data,
  resendProducerContract: async (organizationId) => (await appApiClient.post(`/organizations/${organizationId}/agreement/resend`)).data,
  downloadProducerContract: async (organizationId) => (await appApiClient.get(`/organizations/${organizationId}/agreement/pdf`, { responseType: "blob" })).data,

  artists: async (params = {}) => (await appApiClient.get("/artists", { params })).data,
  publicArtist: async (slug) => (await appApiClient.get(`/artists/${slug}`)).data,
  publicArtistMembers: async (slug) => (await appApiClient.get(`/artists/${slug}/members`)).data.members || [],
  publicEventArtists: async (slug) => (await appApiClient.get(`/events/public/${slug}/artists`)).data.artists || [],
  eventCommunity: async (slug, params = {}) => (await appApiClient.get(`/events/public/${slug}/community`, { params })).data,
  createEventPost: async (eventId, payload) => (await appApiClient.post(`/events/${eventId}/community`, payload)).data,
  deleteEventPost: async (postId) => (await appApiClient.delete(`/community/${postId}`)).data,
  likeEventPost: async (postId) => (await appApiClient.post(`/community/${postId}/like`)).data,
  unlikeEventPost: async (postId) => (await appApiClient.delete(`/community/${postId}/like`)).data,
  rateEvent: async (eventId, rating) => (await appApiClient.put(`/events/${eventId}/rating`, { rating })).data,
  reportEvent: async (eventId, payload) => (await appApiClient.post(`/events/${eventId}/report`, payload)).data,

  moderationReports: async (params = {}) => (await appApiClient.get("/moderation/reports", { params })).data,
  updateModerationReport: async (reportId, payload) => (await appApiClient.put(`/moderation/reports/${reportId}`, payload)).data,
  myArtists: async () => unwrap((await appApiClient.get("/artists/manageable", { params: { per_page: 100 } })).data.artists),
  createArtist: async (payload) => (await appApiClient.post("/artists/provisional", payload)).data,
  updateArtist: async (id, payload) => (await appApiClient.patch(`/artists/${id}/managed`, payload)).data,
  updateArtistType: async (id, artistType) => (await appApiClient.put(`/artists/${id}/type`, { artist_type: artistType })).data,
  artistMembers: async (id) => (await appApiClient.get(`/artists/${id}/members`)).data.members || [],
  createArtistMember: async (id, payload) => (await appApiClient.post(`/artists/${id}/members`, payload)).data,
  updateArtistMember: async (id, memberId, payload) => (await appApiClient.patch(`/artists/${id}/members/${memberId}`, payload)).data,
  deleteArtistMember: async (id, memberId) => (await appApiClient.delete(`/artists/${id}/members/${memberId}`)).data,
  artistClaimability: async (eventId, artistId) => (await appApiClient.get(`/events/${eventId}/artists/${artistId}/claim`)).data,
  claimArtistEvent: async (eventId, artistId, payload = {}) => (await appApiClient.post(`/events/${eventId}/artists/${artistId}/claim`, payload)).data,
  myArtistClaims: async () => (await appApiClient.get("/artist-claims/mine")).data,
  eventArtistClaims: async (eventId) => (await appApiClient.get(`/events/${eventId}/artist-claims`)).data,
  reviewArtistClaim: async (eventId, claimId, payload) => (await appApiClient.put(`/events/${eventId}/artist-claims/${claimId}`, payload)).data,
  eventArtists: async (eventId) => (await appApiClient.get(`/events/${eventId}/artists`)).data,
  attachArtist: async (eventId, payload) => (await appApiClient.post(`/events/${eventId}/artists`, payload)).data,
  detachArtist: async (eventId, artistId) => (await appApiClient.delete(`/events/${eventId}/artists/${artistId}`)).data,
  follow: async (targetType, targetId) => (await appApiClient.post("/social/follow", { target_type: targetType, target_id: targetId })).data,
  unfollow: async (targetType, targetId) => (await appApiClient.delete("/social/follow", { data: { target_type: targetType, target_id: targetId } })).data,
  preferences: async () => (await appApiClient.get("/social/preferences")).data.preferences,
  savePreferences: async (payload) => (await appApiClient.put("/social/preferences", payload)).data,
  engagement: async (eventId, payload) => (await appApiClient.put(`/events/${eventId}/engagement`, payload)).data,
  feed: async (params = {}) => (await appApiClient.get("/feed", { params })).data,

  notifications: async (params = {}) => (await appApiClient.get("/notifications", { params })).data,
  markNotificationRead: async (notificationId) => (await appApiClient.patch(`/notifications/${notificationId}/read`)).data,
  markAllNotificationsRead: async () => (await appApiClient.patch("/notifications/read-all")).data,
  publishEvent: async (eventId) => (await appApiClient.post(`/events/${eventId}/publish`)).data,
  unpublishEvent: async (eventId) => (await appApiClient.post(`/events/${eventId}/unpublish`)).data,

  eventCourtesies: async (eventId) => (await appApiClient.get(`/events/${eventId}/tickets`)).data,
  updateCourtesy: async (ticketId, payload) => (await appApiClient.patch(`/tickets/${ticketId}`, payload)).data,
  deleteCourtesy: async (ticketId) => (await appApiClient.delete(`/tickets/${ticketId}`)).data,
  claimCourtesy,
  myPasses: async () => unwrap((await appApiClient.get("/passes/mine")).data.passes),
  getPass: async (passId) => (await appApiClient.get(`/passes/${passId}`)).data.pass,
  transferPass: async (passId, recipientEmail) => (await appApiClient.post(`/passes/${passId}/transfer`, { recipient_email: recipientEmail })).data,
  eventParticipants: async (eventId) => (await appApiClient.get(`/events/${eventId}/participants`)).data,
  checkIn: async (token, eventId) => (await appApiClient.post("/checkin", { token, event_id: Number(eventId) })).data,
  checkInStats: async (eventId) => (await appApiClient.get(`/checkin/events/${eventId}/stats`)).data,
};

export default cutinappService;