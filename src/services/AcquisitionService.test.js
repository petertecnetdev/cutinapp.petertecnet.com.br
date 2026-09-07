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

describe("AcquisitionService idempotent mutations", () => {
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

  test("keeps the same onboarding key after an ambiguous network failure", async () => {
    const networkError = Object.assign(new Error("Network Error"), { code: "ERR_NETWORK" });
    appApiClient.post
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce({ data: { onboarding: { id: 11 } } });

    await expect(acquisitionService.onboard(payload())).rejects.toThrow("Network Error");
    const firstKey = idempotencyKeyAt(0);

    await expect(acquisitionService.onboard(payload())).resolves.toEqual({ onboarding: { id: 11 } });
    expect(idempotencyKeyAt(1)).toBe(firstKey);
  });

  test("uses a new onboarding key after a definitive validation failure", async () => {
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

  test("protects invitation resend retries with idempotency", async () => {
    const networkError = Object.assign(new Error("Network Error"), { code: "ERR_NETWORK" });
    appApiClient.post
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce({ data: { message: "Convite reenviado" } });

    await expect(acquisitionService.resend(77)).rejects.toThrow("Network Error");
    const firstKey = idempotencyKeyAt(0);

    await expect(acquisitionService.resend(77)).resolves.toEqual({ message: "Convite reenviado" });
    expect(idempotencyKeyAt(1)).toBe(firstKey);
    expect(appApiClient.post.mock.calls[1]).toEqual([
      "/acquisition/referrals/77/resend",
      undefined,
      expect.objectContaining({ headers: { "Idempotency-Key": firstKey } }),
    ]);
  });

  test("coalesces equivalent concurrent referral activations", async () => {
    let resolveRequest;
    appApiClient.post.mockReturnValue(new Promise((resolve) => {
      resolveRequest = resolve;
    }));
    const activation = { token: "invite-token", password: "strong-password" };

    const first = acquisitionService.activate(activation);
    const second = acquisitionService.activate({ ...activation });

    expect(second).toBe(first);
    expect(appApiClient.post).toHaveBeenCalledTimes(1);
    expect(appApiClient.post.mock.calls[0][2]?.headers?.["Idempotency-Key"]).toEqual(expect.any(String));

    resolveRequest({ data: { user: { id: 25 } } });
    await expect(first).resolves.toEqual({ user: { id: 25 } });
  });
});
