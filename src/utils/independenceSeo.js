import { safeListingSourceUrl } from './independenceListing';

const BASE = 'https://cutinapp.petertecnet.com.br';
const text = (value) => String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const date = (value) => value && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : '';

/** Draft metadata for W05 to wire into SSR/prerender, not a replacement for crawler snapshots. */
export const buildIndependenceSeo = (entity, kind, now = Date.now()) => {
  const validKind = kind === 'event' || kind === 'production';
  const isEvent = kind === 'event';
  const title = text(isEvent ? entity?.title : entity?.name);
  // A public source is not permission to reproduce its text. Fail closed until W05
  // explicitly attests original or licensed editorial copy.
  const contentRightsVerified = entity?.content_rights_verified === true;
  const description = contentRightsVerified ? text(entity?.description).slice(0, 160) : '';
  const slug = String(entity?.slug || '').trim();
  const canonical = slug ? `${BASE}/${isEvent ? 'event' : 'production'}/${encodeURIComponent(slug)}${isEvent ? '' : '/public'}` : BASE;
  const sourceUrl = safeListingSourceUrl(entity?.source_url);
  const checkedAt = date(entity?.last_verified_at);
  const recent = checkedAt && Date.parse(checkedAt) <= now && now - Date.parse(checkedAt) <= 180 * 86400000;
  const startsAt = date(entity?.start_date);
  const venue = text(entity?.venue || entity?.address);
  const city = text(entity?.city);
  const locationPresent = Boolean(venue || city || entity?.event_format === 'online');
  const endOrStart = date(entity?.end_date) || startsAt;
  const expired = isEvent && Boolean(endOrStart) && Date.parse(endOrStart) < now - 60 * 86400000;
  const indexable = Boolean(validKind && contentRightsVerified && slug && sourceUrl && recent && !expired && description.length >= 100 && title.length >= 8 && (!isEvent || (startsAt && locationPresent)));
  const organizerName = text(entity?.organizer_name || entity?.production?.name);
  const authorizedImage = entity?.image_rights_verified === true ? safeListingSourceUrl(entity?.image_url) : '';
  const jsonLd = isEvent && indexable && startsAt && locationPresent ? {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: title,
    url: canonical,
    startDate: startsAt,
    ...(date(entity?.end_date) ? { endDate: date(entity.end_date) } : {}),
    description,
    eventAttendanceMode: entity?.event_format === 'online'
      ? 'https://schema.org/OnlineEventAttendanceMode'
      : 'https://schema.org/OfflineEventAttendanceMode',
    ...(entity?.event_format === 'online'
      ? { location: { '@type': 'VirtualLocation', url: canonical } }
      : { location: { '@type': 'Place', name: venue || city, address: { '@type': 'PostalAddress', addressLocality: city || undefined, addressCountry: entity?.country || entity?.country_code || undefined } } }),
    // An unverified organizer must not be asserted as the authoritative organizer
    // in structured data until independent identity verification is confirmed.
    ...(organizerName && entity?.organizer_identity_verified === true
      ? { organizer: { '@type': 'Organization', name: organizerName } } : {}),
    ...(authorizedImage ? { image: authorizedImage } : {}),
    // Deliberately no offers or Cutinapp-as-organizer fallback for unverified listings.
  } : null;
  return {
    title: `${title || 'Ficha informativa'} | Cutinapp`,
    description: description || 'Ficha informativa da curadoria Cutinapp. Organizador não verificado.',
    canonical,
    og: { type: isEvent ? 'event' : 'website', title: `${title || 'Ficha informativa'} | Cutinapp`,
      description: description || 'Ficha informativa da curadoria Cutinapp. Organizador não verificado.',
      url: canonical, ...(authorizedImage ? { image: authorizedImage } : {}) },
    robots: indexable ? 'index, follow' : 'noindex, follow',
    jsonLd,
    indexable,
  };
};
