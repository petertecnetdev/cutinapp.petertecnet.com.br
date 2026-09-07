import appApiClient from "./AppApiClient";
import cutinappService from "./CutinappService";

jest.mock("./AppApiClient", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

const idempotencyKeyAt = (callIndex) => (
  appApiClient.post.mock.calls[callIndex]?.[2]?.headers?.["Idempotency-Key"]
);

describe("CutinappService producer contract resend idempotency", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  test("sends an idempotency key when resending a producer agreement", async () => {
    appApiClient.post.mockResolvedValueOnce({ data: { message: "Cópia enviada por e-mail." } });

    await expect(cutinappService.resendProducerContract(21))
      .resolves.toEqual({ message: "Cópia enviada por e-mail." });

    expect(appApiClient.post).toHaveBeenCalledWith(
      "/organizations/21/agreement/resend",
      undefined,
      { headers: { "Idempotency-Key": expect.any(String) } }
    );
  });

  test("reuses the same resend key after an uncertain network failure", async () => {
    appApiClient.post
      .mockRejectedValueOnce({ code: "ERR_NETWORK", message: "Network Error" })
      .mockResolvedValueOnce({ data: { message: "Cópia enviada." } });

    await expect(cutinappService.resendProducerContract(22)).rejects.toMatchObject({ code: "ERR_NETWORK" });
    const firstKey = idempotencyKeyAt(0);

    await expect(cutinappService.resendProducerContract("22")).resolves.toEqual({ message: "Cópia enviada." });
    expect(idempotencyKeyAt(1)).toBe(firstKey);
  });

  test("uses a fresh resend key after a definitive validation failure", async () => {
    appApiClient.post
      .mockRejectedValueOnce({ response: { status: 422 } })
      .mockResolvedValueOnce({ data: { message: "Cópia enviada." } });

    await expect(cutinappService.resendProducerContract(23)).rejects.toMatchObject({ response: { status: 422 } });
    const rejectedKey = idempotencyKeyAt(0);

    await cutinappService.resendProducerContract(23);
    expect(idempotencyKeyAt(1)).toBeTruthy();
    expect(idempotencyKeyAt(1)).not.toBe(rejectedKey);
  });

  test("deduplicates equivalent concurrent resend submissions", async () => {
    let resolveResend;
    appApiClient.post.mockImplementationOnce(() => new Promise((resolve) => { resolveResend = resolve; }));

    const first = cutinappService.resendProducerContract(24);
    const second = cutinappService.resendProducerContract("24");

    expect(first).toBe(second);
    expect(appApiClient.post).toHaveBeenCalledTimes(1);

    resolveResend({ data: { message: "Cópia enviada." } });
    await expect(first).resolves.toEqual({ message: "Cópia enviada." });
  });
});
