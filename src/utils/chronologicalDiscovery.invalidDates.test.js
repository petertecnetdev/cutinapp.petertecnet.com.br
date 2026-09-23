import { chronologicalBucketFor, parsePortableEventDate } from "./chronologicalDiscovery";

describe("chronological discovery invalid calendar dates", () => {
  test.each([
    "2026-02-29",
    "2026-04-31",
    "2026-13-01",
    "2026-09-23 24:00:00",
    "2026-09-31 20:30:00.123456",
  ])("rejects impossible local calendar value %s", (value) => {
    expect(parsePortableEventDate(value)).toBeNull();
  });

  test("keeps a valid leap day", () => {
    const date = parsePortableEventDate("2028-02-29");
    expect(date).not.toBeNull();
    expect(date.getFullYear()).toBe(2028);
    expect(date.getMonth()).toBe(1);
    expect(date.getDate()).toBe(29);
  });

  test("routes an impossible API date to data a confirmar instead of another day", () => {
    expect(chronologicalBucketFor("2026-09-31", new Date(2026, 8, 23, 12))).toEqual({
      key: "unknown",
      title: "Data a confirmar",
      order: Number.MAX_SAFE_INTEGER,
    });
  });
});
