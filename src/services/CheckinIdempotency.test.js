import appApiClient from "./AppApiClient";
import cutinappService from "./CutinappService";

jest.mock("./AppApiClient", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

const keyAt = (index) => appApiClient.post.mock.calls[index]?.[2]?.headers?.["Idempotency-Key"];

describe("CutinappService check-in idempotency", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  test("sends an idempotency key without persisting the QR token", async () => {
    appApiClient.post.mockResolvedValueOnce({ data: { pass: { id: 71 } } });
    await expect(cutinappService.checkIn(" QR-SECRET-123 ", 80)).resolves.toMatchObject({ pass: { id: 71 } });
    expect(appApiClient.post).toHaveBeenCalledWith("/checkin", { token: "QR-SECRET-123", event_id: 80 }, { headers: { "Idempotency-Key": expect.any(String) } });
    expect(JSON.stringify(sessionStorage)).not.toContain("QR-SECRET-123");
  });

  test("reuses the same key after an uncertain network failure", async () => {
    appApiClient.post.mockRejectedValueOnce({ code: "ERR_NETWORK" }).mockResolvedValueOnce({ data: { pass: { id: 72 } } });
    await expect(cutinappService.checkIn("QR-72", 80)).rejects.toMatchObject({ code: "ERR_NETWORK" });
    const firstKey = keyAt(0);
    await expect(cutinappService.checkIn("QR-72", 80)).resolves.toMatchObject({ pass: { id: 72 } });
    expect(keyAt(1)).toBe(firstKey);
  });

  test("uses a fresh key after a definitive validation failure", async () => {
    appApiClient.post.mockRejectedValueOnce({ response: { status: 422 } }).mockResolvedValueOnce({ data: { pass: { id: 73 } } });
    await expect(cutinappService.checkIn("QR-73", 80)).rejects.toMatchObject({ response: { status: 422 } });
    const rejectedKey = keyAt(0);
    await cutinappService.checkIn("QR-73", 80);
    expect(keyAt(1)).not.toBe(rejectedKey);
  });

  test("deduplicates concurrent scans of the same QR and event", async () => {
    let resolveCheckIn;
    appApiClient.post.mockImplementationOnce(() => new Promise((resolve) => { resolveCheckIn = resolve; }));
    const first = cutinappService.checkIn("QR-74", 80);
    const second = cutinappService.checkIn(" QR-74 ", "80");
    expect(first).toBe(second);
    expect(appApiClient.post).toHaveBeenCalledTimes(1);
    resolveCheckIn({ data: { pass: { id: 74 } } });
    await expect(first).resolves.toMatchObject({ pass: { id: 74 } });
  });
});