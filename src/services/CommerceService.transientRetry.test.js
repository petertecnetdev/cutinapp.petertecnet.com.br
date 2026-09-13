import appApiClient from "./AppApiClient";
import commerceService from "./CommerceService";
import { trackTelemetry } from "../utils/telemetry";

jest.mock("./AppApiClient", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

jest.mock("../utils/telemetry", () => ({ trackTelemetry: jest.fn() }));

const payload = {
  event_id: 911,
  payment_method: "pix",
  tickets: [{ id: 5, quantity: 1 }],
  items: [],
};

const keyAt = (index) => appApiClient.post.mock.calls[index]?.[2]?.headers?.["Idempotency-Key"];

describe("CommerceService transient checkout recovery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  test("survives two consecutive provider 503 responses with the same idempotency key", async () => {
    const unavailable = { status: 503, response: { status: 503, headers: { "retry-after": "0.001" } } };
    appApiClient.post
      .mockRejectedValueOnce(unavailable)
      .mockRejectedValueOnce(unavailable)
      .mockResolvedValueOnce({ data: { order: { public_id: "order-recovered", status: "pending" } } });

    await expect(commerceService.checkout(payload)).resolves.toEqual({
      order: { public_id: "order-recovered", status: "pending" },
    });

    expect(appApiClient.post).toHaveBeenCalledTimes(3);
    expect(keyAt(0)).toBeTruthy();
    expect(keyAt(1)).toBe(keyAt(0));
    expect(keyAt(2)).toBe(keyAt(0));
    expect(trackTelemetry).toHaveBeenLastCalledWith("checkout_transient_retry", expect.objectContaining({
      metadata: expect.objectContaining({ status: 503, retry_attempt: 2 }),
    }));
  });

  test("stops after the bounded transient recovery window", async () => {
    const unavailable = { status: 502, response: { status: 502, headers: { "retry-after": "0.001" } } };
    appApiClient.post.mockRejectedValue(unavailable);

    await expect(commerceService.checkout({ ...payload, event_id: 912 })).rejects.toMatchObject({ status: 502 });
    expect(appApiClient.post).toHaveBeenCalledTimes(3);
    expect(new Set(appApiClient.post.mock.calls.map((_, index) => keyAt(index))).size).toBe(1);
  });

  test("switches from checkout to the preserved PIX order instead of creating another checkout", async () => {
    const preserved = {
      status: 502,
      data: { retryable: true, order_public_id: "order-preserved" },
      response: { status: 502, headers: {} },
    };
    appApiClient.post
      .mockRejectedValueOnce(preserved)
      .mockResolvedValueOnce({ data: { order: { public_id: "order-preserved", status: "pending" }, payment: { method: "pix", status: "pending", qr_code: "000201" } } });

    await expect(commerceService.checkout({ ...payload, event_id: 913 })).resolves.toEqual({
      order: { public_id: "order-preserved", status: "pending" },
      payment: { method: "pix", status: "pending", qr_code: "000201" },
    });

    expect(appApiClient.post).toHaveBeenCalledTimes(2);
    expect(appApiClient.post.mock.calls[0][0]).toBe("/commerce/checkout");
    expect(appApiClient.post.mock.calls[1]).toEqual([
      "/commerce/orders/order-preserved/payment/retry",
      { payment_method: "pix" },
    ]);
    expect(trackTelemetry).not.toHaveBeenCalledWith("checkout_transient_retry", expect.anything());
  });

  test("keeps the preserved PIX order across a failed dedicated retry", async () => {
    const checkoutPayload = { ...payload, event_id: 914 };
    const preserved = { status: 502, data: { retryable: true, order_public_id: "order-session" }, response: { status: 502, headers: {} } };
    const retryUnavailable = { status: 503, data: { message: "provider unavailable" }, response: { status: 503, headers: {} } };
    appApiClient.post.mockRejectedValueOnce(preserved).mockRejectedValueOnce(retryUnavailable);

    await expect(commerceService.checkout(checkoutPayload)).rejects.toMatchObject({
      data: { retryable: true, order_public_id: "order-session" },
    });
    expect(appApiClient.post).toHaveBeenCalledTimes(2);

    appApiClient.post.mockReset();
    appApiClient.post.mockResolvedValueOnce({ data: { order: { public_id: "order-session", status: "pending" }, payment: { method: "pix", status: "pending" } } });

    await expect(commerceService.checkout(checkoutPayload)).resolves.toEqual({
      order: { public_id: "order-session", status: "pending" },
      payment: { method: "pix", status: "pending" },
    });
    expect(appApiClient.post).toHaveBeenCalledTimes(1);
    expect(appApiClient.post).toHaveBeenCalledWith(
      "/commerce/orders/order-session/payment/retry",
      { payment_method: "pix" },
    );
  });

  test("retries PIX initialization on the preserved order endpoint", async () => {
    appApiClient.post.mockResolvedValueOnce({
      data: {
        order: { public_id: "order-preserved", status: "pending" },
        payment: { method: "pix", status: "pending", qr_code: "000201" },
      },
    });

    await expect(commerceService.retryOrderPayment("order-preserved", "pix")).resolves.toEqual({
      order: { public_id: "order-preserved", status: "pending" },
      payment: { method: "pix", status: "pending", qr_code: "000201" },
    });

    expect(appApiClient.post).toHaveBeenCalledWith(
      "/commerce/orders/order-preserved/payment/retry",
      { payment_method: "pix" },
    );
  });
});
