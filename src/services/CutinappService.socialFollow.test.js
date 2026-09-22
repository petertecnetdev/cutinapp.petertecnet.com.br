import appApiClient from "./AppApiClient";
import cutinappService from "./CutinappService";
import { invalidatePublicRequestCache } from "../utils/publicRequestCache";

jest.mock("./AppApiClient", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock("../utils/searchAttribution", () => ({
  trackSearchConversion: jest.fn(() => Promise.resolve()),
}));

describe("CutinappService social follow cache coherence", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    invalidatePublicRequestCache();
    window.sessionStorage.clear();
  });

  test("refreshes a cached public production after following it", async () => {
    appApiClient.get
      .mockResolvedValueOnce({ data: { organization: { id: 7, is_following: false, followers_count: 4 } } })
      .mockResolvedValueOnce({ data: { organization: { id: 7, is_following: true, followers_count: 5 } } });
    appApiClient.post.mockResolvedValueOnce({ data: { following: true } });

    const before = await cutinappService.publicProduction("luxury-club");
    const cached = await cutinappService.publicProduction("luxury-club");

    expect(appApiClient.get).toHaveBeenCalledTimes(1);
    expect(before.production.is_following).toBe(false);
    expect(cached.production.is_following).toBe(false);

    await cutinappService.follow("production", 7);
    const after = await cutinappService.publicProduction("luxury-club");

    expect(appApiClient.post).toHaveBeenCalledWith(
      "/social/follow",
      { target_type: "production", target_id: 7 },
      { headers: { "Idempotency-Key": expect.any(String) } },
    );
    expect(appApiClient.get).toHaveBeenCalledTimes(2);
    expect(after.production.is_following).toBe(true);
    expect(after.production.followers_count).toBe(5);
  });

  test("refreshes a cached public production after unfollowing it", async () => {
    appApiClient.get
      .mockResolvedValueOnce({ data: { organization: { id: 7, is_following: true, followers_count: 5 } } })
      .mockResolvedValueOnce({ data: { organization: { id: 7, is_following: false, followers_count: 4 } } });
    appApiClient.delete.mockResolvedValueOnce({ data: { following: false } });

    await cutinappService.publicProduction("luxury-club");
    await cutinappService.unfollow("production", 7);
    const after = await cutinappService.publicProduction("luxury-club");

    expect(appApiClient.delete).toHaveBeenCalledWith(
      "/social/follow",
      {
        data: { target_type: "production", target_id: 7 },
        headers: { "Idempotency-Key": expect.any(String) },
      },
    );
    expect(appApiClient.get).toHaveBeenCalledTimes(2);
    expect(after.production.is_following).toBe(false);
    expect(after.production.followers_count).toBe(4);
  });
});
