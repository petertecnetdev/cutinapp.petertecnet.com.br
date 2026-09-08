import appApiClient from "./AppApiClient";
import applicationAdminEventService from "./ApplicationAdminEventService";

jest.mock("./AppApiClient", () => ({
  __esModule: true,
  default: { delete: jest.fn() },
}));

const keyFrom = (config) => config?.headers?.["Idempotency-Key"];

beforeEach(() => {
  jest.clearAllMocks();
  window.sessionStorage.clear();
});

test("remove sends an idempotency key", async () => {
  appApiClient.delete.mockResolvedValueOnce({ data: { message: "ok" } });
  const result = await applicationAdminEventService.remove(8);
  expect(appApiClient.delete.mock.calls[0][0]).toBe("/events/8");
  expect(keyFrom(appApiClient.delete.mock.calls[0][1])).toBeTruthy();
  expect(result.message).toBe("ok");
});

test("remove reuses the attempt after an ambiguous failure", async () => {
  const ambiguous = Object.assign(new Error("Network Error"), { code: "ERR_NETWORK" });
  appApiClient.delete.mockRejectedValueOnce(ambiguous).mockResolvedValueOnce({ data: { message: "ok" } });
  await expect(applicationAdminEventService.remove(8)).rejects.toThrow("Network Error");
  const firstKey = keyFrom(appApiClient.delete.mock.calls[0][1]);
  await applicationAdminEventService.remove(8);
  expect(keyFrom(appApiClient.delete.mock.calls[1][1])).toBe(firstKey);
});

test("bulk remove normalizes ids and sends an idempotency key", async () => {
  appApiClient.delete.mockResolvedValueOnce({ data: { deleted_count: 2 } });
  const result = await applicationAdminEventService.removeMany([9, 3, 9]);
  expect(appApiClient.delete.mock.calls[0][0]).toBe("/admin/events");
  expect(appApiClient.delete.mock.calls[0][1].data).toEqual({ ids: [3, 9] });
  expect(keyFrom(appApiClient.delete.mock.calls[0][1])).toBeTruthy();
  expect(result.deleted_count).toBe(2);
});

test("bulk remove coalesces concurrent equivalent requests", async () => {
  let resolveRequest;
  appApiClient.delete.mockImplementationOnce(() => new Promise((resolve) => { resolveRequest = resolve; }));
  const first = applicationAdminEventService.removeMany([4, 2]);
  const second = applicationAdminEventService.removeMany([2, 4, 4]);
  expect(appApiClient.delete).toHaveBeenCalledTimes(1);
  resolveRequest({ data: { deleted_count: 2 } });
  await expect(first).resolves.toEqual({ deleted_count: 2 });
  await expect(second).resolves.toEqual({ deleted_count: 2 });
});
