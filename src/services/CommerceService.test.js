import appApiClient from "./AppApiClient";
import commerceService from "./CommerceService";
import { trackTelemetry } from "../utils/telemetry";

jest.mock("./AppApiClient", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock("../utils/telemetry", () => ({
  trackTelemetry: jest.fn(),
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

  test("loads the canonical commerce catalog for an event", async () => {
    appApiClient.get.mockResolvedValue({ data: { event: { id: 10 } } });

    await expect(commerceService.catalog("evento-teste")).resolves.toEqual({ event: { id: 10 } });
    expect(appApiClient.get).toHaveBeenCalledWith("/events/public/evento-teste/commerce");
  });

  test("reuses recent purchase options across event and checkout views", async () => {
    const response = { event: { id: 11 }, tickets: [{ id: 1 }] };
    appApiClient.get.mockResolvedValue({ data: response });

    const first = await commerceService.catalog("evento-cache");
    const second = await commerceService.catalog("evento-cache");

    expect(first).toEqual(response);
    expect(second).toBe(first);
    expect(appApiClient.get).toHaveBeenCalledTimes(1);
  });

  test("coalesces concurrent purchase-options requests", async () => {
    let resolveRequest;
    appApiClient.get.mockReturnValue(new Promise((resolve) => {
      resolveRequest = resolve;
    }));

    const first = commerceService.catalog("evento-concorrente");
    const second = commerceService.catalog("evento-concorrente");

    expect(second).toBe(first);
    expect(appApiClient.get).toHaveBeenCalledTimes(1);

    resolveRequest({ data: { event: { id: 12 } } });
    await expect(first).resolves.toEqual({ event: { id: 12 } });
  });

  test("does not cache a failed purchase-options request", async () => {
    appApiClient.get
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ data: { event: { id: 13 } } });

    await expect(commerceService.catalog("evento-retry")).rejects.toThrow("offline");
    await expect(commerceService.catalog("evento-retry")).resolves.toEqual({ event: { id: 13 } });

    expect(appApiClient.get).toHaveBeenCalledTimes(2);
  });

  test("protects payout requests with an idempotency key", async () => {
    appApiClient.post.mockResolvedValue({ data: { payout: { id: 91, status: "pending" } } });

    await expect(commerceService.requestPayout("42", "125.50")).resolves.toEqual({
      payout: { id: 91, status: "pending" },
    });

    expect(appApiClient.post).toHaveBeenCalledWith(
      "/organizations/42/payouts",
      { amount: "125.50" },
      { headers: { "Idempotency-Key": expect.any(String) } },
    );
  });

  test("reuses the payout request key after an uncertain network failure", async () => {
    const networkError = Object.assign(new Error("Network Error"), { code: "ERR_NETWORK" });
    appApiClient.post
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce({ data: { payout: { id: 92 } } });

    await expect(commerceService.requestPayout(42, 200)).rejects.toThrow("Network Error");
    const firstKey = idempotencyKeyAt(0);

    await expect(commerceService.requestPayout(42, 200)).resolves.toEqual({ payout: { id: 92 } });
    expect(idempotencyKeyAt(1)).toBe(firstKey);
  });

  test("rotates the payout request key after a definitive validation failure", async () => {
    appApiClient.post
      .mockRejectedValueOnce({ status: 422, message: "Valor indisponível" })
      .mockResolvedValueOnce({ data: { payout: { id: 95 } } });

    await expect(commerceService.requestPayout(42, 250)).rejects.toMatchObject({ status: 422 });
    const rejectedKey = idempotencyKeyAt(0);

    await expect(commerceService.requestPayout(42, 250)).resolves.toEqual({ payout: { id: 95 } });
    expect(idempotencyKeyAt(1)).not.toBe(rejectedKey);
  });

  test("coalesces concurrent identical payout requests", async () => {
    let resolveRequest;
    appApiClient.post.mockReturnValue(new Promise((resolve) => {
      resolveRequest = resolve;
    }));

    const first = commerceService.requestPayout(42, 300);
    const second = commerceService.requestPayout("42", "300.00");

    expect(second).toBe(first);
    expect(appApiClient.post).toHaveBeenCalledTimes(1);

    resolveRequest({ data: { payout: { id: 93 } } });
    await expect(first).resolves.toEqual({ payout: { id: 93 } });
  });

  test("protects payout cancellation against retry and concurrent duplicate submits", async () => {
    const networkError = Object.assign(new Error("Network Error"), { code: "ERR_NETWORK" });
    appApiClient.post
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce({ data: { payout: { id: 94, status: "cancelled" } } });

    await expect(commerceService.cancelPayout(42, 94)).rejects.toThrow("Network Error");
    const firstKey = idempotencyKeyAt(0);

    const first = commerceService.cancelPayout("42", "94");
    const second = commerceService.cancelPayout(42, 94);

    expect(second).toBe(first);
    await expect(first).resolves.toEqual({ payout: { id: 94, status: "cancelled" } });
    expect(appApiClient.post.mock.calls[1]).toEqual([
      "/organizations/42/payouts/94/cancel",
      undefined,
      { headers: { "Idempotency-Key": firstKey } },
    ]);
  });

  test("loads revenue funnel with a bounded period", async () => {
    appApiClient.get.mockResolvedValue({ data: { gross_revenue: 1250 } });

    await expect(commerceService.revenueFunnel(42, 999)).resolves.toEqual({ gross_revenue: 1250 });
    expect(appApiClient.get).toHaveBeenCalledWith("/organizations/42/revenue-funnel", { params: { days: 365 } });
  });

  test("keeps financial flows usable and records telemetry when revenue analytics are unavailable", async () => {
    const error = Object.assign(new Error("analytics unavailable"), { status: 503 });
    appApiClient.get.mockRejectedValue(error);

    await expect(commerceService.revenueFunnel(42, 30)).resolves.toBeNull();
    expect(trackTelemetry).toHaveBeenCalledWith("producer_revenue_analytics_unavailable", {
      label: "Métricas financeiras temporariamente indisponíveis",
      target: "42",
      metadata: {
        days: 30,
        status: 503,
        network_failure: false,
      },
    });
  });

  test("loads the pickup credential for a paid order", async () => {
    appApiClient.get.mockResolvedValue({ data: { credential: { token: "ITEM-order.signature" } } });

    await expect(commerceService.pickupCredential("order-uuid")).resolves.toEqual({ token: "ITEM-order.signature" });
    expect(appApiClient.get).toHaveBeenCalledWith("/commerce/orders/order-uuid/pickup-credential");
  });

  test("loads and resumes a server-side pending checkout without creating a new charge", async () => {
    appApiClient.get.mockResolvedValueOnce({
      data: { recoverable: true, payment_recovery_eligible: true, order: { id: 77 } },
    });
    appApiClient.post.mockResolvedValueOnce({
      data: { recovery_started: true, order: { id: 77, status: "pending" } },
    });

    await expect(commerceService.pendingCheckout()).resolves.toMatchObject({ recoverable: true });
    await expect(commerceService.recoverPendingCheckout(77)).resolves.toMatchObject({ recovery_started: true });

    expect(appApiClient.get).toHaveBeenCalledWith("/commerce/checkout/pending");
    expect(appApiClient.post).toHaveBeenCalledWith(
      "/commerce/checkout/pending/recover",
      { order_id: 77 },
      { headers: { "Idempotency-Key": expect.any(String) } },
    );
  });

  test("reuses the checkout recovery key after an uncertain failure", async () => {
    const networkError = Object.assign(new Error("Network Error"), { code: "ERR_NETWORK" });
    appApiClient.post
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce({ data: { recovery_started: true, order: { id: 77 } } });

    await expect(commerceService.recoverPendingCheckout(77)).rejects.toThrow("Network Error");
    const firstKey = idempotencyKeyAt(0);
    await expect(commerceService.recoverPendingCheckout("77")).resolves.toMatchObject({ recovery_started: true });
    expect(idempotencyKeyAt(1)).toBe(firstKey);
  });

  test("protects payment reconciliation retries with an idempotency key", async () => {
    appApiClient.post.mockResolvedValueOnce({ data: { order: { public_id: "order-uuid", status: "pending" } } });

    await expect(commerceService.syncPayment(" order-uuid ")).resolves.toMatchObject({ public_id: "order-uuid" });
    expect(appApiClient.post).toHaveBeenCalledWith(
      "/commerce/orders/order-uuid/sync-payment",
      undefined,
      { headers: { "Idempotency-Key": expect.any(String) } },
    );
  });

  test("reuses the payment reconciliation key after a transient server failure", async () => {
    appApiClient.post
      .mockRejectedValueOnce({ response: { status: 503 } })
      .mockResolvedValueOnce({ data: { order: { public_id: "order-uuid", status: "paid" } } });

    await expect(commerceService.syncPayment("order-uuid")).rejects.toMatchObject({ response: { status: 503 } });
    const firstKey = idempotencyKeyAt(0);
    await expect(commerceService.syncPayment("order-uuid")).resolves.toMatchObject({ status: "paid" });
    expect(idempotencyKeyAt(1)).toBe(firstKey);
  });

  test("redeems event items against the selected event", async () => {
    appApiClient.post.mockResolvedValue({ data: { status: "redeemed" } });

    await expect(commerceService.redeemEventItems("ITEM-order.signature", "42")).resolves.toEqual({ status: "redeemed" });
    expect(appApiClient.post).toHaveBeenCalledWith(
      "/commerce/item-redemptions/redeem",
      { token: "ITEM-order.signature", event_id: 42 },
      { headers: { "Idempotency-Key": expect.any(String) } },
    );
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

  test("retries one ambiguous network failure with the same idempotency key", async () => {
    const networkError = Object.assign(new Error("Network Error"), { code: "ERR_NETWORK" });
    appApiClient.post
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce({ data: { order: { public_id: "order-1" } } });

    await expect(commerceService.checkout(payload)).resolves.toEqual({ order: { public_id: "order-1" } });

    expect(appApiClient.post).toHaveBeenCalledTimes(2);
    expect(idempotencyKeyAt(0)).toBeTruthy();
    expect(idempotencyKeyAt(1)).toBe(idempotencyKeyAt(0));
    expect(trackTelemetry).toHaveBeenCalledWith("checkout_transient_retry", expect.objectContaining({
      metadata: expect.objectContaining({ status: 0, retry_attempt: 1 }),
    }));
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

    await expect(commerceService.checkout(payload)).rejects.toMatchObject({ status: 400, serverStatus: 422 });
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

  test("protects event item creation with an idempotency key", async () => {
    const item = { name: "Camiseta", price: 35, quantity: 20 };
    appApiClient.post.mockResolvedValueOnce({ data: { item: { id: 301 } } });

    await expect(commerceService.saveEventItem("44", item)).resolves.toEqual({ item: { id: 301 } });
    expect(appApiClient.post).toHaveBeenCalledWith(
      "/events/44/items",
      item,
      { headers: { "Idempotency-Key": expect.any(String) } },
    );
  });

  test("reuses the same event-item key after an uncertain network failure", async () => {
    const item = { name: "Camiseta", price: 35, quantity: 20 };
    appApiClient.post
      .mockRejectedValueOnce({ code: "ERR_NETWORK", message: "Network Error" })
      .mockResolvedValueOnce({ data: { item: { id: 302 } } });

    await expect(commerceService.saveEventItem(44, item)).rejects.toMatchObject({ code: "ERR_NETWORK" });
    const firstKey = idempotencyKeyAt(0);

    await expect(commerceService.saveEventItem("44", { quantity: 20, price: 35, name: "Camiseta" })).resolves.toEqual({ item: { id: 302 } });
    expect(idempotencyKeyAt(1)).toBe(firstKey);
  });

  test("rotates the event-item key after a definitive validation failure", async () => {
    const item = { name: "Copo", price: 15 };
    appApiClient.post
      .mockRejectedValueOnce({ response: { status: 422 } })
      .mockResolvedValueOnce({ data: { item: { id: 303 } } });

    await expect(commerceService.saveEventItem(45, item)).rejects.toMatchObject({ response: { status: 422 } });
    const rejectedKey = idempotencyKeyAt(0);

    await commerceService.saveEventItem(45, item);
    expect(idempotencyKeyAt(1)).toBeTruthy();
    expect(idempotencyKeyAt(1)).not.toBe(rejectedKey);
  });

  test("deduplicates concurrent equivalent event item creation", async () => {
    let resolveCreate;
    appApiClient.post.mockImplementationOnce(() => new Promise((resolve) => { resolveCreate = resolve; }));
    const item = { name: "Combo", price: 50 };

    const first = commerceService.saveEventItem(46, item);
    const second = commerceService.saveEventItem("46", { price: 50, name: "Combo" });

    expect(appApiClient.post).toHaveBeenCalledTimes(1);

    resolveCreate({ data: { item: { id: 304 } } });
    await expect(Promise.all([first, second])).resolves.toEqual([
      { item: { id: 304 } },
      { item: { id: 304 } },
    ]);
  });
});
