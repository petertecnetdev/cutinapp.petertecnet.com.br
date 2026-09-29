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

  test("publishes a zero-price offer for a free event even when no ticket rows are returned", () => {
    const seo = buildEventSeo({ ...baseEvent, is_free: true, currency: "EUR" });
    const event = eventSchema(seo);

    expect(event.isAccessibleForFree).toBe(true);
    expect(event.offers).toHaveLength(1);
    expect(event.offers[0]).toMatchObject({
      "@type": "Offer",
      price: "0.00",
      priceCurrency: "EUR",
      availability: "https://schema.org/InStock",
    });
  });

  test("marks the synthetic free offer sold out when the event is cancelled", () => {
    const seo = buildEventSeo({ ...baseEvent, is_free: true, is_cancelled: true });

    expect(eventSchema(seo).offers[0].availability).toBe("https://schema.org/SoldOut");
  });
});

describe("event structured data locations", () => {
  test("does not emit an empty VirtualLocation for a hybrid event without online_url", () => {
    const seo = buildEventSeo({
      slug: "hybrid-night",
      title: "Hybrid Night",
      event_format: "hybrid",
      venue: "Main Hall",
      city: "Lisbon",
      country: "PT",
    });

    expect(eventSchema(seo).eventAttendanceMode).toBe("https://schema.org/MixedEventAttendanceMode");
    expect(eventSchema(seo).location).toHaveLength(1);
    expect(eventSchema(seo).location[0]["@type"]).toBe("Place");
  });

  test("includes the virtual location for a hybrid event when online_url is available", () => {
    const seo = buildEventSeo({
      slug: "hybrid-night-stream",
      title: "Hybrid Night Stream",
      event_format: "hybrid",
      venue: "Main Hall",
      city: "Lisbon",
      country: "PT",
      online_url: "https://stream.example.test/hybrid-night",
    });

    expect(eventSchema(seo).location).toHaveLength(2);
    expect(eventSchema(seo).location[1]).toEqual({
      "@type": "VirtualLocation",
      url: "https://stream.example.test/hybrid-night",
    });
  });
});
