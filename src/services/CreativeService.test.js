import appApiClient from "./AppApiClient";
import creativeService from "./CreativeService";

jest.mock("./AppApiClient", () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() } }));

const input = () => ({
  title: "  Festival Noturno  ",
  description: "  Luzes e música  ",
  category: "  Eletrônico  ",
  artist: "  DJ Marco Roger  ",
  style: "  neon  ",
  intensity: "  impactful  ",
  productionName: "  Peter Produções  ",
  venue: "  Arena Central  ",
  city: "  Goiânia  ",
  uf: " go ",
  format: "  portrait  ",
  brandContext: "  Food | Music | Drinks  ",
  promotions: [" Mulheres FREE ", " Homens R$ 10 ", ""],
  featuredItems: [" Combo de vodka ", " Porção de frango "],
});

const keyAt = (index) => appApiClient.post.mock.calls[index]?.[2]?.headers?.["Idempotency-Key"];

describe("CreativeService flyer generation idempotency", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  test("normalizes the structured creative brief and sends an idempotency key", async () => {
    appApiClient.post.mockResolvedValueOnce({ data: { image_url: "https://example.test/flyer.webp" } });

    await creativeService.generateEventFlyerBackground(input());

    expect(appApiClient.post).toHaveBeenCalledWith("/creative/images", {
      purpose: "event_flyer_background",
      subject: "Festival Noturno",
      description: "Luzes e música",
      category: "Eletrônico",
      artist: "DJ Marco Roger",
      style: "neon",
      intensity: "impactful",
      production_name: "Peter Produções",
      venue: "Arena Central",
      city: "Goiânia",
      uf: "GO",
      format: "portrait",
      brand_context: "Food | Music | Drinks",
      promotions: ["Mulheres FREE", "Homens R$ 10"],
      featured_items: ["Combo de vodka", "Porção de frango"],
    }, { headers: { "Idempotency-Key": expect.any(String) } });
    expect(keyAt(0)).toBeTruthy();
  });

  test("loads the creative preset catalog from the central API", async () => {
    appApiClient.get.mockResolvedValueOnce({ data: { styles: [{ key: "automatic", label: "Automático" }] } });

    await expect(creativeService.getEventCreativePresets()).resolves.toEqual({
      styles: [{ key: "automatic", label: "Automático" }],
    });
    expect(appApiClient.get).toHaveBeenCalledWith("/creative/presets");
  });

  test("reuses the key after an uncertain network failure", async () => {
    appApiClient.post
      .mockRejectedValueOnce({ code: "ERR_NETWORK", message: "Network Error" })
      .mockResolvedValueOnce({ data: { image_url: "https://example.test/flyer.webp" } });

    await expect(creativeService.generateEventFlyerBackground(input())).rejects.toMatchObject({ code: "ERR_NETWORK" });
    const first = keyAt(0);

    await creativeService.generateEventFlyerBackground({ ...input(), uf: "GO" });
    expect(keyAt(1)).toBe(first);
  });

  test("uses a fresh key after a definitive validation failure", async () => {
    appApiClient.post
      .mockRejectedValueOnce({ response: { status: 422 } })
      .mockResolvedValueOnce({ data: { image_url: "https://example.test/flyer.webp" } });

    await expect(creativeService.generateEventFlyerBackground(input())).rejects.toMatchObject({ response: { status: 422 } });
    const rejected = keyAt(0);

    await creativeService.generateEventFlyerBackground(input());
    expect(keyAt(1)).not.toBe(rejected);
  });

  test("deduplicates concurrent equivalent generations", async () => {
    let resolveRequest;
    appApiClient.post.mockReturnValueOnce(new Promise((resolve) => { resolveRequest = resolve; }));

    const first = creativeService.generateEventFlyerBackground(input());
    const second = creativeService.generateEventFlyerBackground({ ...input(), title: "Festival Noturno", uf: "GO" });

    expect(second).toBe(first);
    expect(appApiClient.post).toHaveBeenCalledTimes(1);

    resolveRequest({ data: { image_url: "https://example.test/flyer.webp" } });
    await first;
  });
});
