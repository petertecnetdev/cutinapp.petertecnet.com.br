const loadTelemetry = async () => {
  jest.resetModules();
  return import("./telemetry");
};

describe("checkout recovery attribution", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState({}, "", "/feed");
    window.PeterTecnetTelemetry = { track: jest.fn() };
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

    const approvedCall = window.PeterTecnetTelemetry.track.mock.calls.find(([type]) => type === "payment_approved");
    expect(approvedCall[1].metadata).toEqual(expect.objectContaining({
      attribution_source: "checkout_recovery",
      attribution_event_id: 42,
      attribution_event_slug: "evento-teste",
      attribution_recovery_surface: "feed",
      attribution_recovery_source: "session+recovery",
      attribution_recovery_has_pending_order: true,
    }));

    trackTelemetry("checkout_fulfilled", {});
    trackTelemetry("payment_approved", {});

    const approvedCalls = window.PeterTecnetTelemetry.track.mock.calls.filter(([type]) => type === "payment_approved");
    expect(approvedCalls[1][1].metadata).toBeUndefined();
  });
});
