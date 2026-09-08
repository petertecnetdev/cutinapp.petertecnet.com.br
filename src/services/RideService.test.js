import appApiClient from "./AppApiClient";
import rideService from "./RideService";

jest.mock("./AppApiClient", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

const headerKey = (config) => config?.headers?.["Idempotency-Key"];

beforeEach(() => {
  jest.clearAllMocks();
  window.sessionStorage.clear();
});

test("create sends an idempotency key and reuses it after an ambiguous failure", async () => {
  const payload = { kind: "offer", origin_city: "Goiânia", departure_at: "2026-09-08T20:00", seats: 2 };
  const ambiguous = Object.assign(new Error("Network Error"), { code: "ERR_NETWORK" });
  appApiClient.post.mockRejectedValueOnce(ambiguous).mockResolvedValueOnce({ data: { id: 14 } });

  await expect(rideService.create(42, payload)).rejects.toThrow("Network Error");
  const firstKey = headerKey(appApiClient.post.mock.calls[0][2]);
  expect(firstKey).toBeTruthy();

  await expect(rideService.create(42, payload)).resolves.toEqual({ id: 14 });
  expect(headerKey(appApiClient.post.mock.calls[1][2])).toBe(firstKey);
});

test("requestSeat coalesces concurrent equivalent requests", async () => {
  let resolveRequest;
  appApiClient.post.mockImplementationOnce(() => new Promise((resolve) => { resolveRequest = resolve; }));

  const first = rideService.requestSeat(9, { seats: 1 });
  const second = rideService.requestSeat(9, { seats: 1 });
  expect(appApiClient.post).toHaveBeenCalledTimes(1);

  resolveRequest({ data: { status: "pending" } });
  await expect(first).resolves.toEqual({ status: "pending" });
  await expect(second).resolves.toEqual({ status: "pending" });
  expect(headerKey(appApiClient.post.mock.calls[0][2])).toBeTruthy();
});

test("respond isolates accepted and rejected decisions", async () => {
  appApiClient.patch
    .mockResolvedValueOnce({ data: { status: "accepted" } })
    .mockResolvedValueOnce({ data: { status: "rejected" } });

  await rideService.respond(7, 31, "accepted");
  await rideService.respond(7, 31, "rejected");

  expect(appApiClient.patch.mock.calls[0][0]).toBe("/rides/7/requests/31");
  expect(appApiClient.patch.mock.calls[0][1]).toEqual({ status: "accepted" });
  expect(appApiClient.patch.mock.calls[1][1]).toEqual({ status: "rejected" });
  expect(headerKey(appApiClient.patch.mock.calls[0][2])).not.toBe(headerKey(appApiClient.patch.mock.calls[1][2]));
});

test("cancel sends an idempotency key", async () => {
  appApiClient.delete.mockResolvedValueOnce({ data: { status: "cancelled" } });

  await expect(rideService.cancel(5)).resolves.toEqual({ status: "cancelled" });
  expect(appApiClient.delete.mock.calls[0][0]).toBe("/rides/5");
  expect(headerKey(appApiClient.delete.mock.calls[0][1])).toBeTruthy();
});
