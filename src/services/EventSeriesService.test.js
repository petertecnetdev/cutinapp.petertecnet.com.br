import appApiClient from "./AppApiClient";
import eventSeriesService from "./EventSeriesService";

jest.mock("./AppApiClient", () => ({
  __esModule: true,
  default: { post: jest.fn() },
}));

const payload = () => ({
  mode: "weekly",
  start_date: "2026-09-12",
  end_date: "2026-10-31",
  weekdays: [6],
});

const idempotencyKeyAt = (callIndex) => (
  appApiClient.post.mock.calls[callIndex]?.[2]?.headers?.["Idempotency-Key"]
);

describe("EventSeriesService idempotency", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  test("sends an idempotency key for bulk series creation", async () => {
    appApiClient.post.mockResolvedValueOnce({ data: { message: "Agenda criada", created: 8 } });

    await expect(eventSeriesService.create(42, payload())).resolves.toMatchObject({ created: 8 });

    expect(appApiClient.post).toHaveBeenCalledWith(
      "/admin/events/42/series",
      expect.objectContaining({ mode: "weekly" }),
      { headers: { "Idempotency-Key": expect.any(String) } }
    );
  });

  test("reuses the key after an uncertain network failure", async () => {
    appApiClient.post
      .mockRejectedValueOnce({ code: "ERR_NETWORK", message: "Network Error" })
      .mockResolvedValueOnce({ data: { created: 8 } });

    await expect(eventSeriesService.create(42, payload())).rejects.toMatchObject({ code: "ERR_NETWORK" });
    const firstKey = idempotencyKeyAt(0);

    await eventSeriesService.create(42, payload());

    expect(idempotencyKeyAt(1)).toBe(firstKey);
  });

  test("uses a fresh key after a definitive validation error", async () => {
    appApiClient.post
      .mockRejectedValueOnce({ response: { status: 422 } })
      .mockResolvedValueOnce({ data: { created: 8 } });

    await expect(eventSeriesService.create(42, payload())).rejects.toMatchObject({ response: { status: 422 } });
    const rejectedKey = idempotencyKeyAt(0);

    await eventSeriesService.create(42, payload());

    expect(idempotencyKeyAt(1)).not.toBe(rejectedKey);
  });

  test("deduplicates concurrent equivalent series submissions", async () => {
    let resolveRequest;
    const pendingResponse = new Promise((resolve) => { resolveRequest = resolve; });
    appApiClient.post.mockReturnValueOnce(pendingResponse);

    const first = eventSeriesService.create(42, payload());
    const second = eventSeriesService.create(42, payload());

    expect(second).toBe(first);
    expect(appApiClient.post).toHaveBeenCalledTimes(1);

    resolveRequest({ data: { created: 8 } });
    await expect(first).resolves.toMatchObject({ created: 8 });
  });

  test("separates attempts for different source events", async () => {
    appApiClient.post
      .mockResolvedValueOnce({ data: { created: 4 } })
      .mockResolvedValueOnce({ data: { created: 4 } });

    await eventSeriesService.create(42, payload());
    await eventSeriesService.create(43, payload());

    expect(appApiClient.post).toHaveBeenCalledTimes(2);
    expect(idempotencyKeyAt(0)).not.toBe(idempotencyKeyAt(1));
  });
});
