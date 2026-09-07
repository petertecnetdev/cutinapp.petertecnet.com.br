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

describe("EventService event update uploads", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("uses multipart POST with PATCH method spoof so event images reach Laravel", async () => {
    appApiClient.post.mockResolvedValueOnce({ data: { event: { id: 77, image: "images/events/cover.webp" } } });
    const payload = new FormData();
    payload.append("title", "Evento atualizado");
    payload.append("image", new File(["fake-image"], "flyer.jpg", { type: "image/jpeg" }));

    const result = await eventService.update(77, payload);

    expect(appApiClient.patch).not.toHaveBeenCalled();
    expect(appApiClient.post).toHaveBeenCalledWith("/events/77", payload);
    expect(payload.get("_method")).toBe("PATCH");
    expect(payload.get("image")).toBeInstanceOf(File);
    expect(result.event.image).toBe("images/events/cover.webp");
  });

  test("keeps normal PATCH for non-multipart updates", async () => {
    appApiClient.patch.mockResolvedValueOnce({ data: { event: { id: 78 } } });

    await eventService.update(78, { title: "Sem arquivo" });

    expect(appApiClient.patch).toHaveBeenCalledWith("/events/78", { title: "Sem arquivo" });
    expect(appApiClient.post).not.toHaveBeenCalled();
  });
});

describe("EventService derived event mutation idempotency", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  test("protects event duplication with an idempotency key", async () => {
    appApiClient.post.mockResolvedValueOnce({ data: { event: { id: 31 } } });

    await expect(eventService.duplicate(12, "2026-11-20")).resolves.toMatchObject({ event: { id: 31 } });

    expect(appApiClient.post).toHaveBeenCalledWith(
      "/events/12/duplicate",
      { date: "2026-11-20" },
      { headers: { "Idempotency-Key": expect.any(String) } }
    );
  });

  test("reuses the duplicate key after an uncertain failure", async () => {
    appApiClient.post
      .mockRejectedValueOnce({ code: "ERR_NETWORK", message: "Network Error" })
      .mockResolvedValueOnce({ data: { event: { id: 32 } } });

    await expect(eventService.duplicate(12, "2026-11-21")).rejects.toMatchObject({ code: "ERR_NETWORK" });
    const firstKey = idempotencyKeyAt(0);

    await expect(eventService.duplicate(12, "2026-11-21")).resolves.toMatchObject({ event: { id: 32 } });
    expect(idempotencyKeyAt(1)).toBe(firstKey);
  });

  test("deduplicates concurrent equivalent series submissions", async () => {
    let resolveRequest;
    const pendingResponse = new Promise((resolve) => {
      resolveRequest = resolve;
    });
    appApiClient.post.mockReturnValueOnce(pendingResponse);
    const payload = { frequency: "weekly", weekdays: [5], until: "2026-12-31" };

    const first = eventService.series(15, payload);
    const second = eventService.series(15, { ...payload });

    expect(appApiClient.post).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);

    resolveRequest({ data: { events: [{ id: 41 }, { id: 42 }] } });
    await expect(first).resolves.toMatchObject({ events: [{ id: 41 }, { id: 42 }] });
  });

  test("keeps series retries stable after server uncertainty", async () => {
    const payload = { frequency: "monthly", until: "2027-02-01" };
    appApiClient.post
      .mockRejectedValueOnce({ response: { status: 503 } })
      .mockResolvedValueOnce({ data: { events: [{ id: 43 }] } });

    await expect(eventService.series(15, payload)).rejects.toMatchObject({ response: { status: 503 } });
    const firstKey = idempotencyKeyAt(0);

    await eventService.series(15, { ...payload });
    expect(idempotencyKeyAt(1)).toBe(firstKey);
  });

  test("rotates the series key after a definitive validation error", async () => {
    const payload = { frequency: "weekly", until: "2026-01-01" };
    appApiClient.post
      .mockRejectedValueOnce({ response: { status: 422 } })
      .mockResolvedValueOnce({ data: { events: [{ id: 44 }] } });

    await expect(eventService.series(16, payload)).rejects.toMatchObject({ response: { status: 422 } });
    const rejectedKey = idempotencyKeyAt(0);

    await eventService.series(16, { ...payload });
    expect(idempotencyKeyAt(1)).not.toBe(rejectedKey);
  });
});

const agendaPayload = () => {
  const data = new FormData();
  data.append("title", "DJ Aurora");
  data.append("starts_at", "2026-10-10T22:00:00");
  data.append("description", "Palco principal");
  return data;
};

describe("EventService agenda creation idempotency", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  test("sends an idempotency key when creating an agenda item", async () => {
    appApiClient.post.mockResolvedValueOnce({ data: { schedule: { id: 51 } } });

    await eventService.createAgendaItem(42, agendaPayload());

    expect(appApiClient.post).toHaveBeenCalledWith(
      "/event-agenda/productions/42/items",
      expect.any(FormData),
      { headers: { "Idempotency-Key": expect.any(String) } }
    );
    expect(idempotencyKeyAt(0)).toBeTruthy();
  });

  test("reuses the agenda key after an uncertain network failure", async () => {
    appApiClient.post
      .mockRejectedValueOnce({ code: "ERR_NETWORK", message: "Network Error" })
      .mockResolvedValueOnce({ data: { schedule: { id: 52 } } });

    await expect(eventService.createAgendaItem(42, agendaPayload())).rejects.toMatchObject({ code: "ERR_NETWORK" });
    const firstKey = idempotencyKeyAt(0);

    await eventService.createAgendaItem(42, agendaPayload());
    expect(idempotencyKeyAt(1)).toBe(firstKey);
  });

  test("rotates the agenda key after a definitive validation error", async () => {
    appApiClient.post
      .mockRejectedValueOnce({ response: { status: 422 } })
      .mockResolvedValueOnce({ data: { schedule: { id: 53 } } });

    await expect(eventService.createAgendaItem(42, agendaPayload())).rejects.toMatchObject({ response: { status: 422 } });
    const rejectedKey = idempotencyKeyAt(0);

    await eventService.createAgendaItem(42, agendaPayload());
    expect(idempotencyKeyAt(1)).not.toBe(rejectedKey);
  });

  test("deduplicates concurrent equivalent agenda submissions", async () => {
    let resolveRequest;
    appApiClient.post.mockReturnValueOnce(new Promise((resolve) => { resolveRequest = resolve; }));

    const first = eventService.createAgendaItem(42, agendaPayload());
    const second = eventService.createAgendaItem(42, agendaPayload());

    expect(second).toBe(first);
    expect(appApiClient.post).toHaveBeenCalledTimes(1);

    resolveRequest({ data: { schedule: { id: 54 } } });
    await expect(first).resolves.toMatchObject({ schedule: { id: 54 } });
  });

  test("keeps equal agenda payloads isolated between productions", async () => {
    appApiClient.post
      .mockResolvedValueOnce({ data: { schedule: { id: 55 } } })
      .mockResolvedValueOnce({ data: { schedule: { id: 56 } } });

    await Promise.all([
      eventService.createAgendaItem(42, agendaPayload()),
      eventService.createAgendaItem(43, agendaPayload()),
    ]);

    expect(appApiClient.post).toHaveBeenCalledTimes(2);
    expect(idempotencyKeyAt(0)).not.toBe(idempotencyKeyAt(1));
  });
});