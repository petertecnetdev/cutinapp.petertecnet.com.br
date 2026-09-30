import {
  buildPublishedEventActivationMetadata,
  buildTicketCreationHandoff,
  normalizeProducerAcquisitionSource,
  resolveProducerAcquisitionSource,
} from "./producerActivationAttribution";

describe("producer activation attribution", () => {
  test("normalizes and bounds acquisition source", () => {
    expect(normalizeProducerAcquisitionSource("  instagram-producer  ")).toBe("instagram-producer");
    expect(normalizeProducerAcquisitionSource(" ")).toBeNull();
    expect(normalizeProducerAcquisitionSource("x".repeat(200))).toHaveLength(120);
  });

  test("prefers navigation state and supports query fallbacks", () => {
    expect(resolveProducerAcquisitionSource({
      state: { acquisitionSource: "producer-landing-hero" },
      search: "?from=legacy",
    })).toBe("producer-landing-hero");
    expect(resolveProducerAcquisitionSource({ search: "?acquisitionSource=whatsapp" })).toBe("whatsapp");
    expect(resolveProducerAcquisitionSource({ search: "?from=seo" })).toBe("seo");
  });

  test("builds API-confirmed publication milestone metadata", () => {
    expect(buildPublishedEventActivationMetadata({
      eventId: 42,
      productionId: 7,
      acquisitionSource: "instagram",
    })).toEqual({
      event_id: 42,
      production_id: 7,
      acquisition_source: "instagram",
      activation_stage: "event_published",
      next_step: "create_ticket",
    });
  });

  test("keeps attribution in ticket creation handoff", () => {
    expect(buildTicketCreationHandoff({ eventId: 42, acquisitionSource: "whatsapp" })).toEqual({
      pathname: "/ticket/create",
      search: "?eventId=42&acquisitionSource=whatsapp",
      state: { acquisitionSource: "whatsapp" },
    });
    expect(buildTicketCreationHandoff({ eventId: 0, acquisitionSource: "whatsapp" })).toBeNull();
  });
});
