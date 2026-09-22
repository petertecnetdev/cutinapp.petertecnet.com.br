import { deriveEventMemories, normalizeVisitedPlaces, relativeVisitBadge } from "./profileActivity";

describe("profile activity evidence rules", () => {
  test("memories include only authorized past event records and deduplicate ids", () => {
    const now = new Date("2026-09-22T12:00:00Z").getTime();
    const memories = deriveEventMemories([
      { id: 1, title: "Past", end_date: "2026-09-20T12:00:00Z" },
      { id: 1, title: "Duplicate", end_date: "2026-09-20T12:00:00Z" },
      { id: 2, title: "Future", end_date: "2026-09-25T12:00:00Z" },
      { title: "Missing id", end_date: "2026-09-19T12:00:00Z" },
    ], now);

    expect(memories.map((event) => event.id)).toEqual([1]);
  });

  test("relative badges require explicit rank and a sufficient population", () => {
    expect(relativeVisitBadge({ rank: 1, population: 100 })).toBe("Top 1%");
    expect(relativeVisitBadge({ rank: 5, population: 100 })).toBe("Top 5%");
    expect(relativeVisitBadge({ rank: 10, population: 100 })).toBe("Top 10%");
    expect(relativeVisitBadge({ rank: 1, population: 20 })).toBeNull();
    expect(relativeVisitBadge({ rank: 0, population: 100 })).toBeNull();
    expect(relativeVisitBadge({ population: 100 })).toBeNull();
  });

  test("visited places never infer a visit count", () => {
    const places = normalizeVisitedPlaces([
      { id: 1, name: "A", visits_count: 3, visit_rank: 3, visit_rank_population: 100 },
      { id: 2, name: "B" },
      { id: 3, name: "C", checkins_count: 1 },
      { id: 4, name: "D", visits_count: -1 },
    ]);

    expect(places).toHaveLength(2);
    expect(places[0]).toMatchObject({ id: 1, visits_count: 3, relative_badge: "Top 5%" });
    expect(places[1]).toMatchObject({ id: 3, visits_count: 1, relative_badge: null });
  });
});
