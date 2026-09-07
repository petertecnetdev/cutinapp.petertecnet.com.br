import appApiClient from "./AppApiClient";
import campaignService from "./CampaignService";

jest.mock("./AppApiClient", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn() },
}));

describe("CampaignService", () => {
  beforeEach(() => jest.clearAllMocks());

  test("lists event campaigns from the generic app API", async () => {
    appApiClient.get.mockResolvedValue({ data: { campaigns: { data: [{ uuid: "abc", title: "Vote" }] } } });
    await expect(campaignService.list({ event_id: 42 })).resolves.toEqual([{ uuid: "abc", title: "Vote" }]);
    expect(appApiClient.get).toHaveBeenCalledWith("/campaigns", { params: { event_id: 42 } });
  });

  test("participates idempotently using the campaign endpoint contract", async () => {
    appApiClient.post.mockResolvedValue({ data: { duplicate: false, participation: { id: 1 } } });
    const payload = { option_id: 9, idempotency_key: "participation:campaign:user" };
    await expect(campaignService.participate("campaign-uuid", payload)).resolves.toMatchObject({ duplicate: false });
    expect(appApiClient.post).toHaveBeenCalledWith("/campaigns/campaign-uuid/participate", payload);
  });

  test("publishes and loads financial analytics", async () => {
    appApiClient.post.mockResolvedValue({ data: { campaign: { status: "published" } } });
    appApiClient.get.mockResolvedValue({ data: { metrics: { gmv: 500, platform_revenue: 40 } } });
    await campaignService.publish("campaign-uuid");
    await expect(campaignService.analytics("campaign-uuid")).resolves.toEqual({ gmv: 500, platform_revenue: 40 });
    expect(appApiClient.post).toHaveBeenCalledWith("/campaigns/campaign-uuid/publish");
    expect(appApiClient.get).toHaveBeenCalledWith("/campaigns/campaign-uuid/analytics");
  });
});
