import appApiClient from "./AppApiClient";
import financeService from "./FinanceService";

jest.mock("./AppApiClient", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
  },
}));

const idempotencyKeyAt = (callIndex) => (
  appApiClient.post.mock.calls[callIndex]?.[2]?.headers?.["Idempotency-Key"]
);

describe("FinanceService payout idempotency", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  test("sends an idempotency key when requesting a payout", async () => {
    appApiClient.post.mockResolvedValueOnce({ data: { payout: { id: 91 } } });

    await expect(financeService.requestPayout(12, 150.5)).resolves.toEqual({ payout: { id: 91 } });

    expect(appApiClient.post).toHaveBeenCalledWith(
      "/organizations/12/finance/payouts",
      { amount: 150.5 },
      { headers: { "Idempotency-Key": expect.any(String) } }
    );
    expect(idempotencyKeyAt(0)).toBeTruthy();
  });

  test("reuses the same key and normalized payload after an uncertain network failure", async () => {
    appApiClient.post
      .mockRejectedValueOnce({ code: "ERR_NETWORK", message: "Network Error" })
      .mockResolvedValueOnce({ data: { payout: { id: 92 } } });

    await expect(financeService.requestPayout(12, 250)).rejects.toMatchObject({ code: "ERR_NETWORK" });
    const firstKey = idempotencyKeyAt(0);

    await expect(financeService.requestPayout(12, "250.00")).resolves.toEqual({ payout: { id: 92 } });
    expect(idempotencyKeyAt(1)).toBe(firstKey);
    expect(appApiClient.post.mock.calls[1][1]).toEqual({ amount: 250 });
  });

  test("uses a fresh key after a definitive validation failure", async () => {
    appApiClient.post
      .mockRejectedValueOnce({ response: { status: 422 } })
      .mockResolvedValueOnce({ data: { payout: { id: 93 } } });

    await expect(financeService.requestPayout(12, 300)).rejects.toMatchObject({ response: { status: 422 } });
    const rejectedKey = idempotencyKeyAt(0);

    await financeService.requestPayout(12, 300);
    expect(idempotencyKeyAt(1)).toBeTruthy();
    expect(idempotencyKeyAt(1)).not.toBe(rejectedKey);
  });

  test("deduplicates equivalent concurrent payout requests", async () => {
    let resolvePayout;
    appApiClient.post.mockImplementationOnce(() => new Promise((resolve) => { resolvePayout = resolve; }));

    const first = financeService.requestPayout(12, 400);
    const second = financeService.requestPayout(12, "400.00");

    expect(first).toBe(second);
    expect(appApiClient.post).toHaveBeenCalledTimes(1);

    resolvePayout({ data: { payout: { id: 94 } } });
    await expect(first).resolves.toEqual({ payout: { id: 94 } });
  });
});

