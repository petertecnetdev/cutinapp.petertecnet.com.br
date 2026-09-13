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

const payloadFor = (eventId) => ({
  event_id: eventId,
  payment_method: "pix",
  tickets: [{ id: 5, quantity: 1 }],
  items: [],
});

const idempotencyKeyAt = (callIndex) => (
  appApiClient.post.mock.calls[callIndex]?.[2]?.headers?.["Idempotency-Key"]
);

describe("CommerceService idempotency processing recovery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  test("waits for Retry-After and automatically recovers the same checkout operation", async () => {
    const processingError = {
      status: 409,
      response: {
        status: 409,
        headers: {
          "idempotency-status": "processing",
          "retry-after": "0.001",
        },
      },
    };

    appApiClient.post
      .mockRejectedValueOnce(processingError)
      .mockResolvedValueOnce({ data: { order: { public_id: "order-1", status: "pending" } } });

    await expect(commerceService.checkout(payloadFor(901))).resolves.toEqual({
      order: { public_id: "order-1", status: "pending" },
    });

    expect(appApiClient.post).toHaveBeenCalledTimes(2);
    expect(idempotencyKeyAt(0)).toBeTruthy();
    expect(idempotencyKeyAt(1)).toBe(idempotencyKeyAt(0));
    expect(trackTelemetry).toHaveBeenCalledWith("checkout_transient_retry", expect.objectContaining({
      metadata: expect.objectContaining({
        status: 409,
        retry_attempt: 1,
        retry_delay_ms: 1,
      }),
    }));
  });

  test("does not automatically retry unrelated 409 conflicts", async () => {
    const conflict = {
      status: 409,
      response: {
        status: 409,
        headers: { "idempotency-status": "conflict" },
      },
    };

    appApiClient.post.mockRejectedValueOnce(conflict);

    await expect(commerceService.checkout(payloadFor(902))).rejects.toMatchObject({ status: 409 });
    expect(appApiClient.post).toHaveBeenCalledTimes(1);
    expect(trackTelemetry).not.toHaveBeenCalledWith("checkout_transient_retry", expect.anything());
  });
});
