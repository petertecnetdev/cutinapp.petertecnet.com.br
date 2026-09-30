const DEFAULT_LOCALE = process.env.CUTINAPP_SEO_LOCALE || "en";
const DEFAULT_TIME_ZONE = process.env.CUTINAPP_SEO_TIME_ZONE || "UTC";

const firstText = (...values) => values
  .map((value) => String(value ?? "").trim())
  .find(Boolean) || "";

const validLocale = (value) => {
  const locale = firstText(value, DEFAULT_LOCALE);
  try {
    new Intl.DateTimeFormat(locale);
    return locale;
  } catch (_) {
    return DEFAULT_LOCALE;
  }
};

const validTimeZone = (value) => {
  const timeZone = firstText(value, DEFAULT_TIME_ZONE);
  try {
    new Intl.DateTimeFormat("en", { timeZone });
    return timeZone;
  } catch (_) {
    return DEFAULT_TIME_ZONE;
  }
};

export const eventLocale = (event = {}) => validLocale(
  firstText(event.locale, event.language, event.language_code),
);

export const eventTimeZone = (event = {}) => validTimeZone(
  firstText(
    event.timezone,
    event.time_zone,
    event.venue?.timezone,
    event.location?.timezone,
  ),
);

export const eventCountry = (event = {}) => {
  const country = firstText(
    event.country_code,
    event.country,
    event.location?.country_code,
    event.location?.country,
  );
  if (!country) return undefined;
  return country.length === 2 ? country.toUpperCase() : country;
};

const absoluteHttpUrl = (value) => {
  const raw = firstText(value);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return ["http:", "https:"].includes(url.protocol) ? url.href : undefined;
  } catch (_) {
    return undefined;
  }
};

export const organizerIdentity = (event = {}, siteUrl) => {
  const production = event.production || event.organization || null;
  const explicitName = firstText(event.organizer_name, production?.name);
  const productionUrl = production?.slug
    ? `${siteUrl}/production/${encodeURIComponent(production.slug)}/public`
    : undefined;
  const externalUrl = absoluteHttpUrl(firstText(
    event.organizer_url,
    event.organizer_website,
    production?.url,
    production?.website,
  ));

  // Only attribute the platform homepage when there is no external organizer identity.
  if (!explicitName) return { name: "Cutinapp", url: siteUrl };
  return {
    name: explicitName,
    ...(productionUrl || externalUrl ? { url: productionUrl || externalUrl } : {}),
  };
};

export const snapshotContext = (event = {}) => ({
  locale: eventLocale(event),
  timeZone: eventTimeZone(event),
  country: eventCountry(event),
});
