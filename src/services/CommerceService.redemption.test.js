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

const keyAt = (index) => appApiClient.post.mock.calls[index]?.[2]?.headers?.["Idempotency-Key"];

describe("CommerceService item redemption reliability", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  test("sends an idempotency key with the normalized redemption payload", async () => {
    appApiClient.post.mockResolvedValue({ data: { status: "redeemed" } });

    await expect(commerceService.redeemEventItems("  ITEM-order.signature  ", "42"))
      .resolves.toEqual({ status: "redeemed" });

    expect(appApiClient.post).toHaveBeenCalledWith(
      "/commerce/item-redemptions/redeem",
      { token: "ITEM-order.signature", event_id: 42 },
      { headers: { "Idempotency-Key": expect.any(String) } },
    );
  });

  test("reuses the same key after an uncertain network failure", async () => {
    const networkError = Object.assign(new Error("Network Error"), { code: "ERR_NETWORK" });
    appApiClient.post
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce({ data: { status: "redeemed" } });

    await expect(commerceService.redeemEventItems("ITEM-order.signature", 42)).rejects.toThrow("Network Error");
    const firstKey = keyAt(0);

    await expect(commerceService.redeemEventItems("ITEM-order.signature", 42))
      .resolves.toEqual({ status: "redeemed" });

    expect(keyAt(1)).toBe(firstKey);
  });

  test("uses a fresh key after a definitive validation failure", async () => {
    appApiClient.post
      .mockRejectedValueOnce({ status: 422, message: "QR inválido" })
      .mockResolvedValueOnce({ data: { status: "redeemed" } });

    await expect(commerceService.redeemEventItems("ITEM-order.signature", 42))
      .rejects.toMatchObject({ status: 422 });
    const rejectedKey = keyAt(0);

    await commerceService.redeemEventItems("ITEM-order.signature", 42);

    expect(keyAt(1)).not.toBe(rejectedKey);
  });

  test("coalesces concurrent duplicate scans", async () => {
    let resolveRequest;
    appApiClient.post.mockReturnValue(new Promise((resolve) => { resolveRequest = resolve; }));

    const first = commerceService.redeemEventItems("ITEM-order.signature", 42);
    const second = commerceService.redeemEventItems("ITEM-order.signature", 42);

    expect(second).toBe(first);
    expect(appApiClient.post).toHaveBeenCalledTimes(1);

    resolveRequest({ data: { status: "redeemed" } });
    await expect(first).resolves.toEqual({ status: "redeemed" });
  });
});
