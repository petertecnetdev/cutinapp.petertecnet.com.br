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
    expect(appApiClient.post).toHaveBeenCalledWith(
      "/events/77",
      payload,
      { headers: { "Idempotency-Key": expect.any(String) } }
    );
    expect(payload.get("_method")).toBe("PATCH");
    expect(payload.get("image")).toBeInstanceOf(File);
    expect(result.event.image).toBe("images/events/cover.webp");
  });

  test("reuses multipart event update key after an uncertain network failure", async () => {
    const payload = new FormData();
    payload.append("title", "Evento atualizado");
    appApiClient.post
      .mockRejectedValueOnce({ code: "ERR_NETWORK", message: "Network Error" })
      .mockResolvedValueOnce({ data: { event: { id: 77 } } });

    await expect(eventService.update(77, payload)).rejects.toMatchObject({ code: "ERR_NETWORK" });
    const firstKey = idempotencyKeyAt(0);

    await eventService.update(77, payload);
    expect(idempotencyKeyAt(1)).toBe(firstKey);
  });

  test("protects non-multipart PATCH updates with an idempotency key", async () => {
    appApiClient.patch.mockResolvedValueOnce({ data: { event: { id: 78 } } });

    await eventService.update(78, { title: "Sem arquivo" });

    expect(appApiClient.patch).toHaveBeenCalledWith(
      "/events/78",
      { title: "Sem arquivo" },
      { headers: { "Idempotency-Key": expect.any(String) } }
    );
    expect(appApiClient.post).not.toHaveBeenCalled();
  });

  test("reuses the JSON update key after an uncertain network failure", async () => {
    const payload = { title: "Evento sem arquivo" };
    appApiClient.patch
      .mockRejectedValueOnce({ code: "ERR_NETWORK", message: "Network Error" })
      .mockResolvedValueOnce({ data: { event: { id: 79 } } });

    await expect(eventService.update(79, payload)).rejects.toMatchObject({ code: "ERR_NETWORK" });
    const firstKey = appApiClient.patch.mock.calls[0]?.[2]?.headers?.["Idempotency-Key"];

    await eventService.update(79, { ...payload });
    expect(appApiClient.patch.mock.calls[1]?.[2]?.headers?.["Idempotency-Key"]).toBe(firstKey);
  });

  test("rotates the JSON update key after a definitive validation failure", async () => {
    const payload = { title: "Evento inválido" };
    appApiClient.patch
      .mockRejectedValueOnce({ response: { status: 422 } })
      .mockResolvedValueOnce({ data: { event: { id: 80 } } });

    await expect(eventService.update(80, payload)).rejects.toMatchObject({ response: { status: 422 } });
    const rejectedKey = appApiClient.patch.mock.calls[0]?.[2]?.headers?.["Idempotency-Key"];

    await eventService.update(80, { ...payload });
    const retryKey = appApiClient.patch.mock.calls[1]?.[2]?.headers?.["Idempotency-Key"];
    expect(retryKey).toBeTruthy();
    expect(retryKey).not.toBe(rejectedKey);
  });

  test("deduplicates concurrent equivalent JSON event updates", async () => {
    let resolveRequest;
    const pendingResponse = new Promise((resolve) => {
      resolveRequest = resolve;
    });
    appApiClient.patch.mockReturnValueOnce(pendingResponse);

    const first = eventService.update(81, { title: "Mesmo evento" });
    const second = eventService.update(81, { title: "Mesmo evento" });

    expect(appApiClient.patch).toHaveBeenCalledTimes(1);

    resolveRequest({ data: { event: { id: 81 } } });
    await expect(first).resolves.toMatchObject({ event: { id: 81 } });
    await expect(second).resolves.toMatchObject({ event: { id: 81 } });
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

describe("EventService agenda update idempotency", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  test("sends an idempotency key and deduplicates concurrent agenda updates", async () => {
    let resolveRequest;
    appApiClient.post.mockReturnValueOnce(new Promise((resolve) => { resolveRequest = resolve; }));

    const first = eventService.updateAgendaItem(51, agendaPayload());
    const second = eventService.updateAgendaItem(51, agendaPayload());

    expect(second).toBe(first);
    expect(appApiClient.post).toHaveBeenCalledTimes(1);
    expect(appApiClient.post).toHaveBeenCalledWith(
      "/event-agenda/items/51",
      expect.any(FormData),
      { headers: { "Idempotency-Key": expect.any(String) } }
    );

    resolveRequest({ data: { schedule: { id: 51 } } });
    await expect(first).resolves.toMatchObject({ schedule: { id: 51 } });
  });

  test("rotates agenda update key after a definitive validation failure", async () => {
    appApiClient.post
      .mockRejectedValueOnce({ response: { status: 422 } })
      .mockResolvedValueOnce({ data: { schedule: { id: 51 } } });

    await expect(eventService.updateAgendaItem(51, agendaPayload())).rejects.toMatchObject({ response: { status: 422 } });
    const rejectedKey = idempotencyKeyAt(0);

    await eventService.updateAgendaItem(51, agendaPayload());
    expect(idempotencyKeyAt(1)).not.toBe(rejectedKey);
  });
});

describe("EventService agenda generation idempotency", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  test("protects a single agenda item generation with an idempotency key", async () => {
    appApiClient.post.mockResolvedValueOnce({ data: { generated: true, event: { id: 71 } } });

    await expect(eventService.generateAgendaItem(61)).resolves.toMatchObject({ generated: true });

    expect(appApiClient.post).toHaveBeenCalledWith(
      "/event-agenda/items/61/generate",
      undefined,
      { headers: { "Idempotency-Key": expect.any(String) } }
    );
  });

  test("reuses the generation key after an uncertain failure", async () => {
    appApiClient.post
      .mockRejectedValueOnce({ response: { status: 503 } })
      .mockResolvedValueOnce({ data: { generated: true } });

    await expect(eventService.generateAgendaUpcoming(42)).rejects.toMatchObject({ response: { status: 503 } });
    const firstKey = idempotencyKeyAt(0);

    await eventService.generateAgendaUpcoming(42);

    expect(idempotencyKeyAt(1)).toBe(firstKey);
  });

  test("rotates generation key after a definitive validation failure", async () => {
    appApiClient.post
      .mockRejectedValueOnce({ response: { status: 422 } })
      .mockResolvedValueOnce({ data: { generated: true } });

    await expect(eventService.generateAgendaItem(62)).rejects.toMatchObject({ response: { status: 422 } });
    const rejectedKey = idempotencyKeyAt(0);

    await eventService.generateAgendaItem(62);

    expect(idempotencyKeyAt(1)).not.toBe(rejectedKey);
  });

  test("deduplicates concurrent generation requests for the same resource", async () => {
    let resolveRequest;
    appApiClient.post.mockReturnValueOnce(new Promise((resolve) => { resolveRequest = resolve; }));

    const first = eventService.generateAgendaUpcoming(43);
    const second = eventService.generateAgendaUpcoming(43);

    expect(second).toBe(first);
    expect(appApiClient.post).toHaveBeenCalledTimes(1);

    resolveRequest({ data: { generated: true } });
    await expect(first).resolves.toMatchObject({ generated: true });
  });

  test("keeps generation requests isolated between different resources", async () => {
    appApiClient.post
      .mockResolvedValueOnce({ data: { generated: true } })
      .mockResolvedValueOnce({ data: { generated: true } });

    await Promise.all([
      eventService.generateAgendaItem(63),
      eventService.generateAgendaItem(64),
    ]);

    expect(appApiClient.post).toHaveBeenCalledTimes(2);
    expect(idempotencyKeyAt(0)).not.toBe(idempotencyKeyAt(1));
  });
});