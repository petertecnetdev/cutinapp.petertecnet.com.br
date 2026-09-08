import appApiClient from "./AppApiClient";
import commerceService from "./CommerceService";

jest.mock("./AppApiClient", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

describe("CommerceService coupon mutations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  test("reuses coupon creation key after an ambiguous failure", async () => {
    const payload = { code: "VIP20", type: "percentage", value: 20 };
    const networkError = Object.assign(new Error("Network Error"), { code: "ERR_NETWORK" });
    appApiClient.post.mockRejectedValueOnce(networkError).mockResolvedValueOnce({ data: { coupon: { id: 51, ...payload } } });

    await expect(commerceService.createCoupon(7, payload)).rejects.toThrow("Network Error");
    const firstKey = appApiClient.post.mock.calls[0][2].headers["Idempotency-Key"];
    await expect(commerceService.createCoupon("7", { value: 20, code: "VIP20", type: "percentage" })).resolves.toMatchObject({ id: 51 });
    expect(appApiClient.post.mock.calls[1][2].headers["Idempotency-Key"]).toBe(firstKey);
  });

  test("rotates coupon creation key after validation failure", async () => {
    appApiClient.post.mockRejectedValueOnce({ response: { status: 422 } }).mockResolvedValueOnce({ data: { coupon: { id: 52 } } });
    await expect(commerceService.createCoupon(8, { code: "INVALID" })).rejects.toMatchObject({ response: { status: 422 } });
    const rejectedKey = appApiClient.post.mock.calls[0][2].headers["Idempotency-Key"];
    await commerceService.createCoupon(8, { code: "INVALID" });
    expect(appApiClient.post.mock.calls[1][2].headers["Idempotency-Key"]).not.toBe(rejectedKey);
  });

  test("coalesces concurrent equivalent coupon updates", async () => {
    let resolveUpdate;
    appApiClient.patch.mockImplementationOnce(() => new Promise((resolve) => { resolveUpdate = resolve; }));
    const first = commerceService.updateCoupon(9, 53, { value: 15, active: true });
    const second = commerceService.updateCoupon("9", "53", { active: true, value: 15 });
    expect(appApiClient.patch).toHaveBeenCalledTimes(1);
    resolveUpdate({ data: { coupon: { id: 53, value: 15 } } });
    await expect(Promise.all([first, second])).resolves.toEqual([{ id: 53, value: 15 }, { id: 53, value: 15 }]);
    expect(appApiClient.patch.mock.calls[0][2].headers["Idempotency-Key"]).toEqual(expect.any(String));
  });

  test("reuses disable key after ambiguous failure and coalesces retry", async () => {
    const networkError = Object.assign(new Error("Network Error"), { code: "ERR_NETWORK" });
    appApiClient.delete.mockRejectedValueOnce(networkError).mockResolvedValueOnce({ data: { disabled: true } });
    await expect(commerceService.disableCoupon(10, 54)).rejects.toThrow("Network Error");
    const firstKey = appApiClient.delete.mock.calls[0][1].headers["Idempotency-Key"];
    const first = commerceService.disableCoupon("10", "54");
    const second = commerceService.disableCoupon(10, 54);
    await expect(Promise.all([first, second])).resolves.toEqual([{ disabled: true }, { disabled: true }]);
    expect(appApiClient.delete).toHaveBeenCalledTimes(2);
    expect(appApiClient.delete.mock.calls[1][1].headers["Idempotency-Key"]).toBe(firstKey);
  });
});
