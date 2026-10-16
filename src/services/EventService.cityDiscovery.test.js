import appApiClient from "./AppApiClient";
import eventService from "./EventService";

jest.mock("./AppApiClient", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

describe("descoberta local não mistura cidades", () => {
  beforeEach(() => { jest.clearAllMocks(); window.localStorage.clear(); });
  test("eventos encontrados na cidade são retornados sem adicionar agenda global", async () => {
    appApiClient.get.mockResolvedValue({ data: { events: { data: [{ id: 1, city: "Goiânia", uf: "GO" }] } } });
    const response = await eventService.search({ city: "Goiânia", uf: "GO", per_page: 12, sort: "soonest" });
    expect(response.events.data).toEqual([{ id: 1, city: "Goiânia", uf: "GO" }]);
    expect(appApiClient.get).toHaveBeenCalledTimes(1);
  });
  test("cidade sem eventos não cai para cache global", async () => {
    appApiClient.get.mockResolvedValue({ data: { events: { data: [] } } });
    const response = await eventService.search({ city: "Curitiba", uf: "PR", per_page: 12, sort: "soonest" });
    expect(response.events.data).toEqual([]);
    expect(appApiClient.get).toHaveBeenCalledTimes(1);
  });
});
