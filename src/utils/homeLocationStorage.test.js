import {
  HOME_LOCATION_KEY,
  PRECISE_LOCATION_TTL_MS,
  clearHomeLocation,
  readHomeLocation,
  saveHomeLocation,
} from "./homeLocationStorage";

describe("homeLocationStorage", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    window.localStorage.clear();
  });

  test("persists precise coordinates with a bounded lifetime", () => {
    const now = 1_700_000_000_000;
    expect(saveHomeLocation({ lat: -16.686389, lng: -49.264721 }, now)).toBe(true);

    const stored = JSON.parse(window.localStorage.getItem(HOME_LOCATION_KEY));
    expect(stored.expiresAt).toBe(now + PRECISE_LOCATION_TTL_MS);
    expect(stored.value).toEqual({ lat: "-16.686389", lng: "-49.264721", mode: "nearby" });
    expect(readHomeLocation(now + 1000)).toEqual(stored.value);
  });

  test("removes expired precise coordinates", () => {
    const now = 1_700_000_000_000;
    saveHomeLocation({ lat: -16.686389, lng: -49.264721 }, now);

    expect(readHomeLocation(now + PRECISE_LOCATION_TTL_MS + 1)).toBeNull();
    expect(window.localStorage.getItem(HOME_LOCATION_KEY)).toBeNull();
  });

  test("keeps explicit city preferences without precise coordinates", () => {
    expect(saveHomeLocation({ city: "Goiânia", uf: "GO" }, 123)).toBe(true);
    expect(readHomeLocation(9_999_999_999_999)).toEqual({ city: "Goiânia", uf: "GO", mode: "city" });
  });

  test("migrates legacy precise payloads to expiring storage", () => {
    const now = 1_700_000_000_000;
    window.localStorage.setItem(HOME_LOCATION_KEY, JSON.stringify({ lat: "-16.686389", lng: "-49.264721", mode: "nearby" }));

    expect(readHomeLocation(now)).toEqual({ lat: "-16.686389", lng: "-49.264721", mode: "nearby" });
    const migrated = JSON.parse(window.localStorage.getItem(HOME_LOCATION_KEY));
    expect(migrated.expiresAt).toBe(now + PRECISE_LOCATION_TTL_MS);
  });

  test("rejects invalid coordinates and clears invalid stored payloads", () => {
    expect(saveHomeLocation({ lat: 95, lng: 200 })).toBe(false);
    window.localStorage.setItem(HOME_LOCATION_KEY, JSON.stringify({ value: { lat: 95, lng: 200 }, expiresAt: Date.now() + 1000 }));
    expect(readHomeLocation()).toBeNull();
    expect(window.localStorage.getItem(HOME_LOCATION_KEY)).toBeNull();
  });

  test("degrades safely when localStorage is blocked", () => {
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    expect(saveHomeLocation({ city: "Recife", uf: "PE" })).toBe(false);
  });

  test("clears location through resilient storage", () => {
    saveHomeLocation({ city: "Recife", uf: "PE" });
    expect(clearHomeLocation()).toBe(true);
    expect(readHomeLocation()).toBeNull();
  });
});
