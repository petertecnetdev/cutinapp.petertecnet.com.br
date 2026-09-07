import { producerActivationNextStep } from "./producerActivationProgress";

describe("producerActivationNextStep", () => {
  test("starts with production when the producer has none", () => {
    expect(producerActivationNextStep({ productions: [], events: [] })).toMatchObject({
      stage: "production",
      route: "/production/create",
    });
  });

  test("reuses the only production when the first event is missing", () => {
    expect(producerActivationNextStep({ productions: [{ id: 9 }], events: [] })).toMatchObject({
      stage: "event",
      route: "/event/create?productionId=9",
    });
  });

  test("routes an event without tickets directly to first lot creation", () => {
    expect(producerActivationNextStep({
      productions: [{ id: 9 }],
      events: [{ id: 21, title: "Noite", tickets_count: 0, start_date: "2026-09-20T20:00:00" }],
    })).toMatchObject({
      stage: "ticket",
      route: "/ticket/create?eventId=21",
      eventId: 21,
    });
  });

  test("routes an event with tickets but unpublished directly to publication", () => {
    expect(producerActivationNextStep({
      productions: [{ id: 9 }],
      events: [{ id: 22, title: "Festival", tickets_count: 2, is_published: false, start_date: "2026-09-21T20:00:00" }],
    })).toMatchObject({
      stage: "publish",
      route: "/event/edit/22?activation=first-ticket&eventId=22",
      eventId: 22,
    });
  });

  test("does not let cancelled events block activation", () => {
    expect(producerActivationNextStep({
      productions: [{ id: 9 }],
      events: [{ id: 22, tickets_count: 0, is_cancelled: true }],
    })).toMatchObject({ stage: "event" });
  });

  test("falls back to event management after publication", () => {
    expect(producerActivationNextStep({
      productions: [{ id: 9 }],
      events: [{ id: 22, tickets_count: 2, is_published: true }],
    })).toMatchObject({ stage: "selling", route: "/event/manage" });
  });
});
