const PREFIX = "cutinapp_timeline_attribution_";
const TTL_MS = 48 * 60 * 60 * 1000;

export const writeTimelineAttribution = ({ eventId, postId, source = "timeline", campaign = null, promoterId = null }) => {
  if (!eventId || !postId) return;
  try {
    sessionStorage.setItem(`${PREFIX}${eventId}`, JSON.stringify({
      event_id: Number(eventId),
      post_id: Number(postId),
      source,
      campaign,
      promoter_id: promoterId ? Number(promoterId) : null,
      created_at: Date.now(),
    }));
  } catch (_) { /* noop */ }
};

export const readTimelineAttribution = (eventId, now = Date.now()) => {
  if (!eventId) return null;
  try {
    const raw = sessionStorage.getItem(`${PREFIX}${eventId}`);
    const value = raw ? JSON.parse(raw) : null;
    if (!value || Number(value.event_id) !== Number(eventId) || !value.post_id) return null;
    if (now - Number(value.created_at || 0) > TTL_MS) {
      sessionStorage.removeItem(`${PREFIX}${eventId}`);
      return null;
    }
    return value;
  } catch (_) {
    return null;
  }
};

export const clearTimelineAttribution = (eventId) => {
  try { sessionStorage.removeItem(`${PREFIX}${eventId}`); } catch (_) { /* noop */ }
};
