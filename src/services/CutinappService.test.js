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

const productionPayload = (name = "Peter Eventos") => {
  const payload = new FormData();
  payload.append("name", name);
  payload.append("type", "independent");
  return payload;
};

const idempotencyKeyAt = (callIndex) => (
  appApiClient.post.mock.calls[callIndex]?.[2]?.headers?.["Idempotency-Key"]
);

describe("CutinappService production creation idempotency", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  test("sends an idempotency key and keeps the production facade response", async () => {
    appApiClient.post.mockResolvedValueOnce({ data: { organization: { id: 10, name: "Peter Eventos" } } });

    const result = await cutinappService.createProduction(productionPayload());

    expect(appApiClient.post).toHaveBeenCalledWith(
      "/organizations",
      expect.any(FormData),
      { headers: { "Idempotency-Key": expect.any(String) } }
    );
    expect(idempotencyKeyAt(0)).toBeTruthy();
    expect(result.production).toEqual({ id: 10, name: "Peter Eventos" });
    expect(result.organization).toBeUndefined();
  });

  test("reuses the same key after an uncertain network failure", async () => {
    appApiClient.post
      .mockRejectedValueOnce({ code: "ERR_NETWORK", message: "Network Error" })
      .mockResolvedValueOnce({ data: { organization: { id: 11, name: "Peter Eventos" } } });

    await expect(cutinappService.createProduction(productionPayload())).rejects.toMatchObject({ code: "ERR_NETWORK" });
    const firstKey = idempotencyKeyAt(0);

    await expect(cutinappService.createProduction(productionPayload())).resolves.toMatchObject({ production: { id: 11 } });

    expect(idempotencyKeyAt(1)).toBe(firstKey);
  });

  test("uses a fresh key after a definitive validation failure", async () => {
    appApiClient.post
      .mockRejectedValueOnce({ response: { status: 422 } })
      .mockResolvedValueOnce({ data: { organization: { id: 12, name: "Peter Eventos" } } });

    await expect(cutinappService.createProduction(productionPayload())).rejects.toMatchObject({ response: { status: 422 } });
    const rejectedKey = idempotencyKeyAt(0);

    await cutinappService.createProduction(productionPayload());

    expect(idempotencyKeyAt(1)).toBeTruthy();
    expect(idempotencyKeyAt(1)).not.toBe(rejectedKey);
  });
});

describe("CutinappService courtesy claim idempotency", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  test("sends an idempotency key when claiming a courtesy", async () => {
    appApiClient.post.mockResolvedValueOnce({ data: { pass: { id: 31 } } });

    await expect(cutinappService.claimCourtesy(44)).resolves.toEqual({ pass: { id: 31 } });

    expect(appApiClient.post).toHaveBeenCalledWith(
      "/passes/claim/44",
      undefined,
      { headers: { "Idempotency-Key": expect.any(String) } }
    );
  });

  test("reuses the same key after an uncertain network failure", async () => {
    appApiClient.post
      .mockRejectedValueOnce({ code: "ERR_NETWORK", message: "Network Error" })
      .mockResolvedValueOnce({ data: { pass: { id: 32 } } });

    await expect(cutinappService.claimCourtesy(45)).rejects.toMatchObject({ code: "ERR_NETWORK" });
    const firstKey = idempotencyKeyAt(0);

    await expect(cutinappService.claimCourtesy(45)).resolves.toEqual({ pass: { id: 32 } });
    expect(idempotencyKeyAt(1)).toBe(firstKey);
  });

  test("uses a fresh key after a definitive claim failure", async () => {
    appApiClient.post
      .mockRejectedValueOnce({ response: { status: 422 } })
      .mockResolvedValueOnce({ data: { pass: { id: 33 } } });

    await expect(cutinappService.claimCourtesy(46)).rejects.toMatchObject({ response: { status: 422 } });
    const rejectedKey = idempotencyKeyAt(0);

    await cutinappService.claimCourtesy(46);
    expect(idempotencyKeyAt(1)).toBeTruthy();
    expect(idempotencyKeyAt(1)).not.toBe(rejectedKey);
  });

  test("deduplicates concurrent claims for the same ticket", async () => {
    let resolveClaim;
    appApiClient.post.mockImplementationOnce(() => new Promise((resolve) => { resolveClaim = resolve; }));

    const first = cutinappService.claimCourtesy(47);
    const second = cutinappService.claimCourtesy(47);

    expect(first).toBe(second);
    expect(appApiClient.post).toHaveBeenCalledTimes(1);

    resolveClaim({ data: { pass: { id: 34 } } });
    await expect(first).resolves.toEqual({ pass: { id: 34 } });
  });
});

