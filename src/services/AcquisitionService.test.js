import appApiClient from "./AppApiClient";
import acquisitionService from "./AcquisitionService";

jest.mock("./AppApiClient", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
  },
}));

const payload = () => ({
  name: "Promoter Teste",
  email: "promoter@example.com",
  phone: "62999999999",
  event_id: 42,
});

const idempotencyKeyAt = (index) => (
  appApiClient.post.mock.calls[index]?.[2]?.headers?.["Idempotency-Key"]
);

describe("AcquisitionService onboarding", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  test("sends an idempotency key when creating an onboarding", async () => {
    appApiClient.post.mockResolvedValue({ data: { onboarding: { id: 10 } } });

    await expect(acquisitionService.onboard(payload())).resolves.toEqual({ onboarding: { id: 10 } });

    expect(appApiClient.post).toHaveBeenCalledWith(
      "/acquisition/onboardings",
      payload(),
      expect.objectContaining({ headers: { "Idempotency-Key": expect.any(String) } })
    );
  });

  test("keeps the same key after an ambiguous network failure", async () => {
    const networkError = Object.assign(new Error("Network Error"), { code: "ERR_NETWORK" });
    appApiClient.post
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce({ data: { onboarding: { id: 11 } } });

    await expect(acquisitionService.onboard(payload())).rejects.toThrow("Network Error");
    const firstKey = idempotencyKeyAt(0);

    await expect(acquisitionService.onboard(payload())).resolves.toEqual({ onboarding: { id: 11 } });
    expect(idempotencyKeyAt(1)).toBe(firstKey);
  });

  test("uses a new key after a definitive validation failure", async () => {
    appApiClient.post
      .mockRejectedValueOnce({ status: 422, message: "Dados inválidos" })
      .mockResolvedValueOnce({ data: { onboarding: { id: 12 } } });

    await expect(acquisitionService.onboard(payload())).rejects.toMatchObject({ status: 422 });
    const rejectedKey = idempotencyKeyAt(0);

    await acquisitionService.onboard(payload());
    expect(idempotencyKeyAt(1)).not.toBe(rejectedKey);
  });

  test("coalesces equivalent concurrent onboarding submissions", async () => {
    let resolveRequest;
    appApiClient.post.mockReturnValue(new Promise((resolve) => {
      resolveRequest = resolve;
    }));

    const first = acquisitionService.onboard(payload());
    const second = acquisitionService.onboard({ ...payload() });

    expect(second).toBe(first);
    expect(appApiClient.post).toHaveBeenCalledTimes(1);

    resolveRequest({ data: { onboarding: { id: 13 } } });
    await expect(first).resolves.toEqual({ onboarding: { id: 13 } });
  });
});
