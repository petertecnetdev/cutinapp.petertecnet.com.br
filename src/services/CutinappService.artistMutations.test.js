import appApiClient from "./AppApiClient";
import cutinappService from "./CutinappService";

jest.mock("./AppApiClient", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

const keyFrom = (config) => config?.headers?.["Idempotency-Key"];

beforeEach(() => {
  jest.clearAllMocks();
  window.sessionStorage.clear();
});

test("artist update sends an idempotency key", async () => {
  appApiClient.patch.mockResolvedValueOnce({ data: { artist: { id: 7 } } });
  await cutinappService.updateArtist("7", { name: "Nova Banda" });
  expect(appApiClient.patch.mock.calls[0][0]).toBe("/artists/7/managed");
  expect(keyFrom(appApiClient.patch.mock.calls[0][2])).toBeTruthy();
});

test("member deletion reuses the key after an ambiguous failure", async () => {
  const ambiguous = Object.assign(new Error("Network Error"), { code: "ERR_NETWORK" });
  appApiClient.delete.mockRejectedValueOnce(ambiguous).mockResolvedValueOnce({ data: { message: "ok" } });
  await expect(cutinappService.deleteArtistMember(4, 9)).rejects.toThrow("Network Error");
  const firstKey = keyFrom(appApiClient.delete.mock.calls[0][1]);
  await cutinappService.deleteArtistMember(4, 9);
  expect(keyFrom(appApiClient.delete.mock.calls[1][1])).toBe(firstKey);
});

test("different claim decisions receive different attempts", async () => {
  appApiClient.put.mockResolvedValue({ data: { ok: true } });
  await cutinappService.reviewArtistClaim(12, 5, { status: "approved" });
  await cutinappService.reviewArtistClaim(12, 5, { status: "rejected" });
  const firstKey = keyFrom(appApiClient.put.mock.calls[0][2]);
  const secondKey = keyFrom(appApiClient.put.mock.calls[1][2]);
  expect(firstKey).toBeTruthy();
  expect(secondKey).toBeTruthy();
  expect(secondKey).not.toBe(firstKey);
});

test("concurrent detach requests are coalesced", async () => {
  let resolveRequest;
  appApiClient.delete.mockImplementationOnce(() => new Promise((resolve) => { resolveRequest = resolve; }));
  const first = cutinappService.detachArtist(20, 3);
  const second = cutinappService.detachArtist(20, 3);
  expect(appApiClient.delete).toHaveBeenCalledTimes(1);
  resolveRequest({ data: { message: "ok" } });
  await Promise.all([first, second]);
});
