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

const payload = {
  event_id: 10,
  payment_method: "pix",
  tickets: [{ id: 5, quantity: 2 }],
  items: [],
};

const idempotencyKeyAt = (callIndex) => (
  appApiClient.post.mock.calls[callIndex]?.[2]?.headers?.["Idempotency-Key"]
);

describe("CommerceService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  test("loads date-aware purchase options for an event", async () => {
    appApiClient.get.mockResolvedValue({ data: { event: { id: 10 } } });

    await expect(commerceService.catalog("evento-teste")).resolves.toEqual({ event: { id: 10 } });
    expect(appApiClient.get).toHaveBeenCalledWith("/events/public/evento-teste/purchase-options");
  });

  test("loads the pickup credential for a paid order", async () => {
    appApiClient.get.mockResolvedValue({ data: { credential: { token: "ITEM-order.signature" } } });

    await expect(commerceService.pickupCredential("order-uuid")).resolves.toEqual({ token: "ITEM-order.signature" });
    expect(appApiClient.get).toHaveBeenCalledWith("/commerce/orders/order-uuid/pickup-credential");
  });

  test("redeems event items against the selected event", async () => {
    appApiClient.post.mockResolvedValue({ data: { status: "redeemed" } });

    await expect(commerceService.redeemEventItems("ITEM-order.signature", "42")).resolves.toEqual({ status: "redeemed" });
    expect(appApiClient.post).toHaveBeenCalledWith("/commerce/item-redemptions/redeem", {
      token: "ITEM-order.signature",
      event_id: 42,
    });
  });

  test("coalesces identical checkout submissions while the request is pending", async () => {
    let resolveRequest;
    appApiClient.post.mockReturnValue(new Promise((resolve) => {
      resolveRequest = resolve;
    }));

    const first = commerceService.checkout(payload);
    const second = commerceService.checkout({ ...payload });

    expect(appApiClient.post).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    expect(idempotencyKeyAt(0)).toBeTruthy();

    resolveRequest({ data: { order: { public_id: "order-1" } } });
    await expect(first).resolves.toEqual({ order: { public_id: "order-1" } });
  });

  test("allows a new checkout with a new key after the previous request succeeds", async () => {
    appApiClient.post
      .mockResolvedValueOnce({ data: { order: { public_id: "order-1" } } })
      .mockResolvedValueOnce({ data: { order: { public_id: "order-2" } } });

    await commerceService.checkout(payload);
    await commerceService.checkout(payload);

    expect(appApiClient.post).toHaveBeenCalledTimes(2);
    expect(idempotencyKeyAt(0)).toBeTruthy();
    expect(idempotencyKeyAt(1)).toBeTruthy();
    expect(idempotencyKeyAt(1)).not.toBe(idempotencyKeyAt(0));
  });

  test("reuses the same key after an ambiguous network failure", async () => {
    const networkError = Object.assign(new Error("Network Error"), { code: "ERR_NETWORK" });
    appApiClient.post
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce({ data: { order: { public_id: "order-1" } } });

    await expect(commerceService.checkout(payload)).rejects.toThrow("Network Error");
    const firstKey = idempotencyKeyAt(0);

    await expect(commerceService.checkout(payload)).resolves.toEqual({ order: { public_id: "order-1" } });

    expect(firstKey).toBeTruthy();
    expect(idempotencyKeyAt(1)).toBe(firstKey);
  });

  test("keeps the same key while the server reports the operation is still processing", async () => {
    appApiClient.post
      .mockRejectedValueOnce({ status: 409, message: "Esta operação já está em processamento." })
      .mockResolvedValueOnce({ data: { order: { public_id: "order-1" } } });

    await expect(commerceService.checkout(payload)).rejects.toMatchObject({ status: 409 });
    const firstKey = idempotencyKeyAt(0);

    await commerceService.checkout(payload);

    expect(idempotencyKeyAt(1)).toBe(firstKey);
  });

  test("uses a new key after a definitive validation failure", async () => {
    appApiClient.post
      .mockRejectedValueOnce({ status: 422, message: "Dados inválidos" })
      .mockResolvedValueOnce({ data: { order: { public_id: "order-1" } } });

    await expect(commerceService.checkout(payload)).rejects.toMatchObject({ status: 422 });
    const rejectedKey = idempotencyKeyAt(0);

    await commerceService.checkout(payload);

    expect(idempotencyKeyAt(1)).not.toBe(rejectedKey);
  });

  test("does not coalesce distinct carts", async () => {
    appApiClient.post.mockResolvedValue({ data: { ok: true } });

    await Promise.all([
      commerceService.checkout(payload),
      commerceService.checkout({ ...payload, tickets: [{ id: 5, quantity: 1 }] }),
    ]);

    expect(appApiClient.post).toHaveBeenCalledTimes(2);
  });
});
