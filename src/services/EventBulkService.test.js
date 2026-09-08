import appApiClient from "./AppApiClient";
import eventBulkService from "./EventBulkService";

jest.mock("./AppApiClient", () => ({
  __esModule: true,
  default: {
    delete: jest.fn(),
  },
}));

const idempotencyKeyAt = (index) => (
  appApiClient.delete.mock.calls[index]?.[1]?.headers?.["Idempotency-Key"]
);

describe("EventBulkService mutation reliability", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  test("sends an idempotency key when deleting all owned events", async () => {
    appApiClient.delete.mockResolvedValue({ data: { deleted: 3 } });

    await expect(eventBulkService.deleteMine()).resolves.toEqual({ deleted: 3 });

    expect(appApiClient.delete).toHaveBeenCalledWith(
      "/events/mine",
      expect.objectContaining({ headers: { "Idempotency-Key": expect.any(String) } })
    );
  });

  test("reuses the key after an ambiguous network failure", async () => {
    const networkError = Object.assign(new Error("Network Error"), { code: "ERR_NETWORK" });
    appApiClient.delete
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce({ data: { deleted: 4 } });

    await expect(eventBulkService.deleteMine()).rejects.toThrow("Network Error");
    const firstKey = idempotencyKeyAt(0);

    await expect(eventBulkService.deleteMine()).resolves.toEqual({ deleted: 4 });
    expect(idempotencyKeyAt(1)).toBe(firstKey);
  });

  test("uses a new key after a definitive validation failure", async () => {
    appApiClient.delete
      .mockRejectedValueOnce({ status: 422, message: "Operação inválida" })
      .mockResolvedValueOnce({ data: { deleted: 0 } });

    await expect(eventBulkService.deleteMine()).rejects.toMatchObject({ status: 422 });
    const rejectedKey = idempotencyKeyAt(0);

    await eventBulkService.deleteMine();
    expect(idempotencyKeyAt(1)).not.toBe(rejectedKey);
  });

  test("coalesces concurrent bulk deletion requests", async () => {
    let resolveRequest;
    appApiClient.delete.mockReturnValue(new Promise((resolve) => {
      resolveRequest = resolve;
    }));

    const first = eventBulkService.deleteMine();
    const second = eventBulkService.deleteMine();

    expect(second).toBe(first);
    expect(appApiClient.delete).toHaveBeenCalledTimes(1);

    resolveRequest({ data: { deleted: 5 } });
    await expect(first).resolves.toEqual({ deleted: 5 });
  });
});
