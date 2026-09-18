import appApiClient from "./AppApiClient";

const artistService = {
  searchCandidates: async (eventId, query) => {
    const response = await appApiClient.get(`/events/${Number(eventId)}/artist-candidates`, {
      params: { q: String(query || "").trim() },
    });
    return response.data?.users || [];
  },

  resolveAndInvite: async (eventId, payload) => (
    await appApiClient.post(`/events/${Number(eventId)}/artists/resolve`, payload)
  ).data,

  claimPendingInvitations: async () => (
    await appApiClient.post("/artist-invitations/claim-pending")
  ).data,

  onboardingStatus: async () => (await appApiClient.get("/artist-onboarding")).data,
  activateArtist: async (payload = {}) => (await appApiClient.post("/artist-onboarding/activate", payload)).data,
  claimCandidates: async (query) => (
    await appApiClient.get("/artist-onboarding/claim-candidates", { params: { q: String(query || "").trim() } })
  ).data?.artists || [],
  claimExisting: async (artistId, payload = {}) => (
    await appApiClient.post(`/artist-onboarding/claims/${Number(artistId)}`, payload)
  ).data,
  updateReferenceVisibility: async (artistId, visible) => (
    await appApiClient.patch(`/artists/${Number(artistId)}/reference-visibility`, { visible: Boolean(visible) })
  ).data,
  identityClaimQueue: async () => (await appApiClient.get("/artist-onboarding/admin/claims")).data?.claims || [],
  reviewIdentityClaim: async (claimId, decision, reviewNotes = "") => (
    await appApiClient.put(`/artist-onboarding/admin/claims/${Number(claimId)}`, {
      decision,
      review_notes: String(reviewNotes || "").trim() || null,
    })
  ).data,

  updateParticipation: async (eventId, artistId, payload) => (
    await appApiClient.patch(`/events/${Number(eventId)}/artists/${Number(artistId)}/participation`, payload)
  ).data,

  reorderLineup: async (eventId, artists) => (
    await appApiClient.put(`/events/${Number(eventId)}/artists/reorder`, { artists })
  ).data,

  respondToInvitation: async (eventId, artistId, decision) => (
    await appApiClient.put(`/events/${Number(eventId)}/artists/${Number(artistId)}/response`, { decision })
  ).data,

  checkInArtist: async (eventId, artistId) => (
    await appApiClient.post(`/events/${Number(eventId)}/artists/${Number(artistId)}/check-in`)
  ).data,

  dashboard: async () => (await appApiClient.get("/artist-dashboard")).data,
  analytics: async (artistId, params = {}) => (await appApiClient.get(`/artists/${Number(artistId)}/analytics`, { params })).data,
  track: async (artistId, payload) => (await appApiClient.post(`/artists/${Number(artistId)}/analytics/track`, payload)).data,

  favorite: async (artistId) => (await appApiClient.post(`/artists/${Number(artistId)}/favorite`)).data,
  unfavorite: async (artistId) => (await appApiClient.delete(`/artists/${Number(artistId)}/favorite`)).data,

  managers: async (artistId) => (await appApiClient.get(`/artists/${Number(artistId)}/managers`)).data?.managers || [],
  addManager: async (artistId, payload) => (await appApiClient.post(`/artists/${Number(artistId)}/managers`, payload)).data,
  removeManager: async (artistId, userId) => (await appApiClient.delete(`/artists/${Number(artistId)}/managers/${Number(userId)}`)).data,
};

export default artistService;
