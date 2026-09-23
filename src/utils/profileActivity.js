import { parsePortableEventDate } from "./chronologicalDiscovery";

const asArray = (value) => Array.isArray(value) ? value : [];

const eventTimestamp = (event) => {
  const value = event?.end_date || event?.start_date;
  const date = parsePortableEventDate(value);
  return date ? date.getTime() : null;
};

const explicitTrue = (value) => value === true || value === 1 || value === "1";
const explicitFalse = (value) => value === false || value === 0 || value === "0";
const viewerCanSee = (value) => !explicitFalse(value?.visible) && !explicitFalse(value?.viewer_can_see);

/**
 * Builds profile memories only from event records the API already authorized
 * for the current viewer. This helper deliberately does not infer attendance
 * from interests, follows, proximity or public event discovery. Explicit
 * visibility denial always wins, even if the record was included in a payload.
 */
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

/**
 * Normalizes post-event memory data without broadening permissions on the
 * client. Missing review/publication flags are denied rather than inferred.
 */
export const normalizeEventMemory = (event) => {
  if (!event?.id || !viewerCanSee(event)) return null;
  const permissions = event.permissions || event.viewer_permissions || {};
  const photos = asArray(event.photos).filter((photo) => photo?.url || photo?.path || typeof photo === "string");
  const publications = asArray(event.publications ?? event.posts).filter((post) => post?.id && viewerCanSee(post));

  return {
    id: event.id,
    slug: event.slug || null,
    title: event.title || "Evento",
    image: event.image || event.cover || event.flyer || null,
    start_date: event.start_date || null,
    end_date: event.end_date || null,
    place: event.place || event.establishment || null,
    photos,
    publications,
    rating: event.viewer_rating ?? event.rating ?? null,
    can_review: explicitTrue(permissions.can_review ?? event.can_review),
    can_publish: explicitTrue(permissions.can_publish ?? event.can_publish),
  };
};

export const deriveMemoryTimeline = (events, now = Date.now()) => deriveEventMemories(events, now)
  .map(normalizeEventMemory)
  .filter(Boolean);

/**
 * Returns a relative Top 1/5/10% label only when the backend supplied an
 * explicit rank and population large enough to make the comparison useful.
 * No rank is estimated from local/profile-only data.
 */
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
 * Normalizes place activity without fabricating visits. A place is eligible
 * only when the API provides a positive integer visit/check-in count. Zero is
 * intentionally excluded: a followed/suggested place is not a visited place.
 * Explicit viewer visibility=false also wins over otherwise valid activity.
 */
export const normalizeVisitedPlaces = (places) => asArray(places)
  .map((place) => {
    if (!place || !viewerCanSee(place)) return null;
    const rawVisits = place.visits_count ?? place.checkins_count;
    const visits = Number(rawVisits);
    if (!Number.isInteger(visits) || visits <= 0) return null;

    return {
      ...place,
      visits_count: visits,
      is_following: explicitTrue(place.is_following ?? place.viewer_following),
      relative_badge: relativeVisitBadge({
        rank: place?.visit_rank,
        population: place?.visit_rank_population,
      }),
    };
  })
  .filter(Boolean)
  .sort((left, right) => right.visits_count - left.visits_count);
