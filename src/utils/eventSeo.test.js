import { buildEventSeo } from "./eventSeo";

const eventSchema = (seo) => seo.jsonLd.find((entry) => entry["@type"] === "Event");

describe("event structured data offer availability", () => {
  const baseEvent = {
    slug: "night-session",
    title: "Night Session",
    start_date: "2026-10-10T22:00:00-03:00",
    city: "Lisbon",
    country: "PT",
  };

  test("keeps an available ticket in stock for an active event", () => {
    const seo = buildEventSeo(baseEvent, {
      tickets: [{ id: 1, name: "General", price: 20, currency: "EUR", available: true }],
    });

    expect(eventSchema(seo).eventStatus).toBe("https://schema.org/EventScheduled");
    expect(eventSchema(seo).offers[0].availability).toBe("https://schema.org/InStock");
  });

  test("never advertises tickets as in stock when the event is cancelled", () => {
    const seo = buildEventSeo({ ...baseEvent, is_cancelled: true }, {
      tickets: [{ id: 1, name: "General", price: 20, currency: "EUR", available: true }],
    });

    expect(eventSchema(seo).eventStatus).toBe("https://schema.org/EventCancelled");
    expect(eventSchema(seo).offers[0].availability).toBe("https://schema.org/SoldOut");
  });
});
