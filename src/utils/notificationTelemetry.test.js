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

  it("attributes checkout recovery clicks from the navbar popover without blocking navigation", () => {
    const track = jest.fn();
    const previousTelemetry = window.PeterTecnetTelemetry;
    window.PeterTecnetTelemetry = { track };

    const attrs = notificationTelemetryAttrs({
      id: 77,
      type: "checkout_recovery",
      reference_id: "order-public-123",
      reference_url: "/purchases/order-public-123?recovery_source=in_app",
      metadata: {
        recovery_action: "resume_pix",
        recovery_cta_label: "Retomar pagamento PIX",
        recovery_experiment: "pix_recovery_timing_v1",
        recovery_timing_minutes: 15,
      },
    }, "navbar_popover");

    expect(typeof attrs.onClickCapture).toBe("function");
    expect(() => attrs.onClickCapture()).not.toThrow();
    expect(track).toHaveBeenCalledWith("checkout_recovery_notification_cta_clicked", {
      label: "Retomar pagamento PIX",
      target: "navbar_popover",
      metadata: {
        order_public_id: "order-public-123",
        recovery_source: "in_app",
        recovery_entrypoint: "navbar_popover",
        recovery_action: "resume_pix",
        recovery_experiment: "pix_recovery_timing_v1",
        recovery_timing_minutes: 15,
      },
    });

    window.PeterTecnetTelemetry = previousTelemetry;
  });

  it("records a recovery CTA impression only after the navbar item is actually visible", () => {
    const track = jest.fn();
    const observe = jest.fn();
    const disconnect = jest.fn();
    let observerCallback;
    const previousTelemetry = window.PeterTecnetTelemetry;
    const previousObserver = window.IntersectionObserver;

    window.PeterTecnetTelemetry = { track };
    window.IntersectionObserver = jest.fn((callback) => {
      observerCallback = callback;
      return { observe, disconnect };
    });

    const attrs = notificationTelemetryAttrs({
      id: 88,
      type: "checkout_recovery",
      reference_id: "order-public-456",
      metadata: {
        recovery_action: "resume_pix",
        recovery_cta_label: "Retomar pagamento PIX",
        recovery_experiment: "pix_recovery_timing_v1",
        recovery_timing_minutes: 30,
      },
    }, "navbar_popover");

    const node = document.createElement("button");
    expect(typeof attrs.ref).toBe("function");
    attrs.ref(node);
    expect(observe).toHaveBeenCalledWith(node);
    expect(track).not.toHaveBeenCalled();

    observerCallback([{ isIntersecting: true, intersectionRatio: 0.75 }]);
    observerCallback([{ isIntersecting: true, intersectionRatio: 1 }]);

    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("checkout_recovery_notification_cta_viewed", {
      label: "Retomar pagamento PIX",
      target: "navbar_popover",
      metadata: {
        order_public_id: "order-public-456",
        recovery_source: "in_app",
        recovery_entrypoint: "navbar_popover",
        recovery_action: "resume_pix",
        recovery_experiment: "pix_recovery_timing_v1",
        recovery_timing_minutes: 30,
      },
    });
    expect(disconnect).toHaveBeenCalled();

    window.PeterTecnetTelemetry = previousTelemetry;
    window.IntersectionObserver = previousObserver;
  });
});
