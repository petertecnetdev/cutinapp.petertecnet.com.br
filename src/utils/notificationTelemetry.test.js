import { notificationTelemetryAttrs } from "./notificationTelemetry";

describe("notificationTelemetryAttrs", () => {
  it("returns no telemetry attributes without a notification id", () => {
    expect(notificationTelemetryAttrs(null)).toEqual({});
    expect(notificationTelemetryAttrs({ title: "Sem id" })).toEqual({});
  });

  it("normalizes notification metadata for the telemetry SDK", () => {
    const attrs = notificationTelemetryAttrs({
      id: 42,
      title: "Ingresso emitido",
      type: "ticket_issued",
      reference_type: "event",
      reference_id: 9,
      reference_url: "/event/9",
      created_at: "2026-09-05T01:00:00Z",
      read_at: null,
    }, "notifications_page");

    expect(attrs).toEqual({
      "data-peter-notification-id": "42",
      "data-peter-notification-title": "Ingresso emitido",
      "data-peter-notification-type": "ticket_issued",
      "data-peter-notification-reference-type": "event",
      "data-peter-notification-reference-id": 9,
      "data-peter-notification-reference-url": "/event/9",
      "data-peter-notification-created-at": "2026-09-05T01:00:00Z",
      "data-peter-notification-read-at": "",
      "data-peter-notification-surface": "notifications_page",
    });
  });

  it("applies safe defaults for optional metadata", () => {
    expect(notificationTelemetryAttrs({ id: "abc" })).toMatchObject({
      "data-peter-notification-id": "abc",
      "data-peter-notification-title": "Nova notificação",
      "data-peter-notification-type": "",
      "data-peter-notification-surface": "notification_center",
    });
  });
});
