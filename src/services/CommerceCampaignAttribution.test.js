import appApiClient from "./AppApiClient";
import commerceService from "./CommerceService";

jest.mock("./AppApiClient", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

jest.mock("../utils/telemetry", () => ({ trackTelemetry: jest.fn() }));

describe("commerce campaign attribution", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  test("adds campaign attribution and an eligible reward code without trusting monetary values from storage", async () => {
    sessionStorage.setItem("cutinapp_campaign_context_10", JSON.stringify({
      uuid: "5f661311-9bf6-4d49-b7ea-32fb1aaed89a",
      eventId: 10,
      rewardCode: "PROMO-ABC",
      rewardKind: "discount",
      rewardValue: 5,
      capturedAt: Date.now(),
    }));
    appApiClient.post.mockResolvedValue({ data: { order: { public_id: "order-1" } } });

    await commerceService.checkout({
      event_id: 10,
      payment_method: "pix",
      tickets: [{ id: 5, quantity: 1 }],
      items: [],
    });

    expect(appApiClient.post).toHaveBeenCalledWith(
      "/commerce/checkout",
      expect.objectContaining({
        event_id: 10,
        campaign_uuid: "5f661311-9bf6-4d49-b7ea-32fb1aaed89a",
        reward_code: "PROMO-ABC",
      }),
      expect.objectContaining({ headers: expect.objectContaining({ "Idempotency-Key": expect.any(String) }) })
    );
    const sent = appApiClient.post.mock.calls[0][1];
    expect(sent).not.toHaveProperty("gmv");
    expect(sent).not.toHaveProperty("platform_revenue");
    expect(sent).not.toHaveProperty("rewardValue");
  });

  test("never sends a non-discount benefit code into the financial checkout", async () => {
    sessionStorage.setItem("cutinapp_campaign_context_10", JSON.stringify({
      uuid: "5f661311-9bf6-4d49-b7ea-32fb1aaed89a",
      eventId: 10,
      rewardCode: "BENEFIT-ABC",
      rewardKind: "benefit",
      capturedAt: Date.now(),
    }));
    appApiClient.post.mockResolvedValue({ data: { order: { public_id: "order-2" } } });

    await commerceService.checkout({ event_id: 10, payment_method: "pix", tickets: [{ id: 5, quantity: 1 }], items: [] });

    const sent = appApiClient.post.mock.calls[0][1];
    expect(sent.campaign_uuid).toBe("5f661311-9bf6-4d49-b7ea-32fb1aaed89a");
    expect(sent).not.toHaveProperty("reward_code");
  });

  test("drops expired campaign context", async () => {
    sessionStorage.setItem("cutinapp_campaign_context_10", JSON.stringify({
      uuid: "5f661311-9bf6-4d49-b7ea-32fb1aaed89a",
      eventId: 10,
      capturedAt: Date.now() - (25 * 60 * 60 * 1000),
    }));
    appApiClient.post.mockResolvedValue({ data: { order: { public_id: "order-3" } } });

    await commerceService.checkout({ event_id: 10, payment_method: "pix", tickets: [{ id: 5, quantity: 1 }], items: [] });

    expect(appApiClient.post.mock.calls[0][1]).not.toHaveProperty("campaign_uuid");
    expect(sessionStorage.getItem("cutinapp_campaign_context_10")).toBeNull();
  });
});
