import { parsePortableEventDate } from "../../utils/chronologicalDiscovery";
import { matchesSelectedCity } from "../../utils/discoveryCities";

export const flyerStart = (event) => (
  event?.starts_at || event?.start_at || event?.start_date || event?.date || event?.scheduled_at
);

export const flyerImage = (event) => (
  event?.flyer || event?.image || event?.poster || event?.cover || ""
);

// A API pode retornar destaques fora da janela "soonest" durante o fallback.
// Nunca colocar evento encerrado ou sem flyer na vitrine dos próximos eventos.
export const selectUpcomingFlyers = (events, now = new Date(), limit = 9, selectedCity = {}) => {
  if (!Array.isArray(events)) return [];
  const current = new Date(now).getTime();
  const seen = new Set();

  return events
    .filter((event) => {
      const date = parsePortableEventDate(flyerStart(event));
      const key = String(event?.slug || event?.id || "");
      const status = String(event?.status || "").toLowerCase();
      if (!matchesSelectedCity(event, selectedCity)) return false;
      if (!key || !flyerImage(event) || !date || date.getTime() < current) return false;
      if (event?.is_cancelled || ["cancelled", "canceled", "deleted"].includes(status)) return false;
      return true;
    })
    .sort((a, b) => parsePortableEventDate(flyerStart(a)) - parsePortableEventDate(flyerStart(b)))
    .filter((event) => {
      const key = String(event.slug || event.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
};
