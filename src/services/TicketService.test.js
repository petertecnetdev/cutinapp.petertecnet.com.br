import appApiClient from "./AppApiClient";
import ticketService from "./TicketService";

jest.mock("./AppApiClient", () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() } }));

const payload = () => ({ event_id: 42, name: "Pista", quantity: 100, limit_date: "2026-10-10", description: "Lote promocional", price: "59.90" });
const keyAt = (index) => appApiClient.post.mock.calls[index]?.[2]?.headers?.["Idempotency-Key"];

describe("TicketService ticket creation idempotency", () => {
  beforeEach(() => { jest.clearAllMocks(); sessionStorage.clear(); });

  test("sends an idempotency key", async () => {
    appApiClient.post.mockResolvedValueOnce({ data: { ticket: { id: 7 } } });
    await ticketService.store(payload());
    expect(appApiClient.post).toHaveBeenCalledWith("/tickets", expect.objectContaining({ event_id: 42, price: 59.9, ticket_type: "standard" }), { headers: { "Idempotency-Key": expect.any(String) } });
    expect(keyAt(0)).toBeTruthy();
  });

  test("reuses key after uncertain network failure", async () => {
    appApiClient.post.mockRejectedValueOnce({ code: "ERR_NETWORK", message: "Network Error" }).mockResolvedValueOnce({ data: { ticket: { id: 8 } } });
    await expect(ticketService.store(payload())).rejects.toMatchObject({ code: "ERR_NETWORK" });
    const first = keyAt(0);
    await ticketService.store(payload());
    expect(keyAt(1)).toBe(first);
  });

  test("uses fresh key after 422", async () => {
    appApiClient.post.mockRejectedValueOnce({ response: { status: 422 } }).mockResolvedValueOnce({ data: { ticket: { id: 9 } } });
    await expect(ticketService.store(payload())).rejects.toMatchObject({ response: { status: 422 } });
    const rejected = keyAt(0);
    await ticketService.store(payload());
    expect(keyAt(1)).not.toBe(rejected);
  });

  test("deduplicates concurrent equivalent submits", async () => {
    let resolveRequest;
    appApiClient.post.mockReturnValueOnce(new Promise((resolve) => { resolveRequest = resolve; }));
    const first = ticketService.store(payload());
    const second = ticketService.store({ ...payload(), price: 59.9 });
    expect(second).toBe(first);
    expect(appApiClient.post).toHaveBeenCalledTimes(1);
    resolveRequest({ data: { ticket: { id: 10 } } });
    await first;
  });
});
