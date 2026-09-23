import { parsePortableEventDate } from "./chronologicalDiscovery";

const asArray = (value) => Array.isArray(value) ? value : [];

const eventEndValue = (event) => event?.end_date || event?.ends_at || event?.ended_at || null;
const eventStartValue = (event) => event?.start_date || event?.starts_at || event?.scheduled_at || event?.date || null;
const eventTimestamp = (event) => {
  const date = parsePortableEventDate(eventEndValue(event) || eventStartValue(event));
  return date ? date.getTime() : null;
};

const explicitTrue = (value) => value === true || value === 1 || value === "1";
const explicitFalse = (value) => value === false || value === 0 || value === "0";
const viewerCanSee = (value) => !explicitFalse(value?.visible) && !explicitFalse(value?.viewer_can_see);
const normalizePersonalRating = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const rating = Number(value);
  return Number.isFinite(rating) && rating >= 1 && rating <= 5 ? rating : null;
};
const positiveInteger = (value) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
};
const usableIdentity = (value) => Boolean(value?.id || value?.slug || value?.name || value?.title);
const usableMemoryPlace = (place) => {
  if (typeof place === "string") return place.trim().length > 0;
  return Boolean(place && typeof place === "object" && viewerCanSee(place) && usableIdentity(place));
};
const visibleMemoryPlace = (event) => [event?.place, event?.establishment].find(usableMemoryPlace) ?? null;
const usableMemoryImage = (image) => {
  if (typeof image === "string") return image.trim().length > 0;
  if (!image || typeof image !== "object" || !viewerCanSee(image)) return false;
  return Boolean(image.url || image.path || image.src);
};
const visibleMemoryImage = (event) => [event?.image, event?.cover, event?.flyer].find(usableMemoryImage) ?? null;

/** Builds memories only from event records already authorized for this viewer. */
export const deriveEventMemories = (events, now = Date.now()) => {
  const seen = new Set();
  return asArray(events)
    .filter((event) => {
      if (!event?.id || !viewerCanSee(event) || seen.has(String(event.id))) return false;
      const timestamp = eventTimestamp(event);
      if (timestamp === null || timestamp > now) return false;
      seen.add(String(event.id));
      return true;
    })
    .sort((left, right) => (eventTimestamp(right) || 0) - (eventTimestamp(left) || 0));
};

/** Normalizes post-event data without broadening API permissions on the client. */
export const normalizeEventMemory = (event) => {
  if (!event?.id || !viewerCanSee(event)) return null;
  const permissionCandidate = event.viewer_permissions ?? event.permissions ?? null;
  const permissions = permissionCandidate && viewerCanSee(permissionCandidate) ? permissionCandidate : {};
  const permissionsHidden = Boolean(permissionCandidate) && !viewerCanSee(permissionCandidate);
  const scopedPermission = (key) => {
    if (permissionsHidden) return false;
    if (permissionCandidate) return explicitTrue(permissions[key]);
    return explicitTrue(event[key]);
  };
  const photos = asArray(event.photos).filter((photo) => {
    if (typeof photo === "string") return Boolean(photo);
    return viewerCanSee(photo) && Boolean(photo?.url || photo?.path);
  });
  const publications = asArray(event.publications ?? event.posts).filter((post) => post?.id && viewerCanSee(post));
  const reviewAliases = [event.viewer_review, event.my_review].filter(Boolean);
  const viewerReview = reviewAliases.find((review) => viewerCanSee(review)) || null;
  const viewerRating = normalizePersonalRating(reviewAliases.length > 0 ? viewerReview?.rating : event.viewer_rating);

  return {
    id: event.id,
    slug: event.slug || null,
    title: event.title || "Evento",
    image: visibleMemoryImage(event),
    start_date: eventStartValue(event),
    end_date: eventEndValue(event),
    place: visibleMemoryPlace(event),
    photos,
    publications,
    rating: viewerRating,
    can_review: scopedPermission("can_review"),
    can_publish: scopedPermission("can_publish"),
  };
};

export const deriveMemoryTimeline = (events, now = Date.now()) => deriveEventMemories(events, now)
  .map(normalizeEventMemory)
  .filter(Boolean);

/** Relative badges are shown only from explicit backend rank/population evidence. */
export const relativeVisitBadge = ({ rank, population, minimumPopulation = 100 } = {}) => {
  const safeRank = Number(rank);
  const safePopulation = Number(population);
  const safeMinimum = Math.max(1, Number(minimumPopulation) || 100);
  if (!Number.isInteger(safeRank) || !Number.isInteger(safePopulation)) return null;
  if (safeRank < 1 || safePopulation < safeMinimum || safeRank > safePopulation) return null;
  const percentile = safeRank / safePopulation;
  if (percentile <= 0.01) return "Top 1%";
  if (percentile <= 0.05) return "Top 5%";
  if (percentile <= 0.1) return "Top 10%";
  return null;
};

/**
 * Normalizes place activity without fabricating visits. A visited place must
 * have both a usable identity and an explicit positive visit/check-in count.
 * This prevents malformed aggregate rows from appearing as anonymous places
 * in the profile while preserving generic place/establishment payloads.
 */
export const normalizeVisitedPlaces = (places) => asArray(places)
  .map((place) => {
    if (!place || !viewerCanSee(place) || !usableIdentity(place)) return null;
    const visits = positiveInteger(place.visits_count) ?? positiveInteger(place.checkins_count);
    if (visits === null) return null;
    return {
      ...place,
      visits_count: visits,
      is_following: explicitTrue(place.is_following ?? place.viewer_following),
      relative_badge: relativeVisitBadge({ rank: place?.visit_rank, population: place?.visit_rank_population }),
    };
  })
  .filter(Boolean)
  .sort((left, right) => right.visits_count - left.visits_count);
