const asArray = (value) => Array.isArray(value) ? value : [];

const eventTimestamp = (event) => {
  const value = event?.end_date || event?.start_date;
  const timestamp = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : null;
};

/**
 * Builds profile memories only from event records the API already authorized
 * for the current viewer. This helper deliberately does not infer attendance
 * from interests, follows, proximity or public event discovery.
 */
export const deriveEventMemories = (events, now = Date.now()) => {
  const seen = new Set();

  return asArray(events)
    .filter((event) => {
      if (!event?.id || seen.has(String(event.id))) return false;
      const timestamp = eventTimestamp(event);
      if (timestamp === null || timestamp > now) return false;
      seen.add(String(event.id));
      return true;
    })
    .sort((left, right) => (eventTimestamp(right) || 0) - (eventTimestamp(left) || 0));
};

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
 * only when the API provides a non-negative integer visit/check-in count.
 */
export const normalizeVisitedPlaces = (places) => asArray(places)
  .map((place) => {
    const rawVisits = place?.visits_count ?? place?.checkins_count;
    const visits = Number(rawVisits);
    if (!Number.isInteger(visits) || visits < 0) return null;

    return {
      ...place,
      visits_count: visits,
      relative_badge: relativeVisitBadge({
        rank: place?.visit_rank,
        population: place?.visit_rank_population,
      }),
    };
  })
  .filter(Boolean)
  .sort((left, right) => right.visits_count - left.visits_count);
