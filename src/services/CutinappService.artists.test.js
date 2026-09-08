import appApiClient from "./AppApiClient";
import cutinappService from "./CutinappService";

jest.mock("./AppApiClient", () => ({
  __esModule: true,
  default: {
    get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn(),
  },
}));

const idempotencyKeyAt = (callIndex) => appApiClient.post.mock.calls[callIndex]?.[2]?.headers?.["Idempotency-Key"];

describe("CutinappService artist mutation idempotency", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  test("protects provisional artist creation with an idempotency key", async () => {
    appApiClient.post.mockResolvedValueOnce({ data: { artist: { id: 11 } } });
    await expect(cutinappService.createArtist({ stage_name: "Neon Pulse", artist_type: "dj" })).resolves.toEqual({ artist: { id: 11 } });
    expect(appApiClient.post).toHaveBeenCalledWith(
      "/artists/provisional",
      { stage_name: "Neon Pulse", artist_type: "dj" },
      { headers: { "Idempotency-Key": expect.any(String) } },
    );
  });

  test("reuses the same artist-create key after an uncertain failure", async () => {
    appApiClient.post.mockRejectedValueOnce({ code: "ERR_NETWORK", message: "Network Error" }).mockResolvedValueOnce({ data: { artist: { id: 12 } } });
    await expect(cutinappService.createArtist({ stage_name: "Neon Pulse", artist_type: "dj" })).rejects.toMatchObject({ code: "ERR_NETWORK" });
    const firstKey = idempotencyKeyAt(0);
    await cutinappService.createArtist({ artist_type: "dj", stage_name: "Neon Pulse" });
    expect(idempotencyKeyAt(1)).toBe(firstKey);
  });

  test("uses a fresh member-create key after a definitive validation failure", async () => {
    appApiClient.post.mockRejectedValueOnce({ response: { status: 422 } }).mockResolvedValueOnce({ data: { member: { id: 23 } } });
    const payload = { name: "Alice" };
    await expect(cutinappService.createArtistMember(9, payload)).rejects.toMatchObject({ response: { status: 422 } });
    const rejectedKey = idempotencyKeyAt(0);
    await cutinappService.createArtistMember(9, payload);
    expect(idempotencyKeyAt(1)).toBeTruthy();
    expect(idempotencyKeyAt(1)).not.toBe(rejectedKey);
  });

  test("deduplicates concurrent equivalent artist claims", async () => {
    let resolveClaim;
    appApiClient.post.mockImplementationOnce(() => new Promise((resolve) => { resolveClaim = resolve; }));
    const first = cutinappService.claimArtistEvent(50, 18, { message: "Sou eu" });
    const second = cutinappService.claimArtistEvent("50", "18", { message: "Sou eu" });
    expect(first).toBe(second);
    expect(appApiClient.post).toHaveBeenCalledTimes(1);
    resolveClaim({ data: { claim: { id: 31 } } });
    await expect(first).resolves.toEqual({ claim: { id: 31 } });
  });

  test("keeps event-artist attachments isolated by event", async () => {
    appApiClient.post.mockResolvedValueOnce({ data: { artist: { id: 41 } } }).mockResolvedValueOnce({ data: { artist: { id: 41 } } });
    await cutinappService.attachArtist(70, { artist_id: 41, role: "headliner" });
    await cutinappService.attachArtist(71, { artist_id: 41, role: "headliner" });
    expect(idempotencyKeyAt(0)).toBeTruthy();
    expect(idempotencyKeyAt(1)).toBeTruthy();
    expect(idempotencyKeyAt(1)).not.toBe(idempotencyKeyAt(0));
    expect(appApiClient.post.mock.calls[0][0]).toBe("/events/70/artists");
    expect(appApiClient.post.mock.calls[1][0]).toBe("/events/71/artists");
  });
});