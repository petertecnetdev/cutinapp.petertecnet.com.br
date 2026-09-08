import appApiClient from "./AppApiClient";
import cutinappService from "./CutinappService";

jest.mock("./AppApiClient", () => ({
  __esModule: true,
  default: {
    get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn(),
  },
}));

const idempotencyKeyAt = (callIndex) => appApiClient.post.mock.calls[callIndex]?.[2]?.headers?.["Idempotency-Key"];

describe("CutinappService event publishing idempotency", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  test("publishes with an idempotency key", async () => {
    appApiClient.post.mockResolvedValueOnce({ data: { event: { id: 42, status: "published" } } });

    await expect(cutinappService.publishEvent("42")).resolves.toEqual({ event: { id: 42, status: "published" } });
    expect(appApiClient.post).toHaveBeenCalledWith(
      "/events/42/publish",
      undefined,
      { headers: { "Idempotency-Key": expect.any(String) } },
    );
  });

  test("reuses the publish key after an uncertain network failure", async () => {
    appApiClient.post
      .mockRejectedValueOnce({ code: "ERR_NETWORK", message: "Network Error" })
      .mockResolvedValueOnce({ data: { event: { id: 42, status: "published" } } });

    await expect(cutinappService.publishEvent(42)).rejects.toMatchObject({ code: "ERR_NETWORK" });
    const firstKey = idempotencyKeyAt(0);
    await cutinappService.publishEvent("42");

    expect(idempotencyKeyAt(1)).toBe(firstKey);
  });

  test("uses a fresh unpublish key after a definitive validation failure", async () => {
    appApiClient.post
      .mockRejectedValueOnce({ response: { status: 422 } })
      .mockResolvedValueOnce({ data: { event: { id: 42, status: "draft" } } });

    await expect(cutinappService.unpublishEvent(42)).rejects.toMatchObject({ response: { status: 422 } });
    const rejectedKey = idempotencyKeyAt(0);
    await cutinappService.unpublishEvent(42);

    expect(idempotencyKeyAt(1)).toBeTruthy();
    expect(idempotencyKeyAt(1)).not.toBe(rejectedKey);
  });

  test("deduplicates concurrent equivalent publish requests", async () => {
    let resolvePublish;
    appApiClient.post.mockImplementationOnce(() => new Promise((resolve) => { resolvePublish = resolve; }));

    const first = cutinappService.publishEvent(77);
    const second = cutinappService.publishEvent("77");

    expect(first).toBe(second);
    expect(appApiClient.post).toHaveBeenCalledTimes(1);
    resolvePublish({ data: { event: { id: 77, status: "published" } } });
    await expect(first).resolves.toEqual({ event: { id: 77, status: "published" } });
  });

  test("keeps publish and unpublish attempts isolated", async () => {
    appApiClient.post
      .mockResolvedValueOnce({ data: { event: { id: 9, status: "published" } } })
      .mockResolvedValueOnce({ data: { event: { id: 9, status: "draft" } } });

    await cutinappService.publishEvent(9);
    await cutinappService.unpublishEvent(9);

    expect(idempotencyKeyAt(0)).toBeTruthy();
    expect(idempotencyKeyAt(1)).toBeTruthy();
    expect(idempotencyKeyAt(1)).not.toBe(idempotencyKeyAt(0));
    expect(appApiClient.post.mock.calls[0][0]).toBe("/events/9/publish");
    expect(appApiClient.post.mock.calls[1][0]).toBe("/events/9/unpublish");
  });
});
