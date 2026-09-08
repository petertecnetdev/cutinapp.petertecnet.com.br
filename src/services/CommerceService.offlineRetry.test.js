import appApiClient from "./AppApiClient";
import commerceService from "./CommerceService";
import { trackTelemetry } from "../utils/telemetry";
import { isBrowserOffline, waitForOnline } from "../utils/checkoutConnectivity";

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

jest.mock("../utils/checkoutConnectivity", () => ({
  isBrowserOffline: jest.fn(() => true),
  waitForOnline: jest.fn(() => Promise.resolve({ restored: false, waited: true })),
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

describe("CommerceService offline checkout recovery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    isBrowserOffline.mockReturnValue(true);
    waitForOnline.mockResolvedValue({ restored: false, waited: true });
  });

  test("does not waste the automatic retry while the browser is still offline and keeps the idempotency key", async () => {
    const networkError = Object.assign(new Error("Network Error"), { code: "ERR_NETWORK" });
    appApiClient.post.mockRejectedValueOnce(networkError);

    await expect(commerceService.checkout(payload)).rejects.toThrow("Network Error");

    expect(appApiClient.post).toHaveBeenCalledTimes(1);
    const offlineKey = idempotencyKeyAt(0);
    expect(offlineKey).toBeTruthy();
    expect(trackTelemetry).toHaveBeenCalledWith("checkout_transient_retry", expect.objectContaining({
      metadata: expect.objectContaining({
        retry_attempt: 0,
        waited_for_connectivity: true,
        connectivity_restored: false,
        retry_skipped_offline: true,
      }),
    }));

    isBrowserOffline.mockReturnValue(false);
    appApiClient.post.mockResolvedValueOnce({ data: { order: { public_id: "order-1" } } });

    await expect(commerceService.checkout(payload)).resolves.toEqual({ order: { public_id: "order-1" } });
    expect(idempotencyKeyAt(1)).toBe(offlineKey);
  });
});