describe("CutinappService courtesy lifecycle idempotency", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  test("sends an idempotency key when updating a courtesy", async () => {
    appApiClient.patch.mockResolvedValueOnce({ data: { ticket: { id: 61, quantity: 2 } } });
    await expect(cutinappService.updateCourtesy(61, { quantity: 2 })).resolves.toEqual({ ticket: { id: 61, quantity: 2 } });
    expect(appApiClient.patch).toHaveBeenCalledWith(
      "/tickets/61",
      { quantity: 2 },
      { headers: { "Idempotency-Key": expect.any(String) } }
    );
  });

  test("reuses the update key after an ambiguous network failure", async () => {
    appApiClient.patch
      .mockRejectedValueOnce({ code: "ERR_NETWORK", message: "Network Error" })
      .mockResolvedValueOnce({ data: { ticket: { id: 62, quantity: 3 } } });
    await expect(cutinappService.updateCourtesy(62, { quantity: 3 })).rejects.toMatchObject({ code: "ERR_NETWORK" });
    const firstKey = appApiClient.patch.mock.calls[0][2].headers["Idempotency-Key"];
    await expect(cutinappService.updateCourtesy(62, { quantity: 3 })).resolves.toEqual({ ticket: { id: 62, quantity: 3 } });
    expect(appApiClient.patch.mock.calls[1][2].headers["Idempotency-Key"]).toBe(firstKey);
  });

  test("uses a fresh update key after a definitive validation failure", async () => {
    appApiClient.patch
      .mockRejectedValueOnce({ response: { status: 422 } })
      .mockResolvedValueOnce({ data: { ticket: { id: 63 } } });
    await expect(cutinappService.updateCourtesy(63, { quantity: 0 })).rejects.toMatchObject({ response: { status: 422 } });
    const rejectedKey = appApiClient.patch.mock.calls[0][2].headers["Idempotency-Key"];
    await cutinappService.updateCourtesy(63, { quantity: 0 });
    expect(appApiClient.patch.mock.calls[1][2].headers["Idempotency-Key"]).not.toBe(rejectedKey);
  });

  test("reuses the delete key after an ambiguous network failure", async () => {
    appApiClient.delete
      .mockRejectedValueOnce({ code: "ERR_NETWORK", message: "Network Error" })
      .mockResolvedValueOnce({ data: { deleted: true } });
    await expect(cutinappService.deleteCourtesy(64)).rejects.toMatchObject({ code: "ERR_NETWORK" });
    const firstKey = appApiClient.delete.mock.calls[0][1].headers["Idempotency-Key"];
    await expect(cutinappService.deleteCourtesy(64)).resolves.toEqual({ deleted: true });
    expect(appApiClient.delete.mock.calls[1][1].headers["Idempotency-Key"]).toBe(firstKey);
  });

  test("deduplicates concurrent courtesy deletion requests", async () => {
    let resolveDelete;
    appApiClient.delete.mockImplementationOnce(() => new Promise((resolve) => { resolveDelete = resolve; }));
    const first = cutinappService.deleteCourtesy(65);
    const second = cutinappService.deleteCourtesy(65);
    expect(first).toBe(second);
    expect(appApiClient.delete).toHaveBeenCalledTimes(1);
    resolveDelete({ data: { deleted: true } });
    await expect(first).resolves.toEqual({ deleted: true });
  });
});

