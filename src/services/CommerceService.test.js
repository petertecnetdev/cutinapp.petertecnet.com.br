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

describe("CommerceService checkout", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
