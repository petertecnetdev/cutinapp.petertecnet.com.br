import appApiClient from "./AppApiClient";
import eventService from "./EventService";

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

const eventPayload = (name = "Cutinapp Festival") => {
  const payload = new FormData();
  payload.append("name", name);
  payload.append("organization_id", "10");
  payload.append("start_date", "2026-10-10");
  return payload;
};

const idempotencyKeyAt = (callIndex) => (
  appApiClient.post.mock.calls[callIndex]?.[2]?.headers?.["Idempotency-Key"]
);

describe("EventService event creation idempotency", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  test("sends an idempotency key when creating an event", async () => {
    appApiClient.post.mockResolvedValueOnce({ data: { event: { id: 21, name: "Cutinapp Festival" } } });

    const result = await eventService.store(eventPayload());

    expect(appApiClient.post).toHaveBeenCalledWith(
      "/events",
      expect.any(FormData),
      { headers: { "Idempotency-Key": expect.any(String) } }
    );
    expect(idempotencyKeyAt(0)).toBeTruthy();
    expect(result.event).toEqual({ id: 21, name: "Cutinapp Festival" });
  });

  test("reuses the same key after an uncertain network failure", async () => {
    appApiClient.post
      .mockRejectedValueOnce({ code: "ERR_NETWORK", message: "Network Error" })
      .mockResolvedValueOnce({ data: { event: { id: 22 } } });

    await expect(eventService.store(eventPayload())).rejects.toMatchObject({ code: "ERR_NETWORK" });
    const firstKey = idempotencyKeyAt(0);

    await expect(eventService.store(eventPayload())).resolves.toMatchObject({ event: { id: 22 } });

    expect(idempotencyKeyAt(1)).toBe(firstKey);
  });

  test("uses a fresh key after a definitive validation failure", async () => {
    appApiClient.post
      .mockRejectedValueOnce({ response: { status: 422 } })
      .mockResolvedValueOnce({ data: { event: { id: 23 } } });

    await expect(eventService.store(eventPayload())).rejects.toMatchObject({ response: { status: 422 } });
    const rejectedKey = idempotencyKeyAt(0);

    await eventService.store(eventPayload());

    expect(idempotencyKeyAt(1)).toBeTruthy();
    expect(idempotencyKeyAt(1)).not.toBe(rejectedKey);
  });

  test("deduplicates concurrent submits with equivalent FormData", async () => {
    let resolveRequest;
    const pendingResponse = new Promise((resolve) => {
      resolveRequest = resolve;
    });
    appApiClient.post.mockReturnValueOnce(pendingResponse);

    const first = eventService.store(eventPayload());
    const second = eventService.store(eventPayload());

    expect(appApiClient.post).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);

    resolveRequest({ data: { event: { id: 24 } } });

    await expect(first).resolves.toMatchObject({ event: { id: 24 } });
  });
});
