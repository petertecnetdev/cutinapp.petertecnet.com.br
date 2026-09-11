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

describe("EventService agenda lifecycle idempotency", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  test("protects production agenda status changes and retries uncertain failures with the same key", async () => {
    appApiClient.patch
      .mockRejectedValueOnce({ response: { status: 503 } })
      .mockResolvedValueOnce({ data: { is_active: true } });

    await expect(eventService.setAgendaStatus(42, true)).rejects.toMatchObject({ response: { status: 503 } });
    const firstKey = appApiClient.patch.mock.calls[0]?.[2]?.headers?.["Idempotency-Key"];

    await expect(eventService.setAgendaStatus(42, true)).resolves.toMatchObject({ is_active: true });

    expect(appApiClient.patch).toHaveBeenNthCalledWith(
      1,
      "/event-agenda/productions/42/status",
      { is_active: true },
      { headers: { "Idempotency-Key": expect.any(String) } }
    );
    expect(appApiClient.patch.mock.calls[1]?.[2]?.headers?.["Idempotency-Key"]).toBe(firstKey);
  });

  test("updates weekly agenda generation horizon idempotently", async () => {
    appApiClient.patch.mockResolvedValueOnce({
      data: {
        agenda: { generation_weeks: 2, max_future_occurrences: 14 },
        generation: { created_count: 7 },
      },
    });

    await expect(eventService.setAgendaSettings(42, 2)).resolves.toMatchObject({
      agenda: { generation_weeks: 2, max_future_occurrences: 14 },
    });

    expect(appApiClient.patch).toHaveBeenCalledWith(
      "/event-agenda/productions/42/settings",
      { generation_weeks: 2 },
      { headers: { "Idempotency-Key": expect.any(String) } }
    );
  });

  test("keeps weekday event and recurrence strategy in the agenda request", async () => {
    appApiClient.post.mockResolvedValueOnce({
      data: {
        schedule: {
          source_event_id: 91,
          day_of_week: 5,
          generation_mode: "delayed",
          generation_delay_days: 3,
          generation_weeks: 6,
        },
      },
    });

    const payload = {
      event_id: 91,
      day_of_week: 5,
      generation_mode: "delayed",
      generation_delay_days: 3,
      generation_weeks: 6,
      is_active: true,
    };

    await eventService.createAgendaItem(42, payload);

    expect(appApiClient.post).toHaveBeenCalledWith(
      "/event-agenda/productions/42/items",
      payload,
      { headers: { "Idempotency-Key": expect.any(String) } }
    );
  });

  test("rotates item status key after a definitive validation error", async () => {
    appApiClient.patch
      .mockRejectedValueOnce({ response: { status: 422 } })
      .mockResolvedValueOnce({ data: { is_active: false } });

    await expect(eventService.setAgendaItemStatus(61, false)).rejects.toMatchObject({ response: { status: 422 } });
    const rejectedKey = appApiClient.patch.mock.calls[0]?.[2]?.headers?.["Idempotency-Key"];

    await eventService.setAgendaItemStatus(61, false);

    expect(appApiClient.patch.mock.calls[1]?.[2]?.headers?.["Idempotency-Key"]).not.toBe(rejectedKey);
  });

  test("deduplicates concurrent equivalent agenda status changes", async () => {
    let resolveRequest;
    appApiClient.patch.mockReturnValueOnce(new Promise((resolve) => { resolveRequest = resolve; }));

    const first = eventService.setAgendaStatus(43, false);
    const second = eventService.setAgendaStatus(43, false);

    expect(second).toBe(first);
    expect(appApiClient.patch).toHaveBeenCalledTimes(1);

    resolveRequest({ data: { is_active: false } });
    await expect(first).resolves.toMatchObject({ is_active: false });
  });

  test("protects agenda deletion and reuses the key after an uncertain failure", async () => {
    appApiClient.delete
      .mockRejectedValueOnce({ code: "ERR_NETWORK", message: "Network Error" })
      .mockResolvedValueOnce({ data: { deleted: true } });

    await expect(eventService.deleteAgendaItem(71)).rejects.toMatchObject({ code: "ERR_NETWORK" });
    const firstKey = appApiClient.delete.mock.calls[0]?.[1]?.headers?.["Idempotency-Key"];

    await expect(eventService.deleteAgendaItem(71)).resolves.toMatchObject({ deleted: true });

    expect(appApiClient.delete).toHaveBeenNthCalledWith(
      1,
      "/event-agenda/items/71",
      { headers: { "Idempotency-Key": expect.any(String) } }
    );
    expect(appApiClient.delete.mock.calls[1]?.[1]?.headers?.["Idempotency-Key"]).toBe(firstKey);
  });

  test("keeps lifecycle attempts isolated by resource and desired state", async () => {
    appApiClient.patch
      .mockResolvedValueOnce({ data: { is_active: true } })
      .mockResolvedValueOnce({ data: { is_active: false } })
      .mockResolvedValueOnce({ data: { is_active: true } });

    await Promise.all([
      eventService.setAgendaStatus(44, true),
      eventService.setAgendaStatus(44, false),
      eventService.setAgendaStatus(45, true),
    ]);

    const keys = appApiClient.patch.mock.calls.map((call) => call?.[2]?.headers?.["Idempotency-Key"]);
    expect(new Set(keys).size).toBe(3);
  });
});
