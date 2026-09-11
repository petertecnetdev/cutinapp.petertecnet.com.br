const loadTelemetry = async () => {
  jest.resetModules();
  return import("./telemetry");
};

describe("checkout recovery attribution", () => {
  let rawTrack;

  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState({}, "", "/feed");
    rawTrack = jest.fn();
    window.PeterTecnetTelemetry = { track: rawTrack };
  });

  afterEach(() => {
    delete window.PeterTecnetTelemetry;
  });

  test("attributes a resumed checkout through fulfillment and clears it afterwards", async () => {
    const { trackTelemetry } = await loadTelemetry();

    trackTelemetry("checkout_resume_prompt_clicked", {
      event_id: 42,
      target: "evento-teste",
      source: "session+recovery",
      surface: "feed",
      has_pending_order: true,
    });

    window.history.replaceState({}, "", "/checkout/evento-teste");
    trackTelemetry("payment_approved", { metadata: { payment_method: "pix" } });

    const approvedCall = rawTrack.mock.calls.find(([type]) => type === "payment_approved");
    expect(approvedCall[1].metadata).toEqual(expect.objectContaining({
      attribution_source: "checkout_recovery",
      attribution_event_id: 42,
      attribution_event_slug: "evento-teste",
      attribution_recovery_surface: "feed",
      attribution_recovery_source: "session+recovery",
      attribution_recovery_has_pending_order: true,
    }));

    trackTelemetry("checkout_fulfilled", {});
    window.history.replaceState({}, "", "/event/evento-teste");
    trackTelemetry("payment_approved", {});

    const approvedCalls = rawTrack.mock.calls.filter(([type]) => type === "payment_approved");
    expect(approvedCalls[1][1].metadata).toBeUndefined();
  });

  test("keeps one anonymous journey id across checkout funnel events", async () => {
    const { trackTelemetry } = await loadTelemetry();
    window.history.replaceState({}, "", "/checkout/evento-teste");

    trackTelemetry("checkout_opened", { target: "evento-teste", metadata: { event_id: 42 } });
    trackTelemetry("checkout_mobile_payment_cta_clicked", { target: "evento-teste", metadata: { payment_method: "pix" } });
    trackTelemetry("payment_attempted", { target: "evento-teste", metadata: { payment_method: "pix" } });

    const funnelCalls = rawTrack.mock.calls.filter(([type]) => [
      "checkout_opened",
      "checkout_mobile_payment_cta_clicked",
      "payment_attempted",
    ].includes(type));
    const journeyIds = funnelCalls.map(([, details]) => details.metadata.checkout_journey_id);

    expect(funnelCalls).toHaveLength(3);
    expect(journeyIds[0]).toBeTruthy();
    expect(new Set(journeyIds).size).toBe(1);
    expect(funnelCalls[0][1].metadata.checkout_journey_started_at).toEqual(expect.any(Number));
  });

  test("starts a new journey when checkout switches to another event", async () => {
    const { trackTelemetry } = await loadTelemetry();
    window.history.replaceState({}, "", "/checkout/evento-a");
    trackTelemetry("checkout_opened", { target: "evento-a" });
    const firstId = rawTrack.mock.calls.at(-1)[1].metadata.checkout_journey_id;

    window.history.replaceState({}, "", "/checkout/evento-b");
    trackTelemetry("checkout_opened", { target: "evento-b" });
    const secondId = rawTrack.mock.calls.at(-1)[1].metadata.checkout_journey_id;

    expect(firstId).toBeTruthy();
    expect(secondId).toBeTruthy();
    expect(secondId).not.toBe(firstId);
  });

  test("clears a completed journey before the next purchase", async () => {
    const { trackTelemetry } = await loadTelemetry();
    window.history.replaceState({}, "", "/checkout/evento-teste");
    trackTelemetry("checkout_opened", { target: "evento-teste" });
    const firstId = rawTrack.mock.calls.at(-1)[1].metadata.checkout_journey_id;

    trackTelemetry("checkout_fulfilled", { target: "evento-teste", metadata: { outcome: "success" } });
    expect(window.sessionStorage.getItem("cutinapp_checkout_journey")).toBeNull();

    trackTelemetry("checkout_opened", { target: "evento-teste" });
    const nextId = rawTrack.mock.calls.at(-1)[1].metadata.checkout_journey_id;
    expect(nextId).toBeTruthy();
    expect(nextId).not.toBe(firstId);
  });
});
