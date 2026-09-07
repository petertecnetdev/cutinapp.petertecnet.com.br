import appApiClient from "./AppApiClient";
import financeService from "./FinanceService";

jest.mock("./AppApiClient", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
  },
}));

const idempotencyKeyAt = (callIndex) => (
  appApiClient.post.mock.calls[callIndex]?.[2]?.headers?.["Idempotency-Key"]
);

describe("FinanceService payout idempotency", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  test("sends an idempotency key when requesting a payout", async () => {
    appApiClient.post.mockResolvedValueOnce({ data: { payout: { id: 91 } } });

    await expect(financeService.requestPayout(12, 150.5)).resolves.toEqual({ payout: { id: 91 } });

    expect(appApiClient.post).toHaveBeenCalledWith(
      "/organizations/12/finance/payouts",
      { amount: 150.5 },
      { headers: { "Idempotency-Key": expect.any(String) } }
    );
    expect(idempotencyKeyAt(0)).toBeTruthy();
  });

  test("reuses the same key and normalized payload after an uncertain network failure", async () => {
    appApiClient.post
      .mockRejectedValueOnce({ code: "ERR_NETWORK", message: "Network Error" })
      .mockResolvedValueOnce({ data: { payout: { id: 92 } } });

    await expect(financeService.requestPayout(12, 250)).rejects.toMatchObject({ code: "ERR_NETWORK" });
    const firstKey = idempotencyKeyAt(0);

    await expect(financeService.requestPayout(12, "250.00")).resolves.toEqual({ payout: { id: 92 } });
    expect(idempotencyKeyAt(1)).toBe(firstKey);
    expect(appApiClient.post.mock.calls[1][1]).toEqual({ amount: 250 });
  });

  test("uses a fresh key after a definitive validation failure", async () => {
    appApiClient.post
      .mockRejectedValueOnce({ response: { status: 422 } })
      .mockResolvedValueOnce({ data: { payout: { id: 93 } } });

    await expect(financeService.requestPayout(12, 300)).rejects.toMatchObject({ response: { status: 422 } });
    const rejectedKey = idempotencyKeyAt(0);

    await financeService.requestPayout(12, 300);
    expect(idempotencyKeyAt(1)).toBeTruthy();
    expect(idempotencyKeyAt(1)).not.toBe(rejectedKey);
  });

  test("deduplicates equivalent concurrent payout requests", async () => {
    let resolvePayout;
    appApiClient.post.mockImplementationOnce(() => new Promise((resolve) => { resolvePayout = resolve; }));

    const first = financeService.requestPayout(12, 400);
    const second = financeService.requestPayout(12, "400.00");

    expect(first).toBe(second);
    expect(appApiClient.post).toHaveBeenCalledTimes(1);

    resolvePayout({ data: { payout: { id: 94 } } });
    await expect(first).resolves.toEqual({ payout: { id: 94 } });
  });
});
