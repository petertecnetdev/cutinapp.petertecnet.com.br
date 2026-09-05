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

describe("CommerceService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

    resolveRequest({ data: { order: { public_id: "order-1" } } });
    await expect(first).resolves.toEqual({ order: { public_id: "order-1" } });
  });

  test("allows a new checkout after the previous request finishes", async () => {
    appApiClient.post
      .mockResolvedValueOnce({ data: { order: { public_id: "order-1" } } })
      .mockResolvedValueOnce({ data: { order: { public_id: "order-2" } } });

    await commerceService.checkout(payload);
    await commerceService.checkout(payload);

    expect(appApiClient.post).toHaveBeenCalledTimes(2);
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