describe("CutinappService pass transfer idempotency", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  test("sends an idempotency key and normalizes the recipient email", async () => {
    appApiClient.post.mockResolvedValueOnce({ data: { pass: { id: 51 } } });

    await expect(cutinappService.transferPass(50, " User@Example.COM ")).resolves.toEqual({ pass: { id: 51 } });

    expect(appApiClient.post).toHaveBeenCalledWith(
      "/passes/50/transfer",
      { recipient_email: "user@example.com" },
      { headers: { "Idempotency-Key": expect.any(String) } }
    );
  });

  test("reuses the same key after an uncertain network failure", async () => {
    appApiClient.post
      .mockRejectedValueOnce({ code: "ERR_NETWORK", message: "Network Error" })
      .mockResolvedValueOnce({ data: { pass: { id: 52 } } });

    await expect(cutinappService.transferPass(51, "user@example.com")).rejects.toMatchObject({ code: "ERR_NETWORK" });
    const firstKey = idempotencyKeyAt(0);

    await expect(cutinappService.transferPass(51, "USER@example.com")).resolves.toEqual({ pass: { id: 52 } });
    expect(idempotencyKeyAt(1)).toBe(firstKey);
  });

  test("uses a fresh key after a definitive transfer failure", async () => {
    appApiClient.post
      .mockRejectedValueOnce({ response: { status: 422 } })
      .mockResolvedValueOnce({ data: { pass: { id: 53 } } });

    await expect(cutinappService.transferPass(52, "user@example.com")).rejects.toMatchObject({ response: { status: 422 } });
    const rejectedKey = idempotencyKeyAt(0);

    await cutinappService.transferPass(52, "user@example.com");
    expect(idempotencyKeyAt(1)).toBeTruthy();
    expect(idempotencyKeyAt(1)).not.toBe(rejectedKey);
  });

  test("deduplicates equivalent concurrent transfers", async () => {
    let resolveTransfer;
    appApiClient.post.mockImplementationOnce(() => new Promise((resolve) => { resolveTransfer = resolve; }));

    const first = cutinappService.transferPass(53, "user@example.com");
    const second = cutinappService.transferPass(53, " USER@example.com ");

    expect(first).toBe(second);
    expect(appApiClient.post).toHaveBeenCalledTimes(1);

    resolveTransfer({ data: { pass: { id: 54 } } });
    await expect(first).resolves.toEqual({ pass: { id: 54 } });
  });
});

describe("CutinappService check-in idempotency", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  test("sends an idempotency key and normalizes scanner input", async () => {
    appApiClient.post.mockResolvedValueOnce({ data: { pass: { id: 71, checked_in_at: "2026-09-07T10:00:00Z" } } });

    await expect(cutinappService.checkIn("  qr-token-71  ", "42")).resolves.toMatchObject({ pass: { id: 71 } });

    expect(appApiClient.post).toHaveBeenCalledWith(
      "/checkin",
      { token: "qr-token-71", event_id: 42 },
      { headers: { "Idempotency-Key": expect.any(String) } }
    );
  });

  test("reuses the same key after an uncertain network failure", async () => {
    appApiClient.post
      .mockRejectedValueOnce({ code: "ERR_NETWORK", message: "Network Error" })
      .mockResolvedValueOnce({ data: { pass: { id: 72 } } });

    await expect(cutinappService.checkIn("qr-token-72", 42)).rejects.toMatchObject({ code: "ERR_NETWORK" });
    const firstKey = idempotencyKeyAt(0);

    await expect(cutinappService.checkIn(" qr-token-72 ", "42")).resolves.toEqual({ pass: { id: 72 } });
    expect(idempotencyKeyAt(1)).toBe(firstKey);
  });

  test("uses a fresh key after a definitive validation failure", async () => {
    appApiClient.post
      .mockRejectedValueOnce({ response: { status: 422 } })
      .mockResolvedValueOnce({ data: { pass: { id: 73 } } });

    await expect(cutinappService.checkIn("qr-token-73", 42)).rejects.toMatchObject({ response: { status: 422 } });
    const rejectedKey = idempotencyKeyAt(0);

    await cutinappService.checkIn("qr-token-73", 42);
    expect(idempotencyKeyAt(1)).toBeTruthy();
    expect(idempotencyKeyAt(1)).not.toBe(rejectedKey);
  });

  test("deduplicates concurrent scans for the same event and token", async () => {
    let resolveCheckIn;
    appApiClient.post.mockImplementationOnce(() => new Promise((resolve) => { resolveCheckIn = resolve; }));

    const first = cutinappService.checkIn("qr-token-74", 42);
    const second = cutinappService.checkIn(" qr-token-74 ", "42");

    expect(first).toBe(second);
    expect(appApiClient.post).toHaveBeenCalledTimes(1);

    resolveCheckIn({ data: { pass: { id: 74 } } });
    await expect(first).resolves.toEqual({ pass: { id: 74 } });
  });

  test("keeps separate attempts for the same token on different events", async () => {
    appApiClient.post
      .mockResolvedValueOnce({ data: { pass: { id: 75 } } })
      .mockResolvedValueOnce({ data: { pass: { id: 76 } } });

    await cutinappService.checkIn("shared-token", 42);
    await cutinappService.checkIn("shared-token", 43);

    expect(idempotencyKeyAt(0)).toBeTruthy();
    expect(idempotencyKeyAt(1)).toBeTruthy();
    expect(idempotencyKeyAt(1)).not.toBe(idempotencyKeyAt(0));
  });
});

