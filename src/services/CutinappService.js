import appApiClient from "./AppApiClient";
import { createIdempotentMutation, createMutationRequestKey } from "../utils/idempotencyAttempts";
import { cachedPublicGet, invalidatePublicRequestCache } from "../utils/publicRequestCache";
import { trackSearchConversion } from "../utils/searchAttribution";

const unwrap = (value) => Array.isArray(value) ? value : Array.isArray(value?.data) ? value.data : [];
const SEARCH_SESSION_KEY = "cutinapp:search-session:v1";
const searchSessionHeaders = () => {
  if (typeof window === "undefined") return {};
  try {
    let value = window.sessionStorage.getItem(SEARCH_SESSION_KEY);
    if (!value) {
      value = window.crypto?.randomUUID?.() || `search-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      window.sessionStorage.setItem(SEARCH_SESSION_KEY, value);
    }
    return { "X-Search-Session": value };
  } catch (_) {
    return {};
  }
};
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

const updateProduction = createIdempotentMutation({
  storagePrefix: "cutinapp_production_update_attempt_",
  keyPrefix: "production-update",
  requestKeyFor: (organizationId, payload) => `${Number(organizationId)}:${productionRequestKey(payload)}`,
  mutate: async ({ idempotencyKey }, organizationId, payload) => rename((await appApiClient.patch(
    `/organizations/${Number(organizationId)}`,
    payload,
    { headers: { "Idempotency-Key": idempotencyKey } },
  )).data, "organization", "production"),
});

const deleteProduction = createIdempotentMutation({
  storagePrefix: "cutinapp_production_delete_attempt_",
  keyPrefix: "production-delete",
  requestKeyFor: (organizationId) => String(Number(organizationId)),
  mutate: async ({ idempotencyKey }, organizationId) => (await appApiClient.delete(
    `/organizations/${Number(organizationId)}`,
    { headers: { "Idempotency-Key": idempotencyKey } },
  )).data,
});

const updateProductionExperience = createIdempotentMutation({
  storagePrefix: "cutinapp_production_experience_update_attempt_",
  keyPrefix: "production-experience-update",
  requestKeyFor: (organizationId, payload = {}) => `${Number(organizationId)}:${createMutationRequestKey(payload)}`,
  mutate: async ({ idempotencyKey }, organizationId, payload = {}) => (await appApiClient.patch(
    `/organizations/${Number(organizationId)}/experience-profile`,
    payload,
    { headers: { "Idempotency-Key": idempotencyKey } },
  )).data,
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

const updateCourtesy = createIdempotentMutation({
  storagePrefix: "cutinapp_courtesy_update_attempt_",
  keyPrefix: "courtesy-update",
  requestKeyFor: (ticketId, payload = {}) => `${Number(ticketId)}:${createMutationRequestKey(payload)}`,
  mutate: async ({ idempotencyKey }, ticketId, payload = {}) => (await appApiClient.patch(
    `/tickets/${Number(ticketId)}`,
    payload,
    { headers: { "Idempotency-Key": idempotencyKey } },
  )).data,
});

const deleteCourtesy = createIdempotentMutation({
  storagePrefix: "cutinapp_courtesy_delete_attempt_",
  keyPrefix: "courtesy-delete",
  requestKeyFor: (ticketId) => String(Number(ticketId)),
  mutate: async ({ idempotencyKey }, ticketId) => (await appApiClient.delete(
    `/tickets/${Number(ticketId)}`,
    { headers: { "Idempotency-Key": idempotencyKey } },
  )).data,
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

const deleteProductionCommunityPost = createIdempotentMutation({
  storagePrefix: "cutinapp_production_community_delete_attempt_",
  keyPrefix: "production-community-delete",
  requestKeyFor: (postId) => String(Number(postId)),
  mutate: async ({ idempotencyKey }, postId) => (await appApiClient.delete(
    `/organization-community/${Number(postId)}`,
    { headers: { "Idempotency-Key": idempotencyKey } },
  )).data,
});

const deleteEventCommunityPost = createIdempotentMutation({
  storagePrefix: "cutinapp_event_community_delete_attempt_",
  keyPrefix: "event-community-delete",
  requestKeyFor: (postId) => String(Number(postId)),
  mutate: async ({ idempotencyKey }, postId) => (await appApiClient.delete(
    `/community/${Number(postId)}`,
    { headers: { "Idempotency-Key": idempotencyKey } },
  )).data,
});

const unlikeProductionCommunityPost = createIdempotentMutation({
  storagePrefix: "cutinapp_production_community_unlike_attempt_",
  keyPrefix: "production-community-unlike",
  requestKeyFor: (postId) => String(Number(postId)),
  mutate: async ({ idempotencyKey }, postId) => (await appApiClient.delete(
    `/organization-community/${Number(postId)}/like`,
    { headers: { "Idempotency-Key": idempotencyKey } },
  )).data,
});

const unlikeEventCommunityPost = createIdempotentMutation({
  storagePrefix: "cutinapp_event_community_unlike_attempt_",
  keyPrefix: "event-community-unlike",
  requestKeyFor: (postId) => String(Number(postId)),
  mutate: async ({ idempotencyKey }, postId) => (await appApiClient.delete(
    `/community/${Number(postId)}/like`,
    { headers: { "Idempotency-Key": idempotencyKey } },
  )).data,
});

const reportEvent = createIdempotentMutation({
  storagePrefix: "cutinapp_event_report_attempt_",
  keyPrefix: "event-report",
  requestKeyFor: (eventId, payload = {}) => `${Number(eventId)}:${createMutationRequestKey(payload)}`,
  mutate: async ({ idempotencyKey }, eventId, payload = {}) => (await appApiClient.post(
    `/events/${Number(eventId)}/report`,
    payload,
    { headers: { "Idempotency-Key": idempotencyKey } },
  )).data,
});

const uploadProductionMedia = createIdempotentMutation({
  storagePrefix: "cutinapp_production_media_upload_attempt_",
  keyPrefix: "production-media-upload",
  requestKeyFor: (organizationId, formData) => `${Number(organizationId)}:${createMutationRequestKey(formData)}`,
  mutate: async ({ idempotencyKey }, organizationId, formData) => (await appApiClient.post(
    `/organizations/${Number(organizationId)}/media`,
    formData,
    { headers: { "Idempotency-Key": idempotencyKey } },
  )).data,
});

const deleteProductionMedia = createIdempotentMutation({
  storagePrefix: "cutinapp_production_media_delete_attempt_",
  keyPrefix: "production-media-delete",
  requestKeyFor: (organizationId, mediaId) => `${Number(organizationId)}:${Number(mediaId)}`,
  mutate: async ({ idempotencyKey }, organizationId, mediaId) => (await appApiClient.delete(
    `/organizations/${Number(organizationId)}/media/${Number(mediaId)}`,
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

const updateArtist = createIdempotentMutation({
  storagePrefix: "cutinapp_artist_update_attempt_",
  keyPrefix: "artist-update",
  requestKeyFor: (artistId, payload = {}) => `${Number(artistId)}:${createMutationRequestKey(payload)}`,
  mutate: async ({ idempotencyKey }, artistId, payload = {}) => (await appApiClient.patch(`/artists/${Number(artistId)}/managed`, payload, { headers: { "Idempotency-Key": idempotencyKey } })).data,
});

const updateArtistType = createIdempotentMutation({
  storagePrefix: "cutinapp_artist_type_update_attempt_",
  keyPrefix: "artist-type-update",
  requestKeyFor: (artistId, artistType) => `${Number(artistId)}:${createMutationRequestKey({ artist_type: String(artistType || "").trim() })}`,
  mutate: async ({ idempotencyKey }, artistId, artistType) => (await appApiClient.put(`/artists/${Number(artistId)}/type`, { artist_type: String(artistType || "").trim() }, { headers: { "Idempotency-Key": idempotencyKey } })).data,
});

const updateArtistMember = createIdempotentMutation({
  storagePrefix: "cutinapp_artist_member_update_attempt_",
  keyPrefix: "artist-member-update",
  requestKeyFor: (artistId, memberId, payload = {}) => `${Number(artistId)}:${Number(memberId)}:${createMutationRequestKey(payload)}`,
  mutate: async ({ idempotencyKey }, artistId, memberId, payload = {}) => (await appApiClient.patch(`/artists/${Number(artistId)}/members/${Number(memberId)}`, payload, { headers: { "Idempotency-Key": idempotencyKey } })).data,
});

const deleteArtistMember = createIdempotentMutation({
  storagePrefix: "cutinapp_artist_member_delete_attempt_",
  keyPrefix: "artist-member-delete",
  requestKeyFor: (artistId, memberId) => `${Number(artistId)}:${Number(memberId)}`,
  mutate: async ({ idempotencyKey }, artistId, memberId) => (await appApiClient.delete(`/artists/${Number(artistId)}/members/${Number(memberId)}`, { headers: { "Idempotency-Key": idempotencyKey } })).data,
});

const reviewArtistClaim = createIdempotentMutation({
  storagePrefix: "cutinapp_artist_claim_review_attempt_",
  keyPrefix: "artist-claim-review",
  requestKeyFor: (eventId, claimId, payload = {}) => `${Number(eventId)}:${Number(claimId)}:${createMutationRequestKey(payload)}`,
  mutate: async ({ idempotencyKey }, eventId, claimId, payload = {}) => (await appApiClient.put(`/events/${Number(eventId)}/artist-claims/${Number(claimId)}`, payload, { headers: { "Idempotency-Key": idempotencyKey } })).data,
});

const detachArtist = createIdempotentMutation({
  storagePrefix: "cutinapp_event_artist_detach_attempt_",
  keyPrefix: "event-artist-detach",
  requestKeyFor: (eventId, artistId) => `${Number(eventId)}:${Number(artistId)}`,
  mutate: async ({ idempotencyKey }, eventId, artistId) => (await appApiClient.delete(`/events/${Number(eventId)}/artists/${Number(artistId)}`, { headers: { "Idempotency-Key": idempotencyKey } })).data,
});

const normalizeSocialTargetType = (targetType) => String(targetType || "").trim().toLowerCase();

const followSocialTarget = createIdempotentMutation({
  storagePrefix: "cutinapp_social_follow_attempt_",
  keyPrefix: "social-follow",
  requestKeyFor: (targetType, targetId) => `${normalizeSocialTargetType(targetType)}:${String(targetId)}`,
  mutate: async ({ idempotencyKey }, targetType, targetId) => (await appApiClient.post(
    "/social/follow",
    { target_type: normalizeSocialTargetType(targetType), target_id: targetId },
    { headers: { "Idempotency-Key": idempotencyKey } },
  )).data,
});

const unfollowSocialTarget = createIdempotentMutation({
  storagePrefix: "cutinapp_social_unfollow_attempt_",
  keyPrefix: "social-unfollow",
  requestKeyFor: (targetType, targetId) => `${normalizeSocialTargetType(targetType)}:${String(targetId)}`,
  mutate: async ({ idempotencyKey }, targetType, targetId) => (await appApiClient.delete(
    "/social/follow",
    { data: { target_type: normalizeSocialTargetType(targetType), target_id: targetId }, headers: { "Idempotency-Key": idempotencyKey } },
  )).data,
});

const rateEventMutation = createIdempotentMutation({
  storagePrefix: "cutinapp_event_rating_attempt_",
  keyPrefix: "event-rating",
  requestKeyFor: (eventId, rating) => `${Number(eventId)}:${createMutationRequestKey({ rating: Number(rating) })}`,
  mutate: async ({ idempotencyKey }, eventId, rating) => (await appApiClient.put(`/events/${Number(eventId)}/rating`, { rating: Number(rating) }, { headers: { "Idempotency-Key": idempotencyKey } })).data,
});

const updateModerationReportMutation = createIdempotentMutation({
  storagePrefix: "cutinapp_moderation_report_attempt_",
  keyPrefix: "moderation-report",
  requestKeyFor: (reportId, payload = {}) => `${Number(reportId)}:${createMutationRequestKey(payload)}`,
  mutate: async ({ idempotencyKey }, reportId, payload = {}) => (await appApiClient.put(`/moderation/reports/${Number(reportId)}`, payload, { headers: { "Idempotency-Key": idempotencyKey } })).data,
});

const saveSocialPreferencesMutation = createIdempotentMutation({
  storagePrefix: "cutinapp_social_preferences_attempt_",
  keyPrefix: "social-preferences",
  requestKeyFor: (payload = {}) => createMutationRequestKey(payload),
  mutate: async ({ idempotencyKey }, payload = {}) => (await appApiClient.put("/social/preferences", payload, { headers: { "Idempotency-Key": idempotencyKey } })).data,
});

const updateEventEngagementMutation = createIdempotentMutation({
  storagePrefix: "cutinapp_event_engagement_attempt_",
  keyPrefix: "event-engagement",
  requestKeyFor: (eventId, payload = {}) => `${Number(eventId)}:${createMutationRequestKey(payload)}`,
  mutate: async ({ idempotencyKey }, eventId, payload = {}) => (await appApiClient.put(`/events/${Number(eventId)}/engagement`, payload, { headers: { "Idempotency-Key": idempotencyKey } })).data,
});

const markNotificationReadMutation = createIdempotentMutation({
  storagePrefix: "cutinapp_notification_read_attempt_",
  keyPrefix: "notification-read",
  requestKeyFor: (notificationId) => String(Number(notificationId)),
  mutate: async ({ idempotencyKey }, notificationId) => (await appApiClient.patch(`/notifications/${Number(notificationId)}/read`, undefined, { headers: { "Idempotency-Key": idempotencyKey } })).data,
});

const markAllNotificationsReadMutation = createIdempotentMutation({
  storagePrefix: "cutinapp_notifications_read_all_attempt_",
  keyPrefix: "notifications-read-all",
  requestKeyFor: () => "all",
  mutate: async ({ idempotencyKey }) => (await appApiClient.patch("/notifications/read-all", undefined, { headers: { "Idempotency-Key": idempotencyKey } })).data,
});

const likeProductionCommunityPost = createIdempotentMutation({
  storagePrefix: "cutinapp_production_community_like_attempt_",
  keyPrefix: "production-community-like",
  requestKeyFor: (postId) => String(Number(postId)),
  mutate: async ({ idempotencyKey }, postId) => (await appApiClient.post(
    `/organization-community/${Number(postId)}/like`,
    undefined,
    { headers: { "Idempotency-Key": idempotencyKey } },
  )).data,
});

const likeEventCommunityPost = createIdempotentMutation({
  storagePrefix: "cutinapp_event_community_like_attempt_",
  keyPrefix: "event-community-like",
  requestKeyFor: (postId) => String(Number(postId)),
  mutate: async ({ idempotencyKey }, postId) => (await appApiClient.post(
    `/community/${Number(postId)}/like`,
    undefined,
    { headers: { "Idempotency-Key": idempotencyKey } },
  )).data,
});

const publishEventMutation = createIdempotentMutation({
  storagePrefix: "cutinapp_event_publish_attempt_",
  keyPrefix: "event-publish",
  requestKeyFor: (eventId) => String(Number(eventId)),
  mutate: async ({ idempotencyKey }, eventId) => {
    const data = (await appApiClient.post(
      `/events/${Number(eventId)}/publish`,
      undefined,
      { headers: { "Idempotency-Key": idempotencyKey } },
    )).data;
    invalidatePublicRequestCache("/events");
    return data;
  },
});

const unpublishEventMutation = createIdempotentMutation({
  storagePrefix: "cutinapp_event_unpublish_attempt_",
  keyPrefix: "event-unpublish",
  requestKeyFor: (eventId) => String(Number(eventId)),
  mutate: async ({ idempotencyKey }, eventId) => {
    const data = (await appApiClient.post(
      `/events/${Number(eventId)}/unpublish`,
      undefined,
      { headers: { "Idempotency-Key": idempotencyKey } },
    )).data;
    invalidatePublicRequestCache("/events");
    return data;
  },
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

  globalSearch: async (params = {}, signal = undefined) => (await appApiClient.get("/global-search", { params, signal, headers: searchSessionHeaders() })).data,
  globalSearchSuggestions: async (params = {}, signal = undefined) => (await appApiClient.get("/global-search/suggestions", { params, signal, headers: searchSessionHeaders() })).data,
  globalSearchDiscover: async (params = {}, signal = undefined) => (await appApiClient.get("/global-search/discover", { params, signal, headers: searchSessionHeaders() })).data,
  globalSearchTrending: async (params = {}, signal = undefined) => (await appApiClient.get("/global-search/trending", { params, signal, headers: searchSessionHeaders() })).data,
  trackGlobalSearchClick: async (payload = {}) => (await appApiClient.post("/global-search/click", payload, { headers: searchSessionHeaders() })).data,
  trackGlobalSearchConversion: async (payload = {}) => (await appApiClient.post("/global-search/convert", payload)).data,
  globalSearchRecent: async (params = {}) => (await appApiClient.get("/global-search/recent", { params })).data,
  clearGlobalSearchRecent: async (params = {}) => (await appApiClient.delete("/global-search/recent", { params })).data,
  globalSearchSaved: async () => (await appApiClient.get("/global-search/saved")).data,
  saveGlobalSearch: async (payload = {}) => (await appApiClient.post("/global-search/saved", payload)).data,
  deleteSavedGlobalSearch: async (id) => (await appApiClient.delete(`/global-search/saved/${Number(id)}`)).data,
  producerSearchInsights: async (params = {}) => (await appApiClient.get("/global-search/producer-insights", { params })).data,
  adminSearchAnalytics: async (params = {}) => (await appApiClient.get("/global-search/admin/analytics", { params })).data,
  adminSearchCampaigns: async () => (await appApiClient.get("/global-search/admin/campaigns")).data,
  createAdminSearchCampaign: async (payload = {}) => (await appApiClient.post("/global-search/admin/campaigns", payload)).data,
  updateAdminSearchCampaign: async (id, payload = {}) => (await appApiClient.patch(`/global-search/admin/campaigns/${Number(id)}`, payload)).data,
  deleteAdminSearchCampaign: async (id) => (await appApiClient.delete(`/global-search/admin/campaigns/${Number(id)}`)).data,
  profileOverview: async () => (await appApiClient.get("/profile/overview")).data,
  publicProfile: async (userId) => (await appApiClient.get(`/profiles/${Number(userId)}`)).data,
  myProductions: async () => unwrap((await appApiClient.get("/organizations/mine")).data.organizations),
  publicProductions: async (params = {}) => rename(await cachedPublicGet(appApiClient, "/organizations/public", { params, ttlMs: 30000, staleMs: 180000 }), "organizations", "productions"),
  getProduction: async (id) => (await appApiClient.get(`/organizations/${id}`)).data.organization,
  productionItems: async (id) => unwrap((await appApiClient.get(`/establishments/${id}/items`)).data.data),
  productionWorkspace: async (id) => (await appApiClient.get(`/organizations/${id}/workspace`)).data,
  productionExperience: async (slug) => (await appApiClient.get(`/organizations/public/${slug}/experience`)).data,
  updateProductionExperience,
  productionCommunity: async (slug, params = {}) => (await appApiClient.get(`/organizations/public/${slug}/community`, { params })).data,
  createProductionPost: (organizationId, payload) => createProductionCommunityPost(organizationId, payload),
  deleteProductionPost: deleteProductionCommunityPost,
  likeProductionPost: likeProductionCommunityPost,
  unlikeProductionPost: unlikeProductionCommunityPost,
  uploadProductionMedia,
  deleteProductionMedia,
  publicProduction: async (slug) => rename(await cachedPublicGet(appApiClient, `/organizations/public/${slug}`, { ttlMs: 30000, staleMs: 180000 }), "organization", "production"),
  createProduction,
  updateProduction,
  deleteProduction,
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
  publicEventArtists: async (slug) => (await cachedPublicGet(appApiClient, `/events/public/${slug}/artists`, { ttlMs: 30000, staleMs: 300000 })).artists || [],
  eventCommunity: async (slug, params = {}) => (await appApiClient.get(`/events/public/${slug}/community`, { params })).data,
  createEventPost: (eventId, payload) => createEventCommunityPost(eventId, payload),
  createFeedPost: (payload) => createEventCommunityPost(0, payload),
  deleteEventPost: deleteEventCommunityPost,
  likeEventPost: likeEventCommunityPost,
  unlikeEventPost: unlikeEventCommunityPost,
  rateEvent: rateEventMutation,
  reportEvent,

  moderationReports: async (params = {}) => (await appApiClient.get("/moderation/reports", { params })).data,
  updateModerationReport: updateModerationReportMutation,
  myArtists: async () => unwrap((await appApiClient.get("/artists/manageable", { params: { per_page: 100 } })).data.artists),
  createArtist,
  updateArtist,
  updateArtistType,
  artistMembers: async (id) => (await appApiClient.get(`/artists/${id}/members`)).data.members || [],
  createArtistMember,
  updateArtistMember,
  deleteArtistMember,
  artistClaimability: async (eventId, artistId) => (await appApiClient.get(`/events/${eventId}/artists/${artistId}/claim`)).data,
  claimArtistEvent,
  myArtistClaims: async () => (await appApiClient.get("/artist-claims/mine")).data,
  eventArtistClaims: async (eventId) => (await appApiClient.get(`/events/${eventId}/artist-claims`)).data,
  reviewArtistClaim,
  eventArtists: async (eventId) => (await appApiClient.get(`/events/${eventId}/artists`)).data,
  attachArtist,
  detachArtist,
  follow: async (targetType, targetId) => { const data = await followSocialTarget(targetType, targetId); await trackSearchConversion("follow", targetId).catch(() => false); return data; },
  unfollow: unfollowSocialTarget,
  preferences: async () => (await appApiClient.get("/social/preferences")).data.preferences,
  savePreferences: saveSocialPreferencesMutation,
  engagement: updateEventEngagementMutation,
  feed: async (params = {}) => (await appApiClient.get("/feed", { params })).data,

  notifications: async (params = {}) => (await appApiClient.get("/notifications", { params })).data,
  markNotificationRead: markNotificationReadMutation,
  markAllNotificationsRead: markAllNotificationsReadMutation,
  publishEvent: publishEventMutation,
  unpublishEvent: unpublishEventMutation,

  eventCourtesies: async (eventId) => (await appApiClient.get(`/events/${eventId}/tickets`)).data,
  updateCourtesy,
  deleteCourtesy,
  claimCourtesy,
  myPasses: async () => unwrap((await appApiClient.get(`/passes/mine`)).data.passes),
  getPass: async (passId) => (await appApiClient.get(`/passes/${passId}`)).data.pass,
  transferPass,
  eventParticipants: async (eventId) => (await appApiClient.get(`/events/${eventId}/participants`)).data,
  checkIn,
  checkInStats: async (eventId) => (await appApiClient.get(`/checkin/events/${eventId}/stats`)).data,
};

export default cutinappService;
