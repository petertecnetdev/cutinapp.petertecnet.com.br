import appApiClient from "./AppApiClient";
import { createIdempotentMutation, createMutationRequestKey } from "../utils/idempotencyAttempts";
import { cachedPublicGet, invalidatePublicRequestCache } from "../utils/publicRequestCache";

const unwrap = (value) => Array.isArray(value) ? value : Array.isArray(value?.data) ? value.data : [];
const rename = (data, from, to) => {
  if (!data || typeof data !== "object" || !(from in data)) return data;
  const result = { ...data, [to]: data[from] };
  delete result[from];
  return result;
};

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

const createProduction = createIdempotentMutation({
  storagePrefix: "cutinapp_production_create_attempt_",
  keyPrefix: "production",
  requestKeyFor: productionRequestKey,
  mutate: async ({ idempotencyKey }, payload) => rename((await appApiClient.post("/organizations", payload, {
    headers: { "Idempotency-Key": idempotencyKey },
  })).data, "organization", "production"),
});

const signProducerContract = createIdempotentMutation({
  storagePrefix: "cutinapp_contract_sign_attempt_",
  keyPrefix: "contract-sign",
  requestKeyFor: (organizationId, payload = {}) => `${Number(organizationId)}:${createMutationRequestKey(payload)}`,
  mutate: async ({ idempotencyKey }, organizationId, payload = {}) => (await appApiClient.post(
    `/organizations/${Number(organizationId)}/agreement/sign`,
    payload,
    { headers: { "Idempotency-Key": idempotencyKey } },
  )).data,
});

const resendProducerContract = createIdempotentMutation({
  storagePrefix: "cutinapp_contract_resend_attempt_",
  keyPrefix: "contract-resend",
  requestKeyFor: (organizationId) => String(Number(organizationId)),
  mutate: async ({ idempotencyKey }, organizationId) => (await appApiClient.post(
    `/organizations/${Number(organizationId)}/agreement/resend`,
    undefined,
    { headers: { "Idempotency-Key": idempotencyKey } },
  )).data,
});

const claimCourtesy = createIdempotentMutation({
  storagePrefix: "cutinapp_courtesy_claim_attempt_",
  keyPrefix: "courtesy-claim",
  requestKeyFor: (ticketId) => String(ticketId),
  mutate: async ({ idempotencyKey }, ticketId) => (await appApiClient.post(`/passes/claim/${ticketId}`, undefined, {
    headers: { "Idempotency-Key": idempotencyKey },
  })).data,
});

const transferPass = createIdempotentMutation({
  storagePrefix: "cutinapp_pass_transfer_attempt_",
  keyPrefix: "pass-transfer",
  requestKeyFor: (passId, recipientEmail) => `${String(passId)}:${String(recipientEmail || "").trim().toLowerCase()}`,
  mutate: async ({ idempotencyKey }, passId, recipientEmail) => (await appApiClient.post(`/passes/${passId}/transfer`, {
    recipient_email: String(recipientEmail || "").trim().toLowerCase(),
  }, {
    headers: { "Idempotency-Key": idempotencyKey },
  })).data,
});

const checkIn = createIdempotentMutation({
  storagePrefix: "cutinapp_checkin_attempt_",
  keyPrefix: "checkin",
  requestKeyFor: (token, eventId) => `${Number(eventId)}:${String(token || "").trim()}`,
  mutate: async ({ idempotencyKey }, token, eventId) => (await appApiClient.post("/checkin", {
    token: String(token || "").trim(),
    event_id: Number(eventId),
  }, {
    headers: { "Idempotency-Key": idempotencyKey },
  })).data,
});

const createProductionCommunityPost = createIdempotentMutation({
  storagePrefix: "cutinapp_production_community_post_attempt_",
  keyPrefix: "production-community-post",
  requestKeyFor: (organizationId, payload = {}) => `${Number(organizationId)}:${createMutationRequestKey(payload)}`,
  mutate: async ({ idempotencyKey }, organizationId, payload = {}) => (await appApiClient.post(
    `/organizations/${Number(organizationId)}/community`,
    payload,
    { headers: { "Idempotency-Key": idempotencyKey } },
  )).data,
});

const createEventCommunityPost = createIdempotentMutation({
  storagePrefix: "cutinapp_event_community_post_attempt_",
  keyPrefix: "event-community-post",
  requestKeyFor: (eventId, payload = {}) => `${Number(eventId)}:${createMutationRequestKey(payload)}`,
  mutate: async ({ idempotencyKey }, eventId, payload = {}) => (await appApiClient.post(
    `/events/${Number(eventId)}/community`,
    payload,
    { headers: { "Idempotency-Key": idempotencyKey } },
  )).data,
});

