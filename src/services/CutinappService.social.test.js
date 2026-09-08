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


describe("CutinappService remaining social state mutations", () => {
  beforeEach(() => { jest.clearAllMocks(); sessionStorage.clear(); });
  test("normalizes and protects unfollow retries", async () => {
    appApiClient.delete.mockRejectedValueOnce({ code: "ERR_NETWORK" }).mockResolvedValueOnce({ data: { following: false } });
    await expect(cutinappService.unfollow(" Artist ", 42)).rejects.toMatchObject({ code: "ERR_NETWORK" });
    const firstKey = appApiClient.delete.mock.calls[0][1].headers["Idempotency-Key"];
    await cutinappService.unfollow("ARTIST", 42);
    expect(appApiClient.delete.mock.calls[1][1].headers["Idempotency-Key"]).toBe(firstKey);
    expect(appApiClient.delete.mock.calls[1][1].data).toEqual({ target_type: "artist", target_id: 42 });
  });
  test("protects rating and moderation state changes", async () => {
    appApiClient.put.mockResolvedValue({ data: { ok: true } });
    await cutinappService.rateEvent("7", "4");
    await cutinappService.rateEvent(7, 5);
    expect(appApiClient.put.mock.calls[0][1]).toEqual({ rating: 4 });
    expect(appApiClient.put.mock.calls[0][2].headers["Idempotency-Key"]).not.toBe(appApiClient.put.mock.calls[1][2].headers["Idempotency-Key"]);
    await cutinappService.updateModerationReport("9", { status: "resolved" });
    expect(appApiClient.put.mock.calls[2]).toEqual(["/moderation/reports/9", { status: "resolved" }, { headers: { "Idempotency-Key": expect.any(String) } }]);
  });
  test("coalesces equivalent preference changes", async () => {
    let resolvePreference;
    appApiClient.put.mockImplementationOnce(() => new Promise((resolve) => { resolvePreference = resolve; }));
    const first = cutinappService.savePreferences({ city: "São Paulo", categories: ["show"] });
    const second = cutinappService.savePreferences({ categories: ["show"], city: "São Paulo" });
    expect(first).toBe(second);
    expect(appApiClient.put).toHaveBeenCalledTimes(1);
    resolvePreference({ data: { ok: true } });
    await first;
  });
  test("protects engagement and notification reads", async () => {
    appApiClient.put.mockResolvedValue({ data: { ok: true } });
    appApiClient.patch.mockResolvedValue({ data: { ok: true } });
    await cutinappService.engagement("12", { interested: true });
    await cutinappService.markNotificationRead("15");
    await cutinappService.markAllNotificationsRead();
    expect(appApiClient.put.mock.calls[0][2].headers["Idempotency-Key"]).toEqual(expect.any(String));
    expect(appApiClient.patch.mock.calls[0]).toEqual(["/notifications/15/read", undefined, { headers: { "Idempotency-Key": expect.any(String) } }]);
    expect(appApiClient.patch.mock.calls[1]).toEqual(["/notifications/read-all", undefined, { headers: { "Idempotency-Key": expect.any(String) } }]);
  });
});
