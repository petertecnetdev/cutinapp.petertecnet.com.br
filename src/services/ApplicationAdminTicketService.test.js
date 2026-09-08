import appApiClient from "./AppApiClient";
import applicationAdminTicketService from "./ApplicationAdminTicketService";

jest.mock("./AppApiClient", () => ({
  __esModule: true,
  default: { delete: jest.fn(), put: jest.fn() },
}));

const keyFrom = (config) => config?.headers?.["Idempotency-Key"];

beforeEach(() => {
  jest.clearAllMocks();
  window.sessionStorage.clear();
});

test("update sends an idempotency key", async () => {
  const payload = { name: "VIP", price: 25 };
  appApiClient.put.mockResolvedValueOnce({ data: { data: { id: 4, ...payload } } });
  const result = await applicationAdminTicketService.update(4, payload);
  expect(appApiClient.put.mock.calls[0][0]).toBe("/admin/tickets/4");
  expect(appApiClient.put.mock.calls[0][1]).toEqual(payload);
  expect(keyFrom(appApiClient.put.mock.calls[0][2])).toBeTruthy();
  expect(result.data.id).toBe(4);
});

test("remove sends an idempotency key", async () => {
  appApiClient.delete.mockResolvedValueOnce({ data: { message: "ok" } });
  await applicationAdminTicketService.remove(8);
  expect(appApiClient.delete.mock.calls[0][0]).toBe("/admin/tickets/8");
  expect(keyFrom(appApiClient.delete.mock.calls[0][1])).toBeTruthy();
});

test("remove reuses the attempt after an ambiguous failure", async () => {
  const ambiguous = Object.assign(new Error("Network Error"), { code: "ERR_NETWORK" });
  appApiClient.delete.mockRejectedValueOnce(ambiguous).mockResolvedValueOnce({ data: { message: "ok" } });
  await expect(applicationAdminTicketService.remove(8)).rejects.toThrow("Network Error");
  const firstKey = keyFrom(appApiClient.delete.mock.calls[0][1]);
  await applicationAdminTicketService.remove(8);
  expect(keyFrom(appApiClient.delete.mock.calls[1][1])).toBe(firstKey);
});