const createArtist = createIdempotentMutation({
  storagePrefix: "cutinapp_artist_create_attempt_",
  keyPrefix: "artist-create",
  requestKeyFor: (payload = {}) => createMutationRequestKey(payload),
  mutate: async ({ idempotencyKey }, payload = {}) => (await appApiClient.post(
    "/artists/provisional",
    payload,
    { headers: { "Idempotency-Key": idempotencyKey } },
  )).data,
});

const createArtistMember = createIdempotentMutation({
  storagePrefix: "cutinapp_artist_member_create_attempt_",
  keyPrefix: "artist-member-create",
  requestKeyFor: (artistId, payload = {}) => `${Number(artistId)}:${createMutationRequestKey(payload)}`,
  mutate: async ({ idempotencyKey }, artistId, payload = {}) => (await appApiClient.post(
    `/artists/${Number(artistId)}/members`,
    payload,
    { headers: { "Idempotency-Key": idempotencyKey } },
  )).data,
});

const claimArtistEvent = createIdempotentMutation({
  storagePrefix: "cutinapp_artist_claim_attempt_",
  keyPrefix: "artist-claim",
  requestKeyFor: (eventId, artistId, payload = {}) => `${Number(eventId)}:${Number(artistId)}:${createMutationRequestKey(payload)}`,
  mutate: async ({ idempotencyKey }, eventId, artistId, payload = {}) => (await appApiClient.post(
    `/events/${Number(eventId)}/artists/${Number(artistId)}/claim`,
    payload,
    { headers: { "Idempotency-Key": idempotencyKey } },
  )).data,
});