describe("FinanceService identity document idempotency", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  const createFile = (name = "document.png", content = "identity-front") => (
    new File([content], name, { type: "image/png", lastModified: 1700000000000 })
  );

  const uploadKeyAt = (callIndex) => (
    appApiClient.post.mock.calls[callIndex]?.[2]?.headers?.["Idempotency-Key"]
  );

  test("sends an idempotency key with the KYC multipart upload", async () => {
    appApiClient.post.mockResolvedValueOnce({ data: { identity: { status: "identity_pending" } } });
    const front = createFile();

    await financeService.uploadDocument(12, front);

    expect(appApiClient.post).toHaveBeenCalledTimes(1);
    expect(appApiClient.post.mock.calls[0][0]).toBe("/organizations/12/finance/identity/document");
    expect(appApiClient.post.mock.calls[0][1]).toBeInstanceOf(FormData);
    expect(uploadKeyAt(0)).toBeTruthy();
  });

  test("reuses the same key for the same document after an uncertain network failure", async () => {
    appApiClient.post
      .mockRejectedValueOnce({ code: "ERR_NETWORK", message: "Network Error" })
      .mockResolvedValueOnce({ data: { identity: { status: "identity_pending" } } });
    const front = createFile();

    await expect(financeService.uploadDocument(12, front)).rejects.toMatchObject({ code: "ERR_NETWORK" });
    const firstKey = uploadKeyAt(0);

    await expect(financeService.uploadDocument(12, front)).resolves.toEqual({ identity: { status: "identity_pending" } });
    expect(uploadKeyAt(1)).toBe(firstKey);
  });

  test("uses a fresh key after a definitive validation failure", async () => {
    appApiClient.post
      .mockRejectedValueOnce({ response: { status: 422 } })
      .mockResolvedValueOnce({ data: { identity: { status: "identity_pending" } } });
    const front = createFile();

    await expect(financeService.uploadDocument(12, front)).rejects.toMatchObject({ response: { status: 422 } });
    const rejectedKey = uploadKeyAt(0);

    await financeService.uploadDocument(12, front);
    expect(uploadKeyAt(1)).not.toBe(rejectedKey);
  });

  test("deduplicates concurrent uploads of the same document", async () => {
    let resolveUpload;
    appApiClient.post.mockImplementationOnce(() => new Promise((resolve) => { resolveUpload = resolve; }));
    const front = createFile();

    const first = financeService.uploadDocument(12, front);
    const second = financeService.uploadDocument(12, front);

    expect(first).toBe(second);
    expect(appApiClient.post).toHaveBeenCalledTimes(1);

    resolveUpload({ data: { identity: { status: "identity_pending" } } });
    await expect(first).resolves.toEqual({ identity: { status: "identity_pending" } });
  });
});


describe("FinanceService liveness idempotency", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  test("protects liveness session creation with an idempotency key", async () => {
    appApiClient.post.mockResolvedValueOnce({ data: { session_id: "session-12345678901234567890" } });

    await expect(financeService.startLiveness(12)).resolves.toEqual({ session_id: "session-12345678901234567890" });

    expect(appApiClient.post).toHaveBeenCalledWith(
      "/organizations/12/finance/identity/liveness-session",
      undefined,
      { headers: { "Idempotency-Key": expect.any(String) } }
    );
    expect(idempotencyKeyAt(0)).toBeTruthy();
  });

  test("reuses the liveness-start key after an uncertain failure and coalesces concurrent retries", async () => {
    appApiClient.post.mockRejectedValueOnce({ code: "ERR_NETWORK", message: "Network Error" });

    await expect(financeService.startLiveness(12)).rejects.toMatchObject({ code: "ERR_NETWORK" });
    const firstKey = idempotencyKeyAt(0);

    let resolveStart;
    appApiClient.post.mockImplementationOnce(() => new Promise((resolve) => { resolveStart = resolve; }));
    const first = financeService.startLiveness(12);
    const second = financeService.startLiveness("12");

    expect(first).toBe(second);
    expect(appApiClient.post).toHaveBeenCalledTimes(2);
    expect(idempotencyKeyAt(1)).toBe(firstKey);

    resolveStart({ data: { session_id: "session-12345678901234567890" } });
    await expect(first).resolves.toEqual({ session_id: "session-12345678901234567890" });
  });

  test("protects liveness completion and normalizes the session id", async () => {
    appApiClient.post.mockResolvedValueOnce({ data: { identity: { beneficiary: { status: "verified" } } } });

    await financeService.completeLiveness(12, "  session-12345678901234567890  ");

    expect(appApiClient.post).toHaveBeenCalledWith(
      "/organizations/12/finance/identity/liveness-complete",
      { session_id: "session-12345678901234567890" },
      { headers: { "Idempotency-Key": expect.any(String) } }
    );
  });

  test("uses a fresh completion key after a definitive validation failure", async () => {
    appApiClient.post
      .mockRejectedValueOnce({ response: { status: 422 } })
      .mockResolvedValueOnce({ data: { identity: { beneficiary: { status: "verified" } } } });

    await expect(financeService.completeLiveness(12, "session-12345678901234567890")).rejects.toMatchObject({ response: { status: 422 } });
    const rejectedKey = idempotencyKeyAt(0);

    await financeService.completeLiveness(12, "session-12345678901234567890");
    expect(idempotencyKeyAt(1)).toBeTruthy();
    expect(idempotencyKeyAt(1)).not.toBe(rejectedKey);
  });
});
