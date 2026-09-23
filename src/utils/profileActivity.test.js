import { deriveEventMemories, deriveMemoryTimeline, normalizeVisitedPlaces, relativeVisitBadge } from "./profileActivity";

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

  test("memory actions default to denied and only explicit API permission enables them", () => {
    const now = new Date("2026-09-22T12:00:00Z").getTime();
    const memories = deriveMemoryTimeline([
      { id: 1, title: "Sem permissão", end_date: "2026-09-20T12:00:00Z", photos: [{ url: "/a.jpg" }, {}], posts: [{ id: 9 }, {}] },
      { id: 2, title: "Com permissão", end_date: "2026-09-21T12:00:00Z", viewer_permissions: { can_review: true, can_publish: 1 }, viewer_rating: 5 },
    ], now);

    expect(memories[0]).toMatchObject({ id: 2, can_review: true, can_publish: true, rating: 5 });
    expect(memories[1]).toMatchObject({ id: 1, can_review: false, can_publish: false });
    expect(memories[1].photos).toHaveLength(1);
    expect(memories[1].publications).toHaveLength(1);
  });

  test("relative badges require explicit rank and a sufficient population", () => {
    expect(relativeVisitBadge({ rank: 1, population: 100 })).toBe("Top 1%");
    expect(relativeVisitBadge({ rank: 5, population: 100 })).toBe("Top 5%");
    expect(relativeVisitBadge({ rank: 10, population: 100 })).toBe("Top 10%");
    expect(relativeVisitBadge({ rank: 1, population: 20 })).toBeNull();
    expect(relativeVisitBadge({ rank: 0, population: 100 })).toBeNull();
    expect(relativeVisitBadge({ population: 100 })).toBeNull();
  });

  test("visited places require positive visit evidence and respect visibility", () => {
    const places = normalizeVisitedPlaces([
      { id: 1, name: "A", visits_count: 3, visit_rank: 3, visit_rank_population: 100, is_following: true },
      { id: 2, name: "B" },
      { id: 3, name: "C", checkins_count: 1, viewer_following: 1 },
      { id: 4, name: "D", visits_count: -1 },
      { id: 5, name: "E", visits_count: 0, is_following: true },
      { id: 6, name: "F", visits_count: 9, viewer_can_see: false },
      { id: 7, name: "G", visits_count: 8, visible: false },
    ]);

    expect(places).toHaveLength(2);
    expect(places[0]).toMatchObject({ id: 1, visits_count: 3, is_following: true, relative_badge: "Top 5%" });
    expect(places[1]).toMatchObject({ id: 3, visits_count: 1, is_following: true, relative_badge: null });
  });
});