const attachArtist = createIdempotentMutation({
  storagePrefix: "cutinapp_event_artist_attach_attempt_",
  keyPrefix: "event-artist-attach",
  requestKeyFor: (eventId, payload = {}) => `${Number(eventId)}:${createMutationRequestKey(payload)}`,
  mutate: async ({ idempotencyKey }, eventId, payload = {}) => (await appApiClient.post(
    `/events/${Number(eventId)}/artists`,
    payload,
    { headers: { "Idempotency-Key": idempotencyKey } },
  )).data,
});

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
  publicEvents: async (params = {}) => cachedPublicGet(appApiClient, "/events", { params, ttlMs: 15000, staleMs: 120000 }),
  discoveryFacets: async () => cachedPublicGet(appApiClient, "/events/facets", { ttlMs: 60000, staleMs: 600000 }),
  locationStates: async () => (await appApiClient.get("/locations/states")).data.states || [],
  locationCities: async (uf, q = "") => (await appApiClient.get("/locations/cities", { params: { uf, q } })).data.cities || [],
  lookupCep: async (cep) => (await appApiClient.get(`/locations/cep/${String(cep).replace(/\D/g, "")}`)).data.address,

  profileOverview: async () => (await appApiClient.get("/profile/overview")).data,
  publicProfile: async (userId) => (await appApiClient.get(`/profiles/${Number(userId)}`)).data,
  myProductions: async () => unwrap((await appApiClient.get("/organizations/mine")).data.organizations),
  publicProductions: async (params = {}) => rename(await cachedPublicGet(appApiClient, "/organizations/public", { params, ttlMs: 30000, staleMs: 180000 }), "organizations", "productions"),
  getProduction: async (id) => (await appApiClient.get(`/organizations/${id}`)).data.organization,
  productionItems: async (id) => unwrap((await appApiClient.get(`/establishments/${id}/items`)).data.data),
  productionWorkspace: async (id) => (await appApiClient.get(`/organizations/${id}/workspace`)).data,
  productionExperience: async (slug) => (await appApiClient.get(`/organizations/public/${slug}/experience`)).data,
  updateProductionExperience: async (id, payload) => (await appApiClient.patch(`/organizations/${id}/experience-profile`, payload)).data,
  productionCommunity: async (slug, params = {}) => (await appApiClient.get(`/organizations/public/${slug}/community`, { params })).data,
  createProductionPost: (organizationId, payload) => createProductionCommunityPost(organizationId, payload),
  deleteProductionPost: async (postId) => (await appApiClient.delete(`/organization-community/${postId}`)).data,
  likeProductionPost: async (postId) => (await appApiClient.post(`/organization-community/${postId}/like`)).data,
  unlikeProductionPost: async (postId) => (await appApiClient.delete(`/organization-community/${postId}/like`)).data,
  uploadProductionMedia: async (organizationId, formData) => (await appApiClient.post(`/organizations/${organizationId}/media`, formData)).data,
  deleteProductionMedia: async (organizationId, mediaId) => (await appApiClient.delete(`/organizations/${organizationId}/media/${mediaId}`)).data,
  publicProduction: async (slug) => rename(await cachedPublicGet(appApiClient, `/organizations/public/${slug}`, { ttlMs: 30000, staleMs: 180000 }), "organization", "production"),
  createProduction,
  updateProduction: async (id, formData) => rename((await appApiClient.patch(`/organizations/${id}`, formData)).data, "organization", "production"),
  deleteProduction: async (id) => (await appApiClient.delete(`/organizations/${id}`)).data,
  producerContract: async (organizationId) => {
    const data = (await appApiClient.get(`/organizations/${organizationId}/agreement`)).data;
    return data?.agreement ?? data?.contract ?? null;
  },
  signProducerContract,
  resendProducerContract,
  downloadProducerContract: async (organizationId) => (await appApiClient.get(`/organizations/${organizationId}/agreement/pdf`, { responseType: "blob" })).data,

  artists: async (params = {}) => cachedPublicGet(appApiClient, "/artists", { params, ttlMs: 30000, staleMs: 180000 }),
  publicArtist: async (slug) => cachedPublicGet(appApiClient, `/artists/${slug}`, { ttlMs: 30000, staleMs: 180000 }),
  publicArtistMembers: async (slug) => (await appApiClient.get(`/artists/${slug}/members`)).data.members || [],
  publicEventArtists: async (slug) => (await appApiClient.get(`/events/public/${slug}/artists`)).data.artists || [],
  eventCommunity: async (slug, params = {}) => (await appApiClient.get(`/events/public/${slug}/community`, { params })).data,
  createEventPost: (eventId, payload) => createEventCommunityPost(eventId, payload),
  createFeedPost: (payload) => createEventCommunityPost(0, payload),
  deleteEventPost: async (postId) => (await appApiClient.delete(`/community/${postId}`)).data,
  likeEventPost: async (postId) => (await appApiClient.post(`/community/${postId}/like`)).data,
  unlikeEventPost: async (postId) => (await appApiClient.delete(`/community/${postId}/like`)).data,
  rateEvent: async (eventId, rating) => (await appApiClient.put(`/events/${eventId}/rating`, { rating })).data,
  reportEvent: async (eventId, payload) => (await appApiClient.post(`/events/${eventId}/report`, payload)).data,

  moderationReports: async (params = {}) => (await appApiClient.get("/moderation/reports", { params })).data,
  updateModerationReport: async (reportId, payload) => (await appApiClient.put(`/moderation/reports/${reportId}`, payload)).data,
  myArtists: async () => unwrap((await appApiClient.get("/artists/manageable", { params: { per_page: 100 } })).data.artists),
  createArtist,
  updateArtist: async (id, payload) => (await appApiClient.patch(`/artists/${id}/managed`, payload)).data,
  updateArtistType: async (id, artistType) => (await appApiClient.put(`/artists/${id}/type`, { artist_type: artistType })).data,
  artistMembers: async (id) => (await appApiClient.get(`/artists/${id}/members`)).data.members || [],
  createArtistMember,
  updateArtistMember: async (id, memberId, payload) => (await appApiClient.patch(`/artists/${id}/members/${memberId}`, payload)).data,
  deleteArtistMember: async (id, memberId) => (await appApiClient.delete(`/artists/${id}/members/${memberId}`)).data,
  artistClaimability: async (eventId, artistId) => (await appApiClient.get(`/events/${eventId}/artists/${artistId}/claim`)).data,
  claimArtistEvent,
  myArtistClaims: async () => (await appApiClient.get("/artist-claims/mine")).data,
  eventArtistClaims: async (eventId) => (await appApiClient.get(`/events/${eventId}/artist-claims`)).data,
  reviewArtistClaim: async (eventId, claimId, payload) => (await appApiClient.put(`/events/${eventId}/artist-claims/${claimId}`, payload)).data,
  eventArtists: async (eventId) => (await appApiClient.get(`/events/${eventId}/artists`)).data,
  attachArtist,
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
  publishEvent: async (eventId) => { const data = (await appApiClient.post(`/events/${eventId}/publish`)).data; invalidatePublicRequestCache("/events"); return data; },
  unpublishEvent: async (eventId) => { const data = (await appApiClient.post(`/events/${eventId}/unpublish`)).data; invalidatePublicRequestCache("/events"); return data; },

  eventCourtesies: async (eventId) => (await appApiClient.get(`/events/${eventId}/tickets`)).data,
  updateCourtesy: async (ticketId, payload) => (await appApiClient.patch(`/tickets/${ticketId}`, payload)).data,
  deleteCourtesy: async (ticketId) => (await appApiClient.delete(`/tickets/${ticketId}`)).data,
  claimCourtesy,
  myPasses: async () => unwrap((await appApiClient.get("/passes/mine")).data.passes),
  getPass: async (passId) => (await appApiClient.get(`/passes/${passId}`)).data.pass,
  transferPass,
  eventParticipants: async (eventId) => (await appApiClient.get(`/events/${eventId}/participants`)).data,
  checkIn,
  checkInStats: async (eventId) => (await appApiClient.get(`/checkin/events/${eventId}/stats`)).data,
};

export default cutinappService;