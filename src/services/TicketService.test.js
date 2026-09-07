import appApiClient from "./AppApiClient";
import ticketService from "./TicketService";

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

const ticketPayload = (name = "Pista") => ({
  event_id: 42,
  name,
  quantity: 100,
  limit_date: "2026-10-10",
  description: "Lote promocional",
  price: "59.90",
});

const idempotencyKeyAt = (callIndex) => (
  appApiClient.post.mock.calls[callIndex]?.[2]?.headers?.["Idempotency-Key"]
);

describe("TicketService ticket creation idempotency", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  test("sends an idempotency key with the normalized ticket payload", async () => {
    appApiClient.post.mockResolvedValueOnce({ data: { ticket: { id: 7, name: "Pista" } } });

    const result = await ticketService.store(ticketPayload());

    expect(appApiClient.post).toHaveBeenCalledWith(
      "/tickets",
      {
        event_id: 42,
        name: "Pista",
        quantity: 100,
        limit_date: "2026-10-10",
        description: "Lote promocional",
        price: 59.9,
        ticket_type: "standard",
      },
      { headers: { "Idempotency-Key": expect.any(String) } }
    );
    expect(idempotencyKeyAt(0)).toBeTruthy();
    expect(result.ticket).toEqual({ id: 7, name: "Pista" });
  });

  test("reuses the same key after an uncertain network failure", async () => {
    appApiClient.post
      .mockRejectedValueOnce({ code: "ERR_NETWORK", message: "Network Error" })
      .mockResolvedValueOnce({ data: { ticket: { id: 8 } } });

    await expect(ticketService.store(ticketPayload())).rejects.toMatchObject({ code: "ERR_NETWORK" });
    const firstKey = idempotencyKeyAt(0);

    await expect(ticketService.store(ticketPayload())).resolves.toMatchObject({ ticket: { id: 8 } });

    expect(idempotencyKeyAt(1)).toBe(firstKey);
  });

  test("uses a fresh key after a definitive validation failure", async () => {
    appApiClient.post
      .mockRejectedValueOnce({ response: { status: 422 } })
      .mockResolvedValueOnce({ data: { ticket: { id: 9 } } });

    await expect(ticketService.store(ticketPayload())).rejects.toMatchObject({ response: { status: 422 } });
    const rejectedKey = idempotencyKeyAt(0);

    await ticketService.store(ticketPayload());

    expect(idempotencyKeyAt(1)).toBeTruthy();
    expect(idempotencyKeyAt(1)).not.toBe(rejectedKey);
  });

  test("deduplicates concurrent equivalent submits", async () => {
    let resolveRequest;
    const pendingResponse = new Promise((resolve) => {
      resolveRequest = resolve;
    });
    appApiClient.post.mockReturnValueOnce(pendingResponse);

    const first = ticketService.store(ticketPayload());
    const second = ticketService.store({ ...ticketPayload(), price: 59.9 });

    expect(appApiClient.post).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);

    resolveRequest({ data: { ticket: { id: 10 } } });

    await expect(first).resolves.toMatchObject({ ticket: { id: 10 } });
  });
});
