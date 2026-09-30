import assert from "node:assert/strict";
import {
  dateKeyForContext,
  discoveryContext,
  eventCountry,
  eventLocale,
  eventTimeZone,
  formatDateForContext,
  organizerIdentity,
  snapshotContext,
} from "./seo-snapshot-global-context.mjs";

const siteUrl = "https://cutinapp.petertecnet.com.br";

const internationalEvent = {
  locale: "en-GB",
  timezone: "Europe/London",
  country_code: "gb",
  organizer_name: "External Nights Ltd",
  organizer_url: "https://example.org/events",
};

assert.equal(eventLocale(internationalEvent), "en-GB");
assert.equal(eventTimeZone(internationalEvent), "Europe/London");
assert.equal(eventCountry(internationalEvent), "GB");
assert.deepEqual(snapshotContext(internationalEvent), {
  locale: "en-GB",
  timeZone: "Europe/London",
  country: "GB",
});
assert.deepEqual(discoveryContext([internationalEvent]), {
  locale: "en-GB",
  timeZone: "Europe/London",
  country: "GB",
});
assert.deepEqual(discoveryContext([]), {
  locale: process.env.CUTINAPP_SEO_LOCALE || "en",
  timeZone: process.env.CUTINAPP_SEO_TIME_ZONE || "UTC",
  country: undefined,
});
assert.deepEqual(organizerIdentity(internationalEvent, siteUrl), {
  name: "External Nights Ltd",
  url: "https://example.org/events",
});

const boundaryInstant = "2026-01-01T00:30:00Z";
assert.equal(dateKeyForContext(boundaryInstant, { timeZone: "Europe/London" }), "2026-01-01");
assert.equal(dateKeyForContext(boundaryInstant, { timeZone: "America/New_York" }), "2025-12-31");
assert.match(
  formatDateForContext(boundaryInstant, { locale: "en-GB", timeZone: "Europe/London" }),
  /01 January 2026/i,
);
assert.match(
  formatDateForContext(boundaryInstant, { locale: "en-US", timeZone: "America/New_York" }),
  /December 31, 2025/i,
);
assert.equal(dateKeyForContext("not-a-date", { timeZone: "UTC" }), "");
assert.equal(formatDateForContext("not-a-date", { locale: "en", timeZone: "UTC" }), "");

assert.equal(eventCountry({}), undefined, "missing country must stay unknown instead of becoming BR");
assert.equal(eventTimeZone({ timezone: "Invalid/Zone" }), process.env.CUTINAPP_SEO_TIME_ZONE || "UTC");
assert.equal(eventLocale({ locale: "not_a_locale" }), process.env.CUTINAPP_SEO_LOCALE || "en");
assert.deepEqual(organizerIdentity({ organizer_name: "External Organizer" }, siteUrl), {
  name: "External Organizer",
}, "external organizer without its own URL must not inherit the Cutinapp homepage");
assert.deepEqual(organizerIdentity({ production: { name: "Cutin Production", slug: "cutin-production" } }, siteUrl), {
  name: "Cutin Production",
  url: `${siteUrl}/production/cutin-production/public`,
});
assert.deepEqual(organizerIdentity({}, siteUrl), { name: "Cutinapp", url: siteUrl });

console.log("SEO snapshot global context checks passed.");
