import assert from "node:assert/strict";
import {
  eventCountry,
  eventLocale,
  eventTimeZone,
  organizerIdentity,
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
assert.deepEqual(organizerIdentity(internationalEvent, siteUrl), {
  name: "External Nights Ltd",
  url: "https://example.org/events",
});

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
