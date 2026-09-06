import appApiClient from "./AppApiClient";
import eventService from "./EventService";

jest.mock("./AppApiClient", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

describe("EventService store", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("imports active establishment items when the creation switch is enabled", async () => {
    const formData = new FormData();
    formData.append("title", "Evento");
    formData.append("use_production_items", "1");

    appApiClient.post.mockResolvedValue({ data: { event: { id: 42, is_published: false } } });
    appApiClient.put.mockResolvedValue({ data: { selected_count: 3 } });

    await expect(eventService.store(formData)).resolves.toEqual({
      event: { id: 42, is_published: false },
      catalog_import: { selected_count: 3 },
    });

    expect(appApiClient.post).toHaveBeenCalledWith("/events", formData);
    expect(appApiClient.put).toHaveBeenCalledWith("/events/42/catalog-items", {
      all_active: true,
      replace: true,
    });
  });

  test("keeps the created event when catalog import fails", async () => {
    const formData = new FormData();
    formData.append("use_production_items", "1");

    appApiClient.post.mockResolvedValue({ data: { event: { id: 77, is_published: false } } });
    appApiClient.put.mockRejectedValue(new Error("catalog unavailable"));

    const response = await eventService.store(formData);

    expect(response.event.id).toBe(77);
    expect(response.catalog_import_warning).toContain("catalog unavailable");
  });

  test("does not make an extra request when catalog import is disabled", async () => {
    const formData = new FormData();
    formData.append("use_production_items", "0");
    appApiClient.post.mockResolvedValue({ data: { event: { id: 10, is_published: false } } });

    await eventService.store(formData);

    expect(appApiClient.put).not.toHaveBeenCalled();
  });
});
