import appApiClient from "./AppApiClient";
import cutinappService from "./CutinappService";

jest.mock("./AppApiClient", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

const keyAt = (index) => appApiClient.post.mock.calls[index]?.[2]?.headers?.["Idempotency-Key"];

describe("CutinappService social mutation idempotency", () => {
  beforeEach(() => { jest.clearAllMocks(); sessionStorage.clear(); });

  test("protects and normalizes follows", async () => {
    appApiClient.post.mockResolvedValueOnce({ data: { following: true } });
    await cutinappService.follow(" Artist ", 42);
    expect(appApiClient.post).toHaveBeenCalledWith("/social/follow", { target_type: "artist", target_id: 42 }, { headers: { "Idempotency-Key": expect.any(String) } });
  });

  test("reuses the follow key after an uncertain failure and refreshes after 422", async () => {
    appApiClient.post.mockRejectedValueOnce({ code: "ERR_NETWORK" }).mockResolvedValueOnce({ data: { following: true } });
    await expect(cutinappService.follow("production", 9)).rejects.toMatchObject({ code: "ERR_NETWORK" });
    const retryKey = keyAt(0);
    await cutinappService.follow(" PRODUCTION ", 9);
    expect(keyAt(1)).toBe(retryKey);

    jest.clearAllMocks();
    appApiClient.post.mockRejectedValueOnce({ response: { status: 422 } }).mockResolvedValueOnce({ data: { following: true } });
    await expect(cutinappService.follow("artist", 42)).rejects.toMatchObject({ response: { status: 422 } });
    const rejectedKey = keyAt(0);
    await cutinappService.follow("artist", 42);
    expect(keyAt(1)).not.toBe(rejectedKey);
  });

  test("deduplicates concurrent equivalent follows", async () => {
    let resolveFollow;
    appApiClient.post.mockImplementationOnce(() => new Promise((resolve) => { resolveFollow = resolve; }));
    const first = cutinappService.follow("artist", 42);
    const second = cutinappService.follow(" ARTIST ", 42);
    expect(first).toBe(second);
    expect(appApiClient.post).toHaveBeenCalledTimes(1);
    resolveFollow({ data: { following: true } });
    await first;
  });

  test("protects likes and reuses the key after a 503", async () => {
    appApiClient.post.mockResolvedValueOnce({ data: { liked: true } });
    await cutinappService.likeProductionPost("17");
    expect(appApiClient.post).toHaveBeenCalledWith("/organization-community/17/like", undefined, { headers: { "Idempotency-Key": expect.any(String) } });

    jest.clearAllMocks();
    appApiClient.post.mockRejectedValueOnce({ response: { status: 503 } }).mockResolvedValueOnce({ data: { liked: true } });
    await expect(cutinappService.likeEventPost(23)).rejects.toMatchObject({ response: { status: 503 } });
    const retryKey = keyAt(0);
    await cutinappService.likeEventPost("23");
    expect(keyAt(1)).toBe(retryKey);
  });

  test("deduplicates concurrent likes for the same post", async () => {
    let resolveLike;
    appApiClient.post.mockImplementationOnce(() => new Promise((resolve) => { resolveLike = resolve; }));
    const first = cutinappService.likeProductionPost(17);
    const second = cutinappService.likeProductionPost("17");
    expect(first).toBe(second);
    expect(appApiClient.post).toHaveBeenCalledTimes(1);
    resolveLike({ data: { liked: true } });
    await first;
  });
});
