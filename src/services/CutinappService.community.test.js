import appApiClient from "./AppApiClient";
import cutinappService from "./CutinappService";

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

const idempotencyKeyAt = (callIndex) => (
  appApiClient.post.mock.calls[callIndex]?.[2]?.headers?.["Idempotency-Key"]
);

describe("CutinappService community post idempotency", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  test("protects production community posts with an idempotency key", async () => {
    appApiClient.post.mockResolvedValueOnce({ data: { post: { id: 101 } } });
    await expect(cutinappService.createProductionPost("12", { body: "Novidade" })).resolves.toEqual({ post: { id: 101 } });
    expect(appApiClient.post).toHaveBeenCalledWith(
      "/organizations/12/community",
      { body: "Novidade" },
      { headers: { "Idempotency-Key": expect.any(String) } },
    );
  });

  test("reuses the same production-post key after an uncertain network failure", async () => {
    appApiClient.post
      .mockRejectedValueOnce({ code: "ERR_NETWORK", message: "Network Error" })
      .mockResolvedValueOnce({ data: { post: { id: 102 } } });
    await expect(cutinappService.createProductionPost(12, { body: "Novidade" })).rejects.toMatchObject({ code: "ERR_NETWORK" });
    const firstKey = idempotencyKeyAt(0);
    await expect(cutinappService.createProductionPost("12", { body: "Novidade" })).resolves.toEqual({ post: { id: 102 } });
    expect(idempotencyKeyAt(1)).toBe(firstKey);
  });

  test("uses a fresh key after a definitive community validation failure", async () => {
    appApiClient.post
      .mockRejectedValueOnce({ response: { status: 422 } })
      .mockResolvedValueOnce({ data: { post: { id: 103 } } });
    await expect(cutinappService.createEventPost(77, { body: "Line-up" })).rejects.toMatchObject({ response: { status: 422 } });
    const rejectedKey = idempotencyKeyAt(0);
    await cutinappService.createEventPost(77, { body: "Line-up" });
    expect(idempotencyKeyAt(1)).toBeTruthy();
    expect(idempotencyKeyAt(1)).not.toBe(rejectedKey);
  });

  test("deduplicates equivalent concurrent event posts", async () => {
    let resolvePost;
    appApiClient.post.mockImplementationOnce(() => new Promise((resolve) => { resolvePost = resolve; }));
    const first = cutinappService.createEventPost(77, { body: "Line-up", visibility: "public" });
    const second = cutinappService.createEventPost("77", { visibility: "public", body: "Line-up" });
    expect(first).toBe(second);
    expect(appApiClient.post).toHaveBeenCalledTimes(1);
    resolvePost({ data: { post: { id: 104 } } });
    await expect(first).resolves.toEqual({ post: { id: 104 } });
  });

  test("protects feed posts using the shared event-community mutation", async () => {
    appApiClient.post.mockResolvedValueOnce({ data: { post: { id: 105 } } });
    await cutinappService.createFeedPost({ body: "Feed" });
    expect(appApiClient.post).toHaveBeenCalledWith(
      "/events/0/community",
      { body: "Feed" },
      { headers: { "Idempotency-Key": expect.any(String) } },
    );
  });
});