describe("CutinappService producer contract signing idempotency", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  test("sends an idempotency key when signing a producer agreement", async () => {
    appApiClient.post.mockResolvedValueOnce({ data: { agreement: { id: 91, status: "signed" } } });

    await expect(cutinappService.signProducerContract(12, { accepted: true, version: "v3" }))
      .resolves.toEqual({ agreement: { id: 91, status: "signed" } });

    expect(appApiClient.post).toHaveBeenCalledWith(
      "/organizations/12/agreement/sign",
      { accepted: true, version: "v3" },
      { headers: { "Idempotency-Key": expect.any(String) } }
    );
  });

  test("reuses the same key after an uncertain network failure", async () => {
    appApiClient.post
      .mockRejectedValueOnce({ code: "ERR_NETWORK", message: "Network Error" })
      .mockResolvedValueOnce({ data: { agreement: { id: 92, status: "signed" } } });

    const payload = { accepted: true, version: "v3" };
    await expect(cutinappService.signProducerContract(12, payload)).rejects.toMatchObject({ code: "ERR_NETWORK" });
    const firstKey = idempotencyKeyAt(0);

    await expect(cutinappService.signProducerContract("12", { version: "v3", accepted: true }))
      .resolves.toMatchObject({ agreement: { id: 92 } });
    expect(idempotencyKeyAt(1)).toBe(firstKey);
  });

  test("uses a fresh key after a definitive validation failure", async () => {
    appApiClient.post
      .mockRejectedValueOnce({ response: { status: 422 } })
      .mockResolvedValueOnce({ data: { agreement: { id: 93, status: "signed" } } });

    await expect(cutinappService.signProducerContract(13, { accepted: true })).rejects.toMatchObject({ response: { status: 422 } });
    const rejectedKey = idempotencyKeyAt(0);

    await cutinappService.signProducerContract(13, { accepted: true });
    expect(idempotencyKeyAt(1)).toBeTruthy();
    expect(idempotencyKeyAt(1)).not.toBe(rejectedKey);
  });

  test("deduplicates equivalent concurrent signing submissions", async () => {
    let resolveSign;
    appApiClient.post.mockImplementationOnce(() => new Promise((resolve) => { resolveSign = resolve; }));

    const first = cutinappService.signProducerContract(14, { accepted: true, version: "v4" });
    const second = cutinappService.signProducerContract("14", { version: "v4", accepted: true });

    expect(first).toBe(second);
    expect(appApiClient.post).toHaveBeenCalledTimes(1);

    resolveSign({ data: { agreement: { id: 94, status: "signed" } } });
    await expect(first).resolves.toMatchObject({ agreement: { id: 94 } });
  });
});