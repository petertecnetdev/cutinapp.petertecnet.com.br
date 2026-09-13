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
});
