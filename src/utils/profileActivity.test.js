import { deriveEventMemories, deriveMemoryTimeline, normalizeVisitedPlaces, relativeVisitBadge } from "./profileActivity";

describe("profile activity evidence rules", () => {
  test("memories include only visible past event records and deduplicate ids", () => {
    const now = new Date("2026-09-22T12:00:00Z").getTime();
    const memories = deriveEventMemories([
      { id: 1, title: "Past", end_date: "2026-09-20T12:00:00Z" },
      { id: 1, title: "Duplicate", end_date: "2026-09-20T12:00:00Z" },
      { id: 2, title: "Future", end_date: "2026-09-25T12:00:00Z" },
      { id: 3, title: "Private", end_date: "2026-09-19T12:00:00Z", viewer_can_see: false },
      { id: 4, title: "Hidden", end_date: "2026-09-18T12:00:00Z", visible: false },
      { id: 5, title: "Private numeric", end_date: "2026-09-17T12:00:00Z", viewer_can_see: 0 },
      { id: 6, title: "Hidden serialized", end_date: "2026-09-16T12:00:00Z", visible: "0" },
      { title: "Missing id", end_date: "2026-09-19T12:00:00Z" },
    ], now);

    expect(memories.map((event) => event.id)).toEqual([1]);
  });

  test("memories accept portable SQL datetimes used by the API", () => {
    const now = new Date(2026, 8, 22, 12, 0, 0).getTime();
    const memories = deriveEventMemories([
      { id: 1, title: "SQL", end_date: "2026-09-20 22:30:00" },
      { id: 2, title: "SQL fractional", end_date: "2026-09-21 23:15:00.123456" },
      { id: 3, title: "Future SQL", end_date: "2026-09-25 12:00:00" },
    ], now);

    expect(memories.map((event) => event.id)).toEqual([2, 1]);
  });

  test("memories accept canonical event date aliases without losing timeline data", () => {
    const now = new Date("2026-09-23T12:00:00Z").getTime();
    const memories = deriveMemoryTimeline([
      { id: 1, title: "Ends at", starts_at: "2026-09-20T20:00:00Z", ends_at: "2026-09-20T23:00:00Z" },
      { id: 2, title: "Scheduled", scheduled_at: "2026-09-21T21:00:00Z" },
      { id: 3, title: "Future", starts_at: "2026-09-25T21:00:00Z" },
    ], now);

    expect(memories.map((event) => event.id)).toEqual([2, 1]);
    expect(memories[0]).toMatchObject({ start_date: "2026-09-21T21:00:00Z", end_date: null });
    expect(memories[1]).toMatchObject({ start_date: "2026-09-20T20:00:00Z", end_date: "2026-09-20T23:00:00Z" });
  });

  test("memory actions default to denied and private media stay hidden", () => {
    const now = new Date("2026-09-22T12:00:00Z").getTime();
    const memories = deriveMemoryTimeline([
      { id: 1, title: "Sem permissão", end_date: "2026-09-20T12:00:00Z", photos: [{ url: "/a.jpg" }, { url: "/private.jpg", viewer_can_see: false }, { path: "/hidden.jpg", visible: "0" }, "/legacy.jpg", {}], posts: [{ id: 9 }, { id: 10, viewer_can_see: false }, { id: 11, viewer_can_see: "0" }, {}] },
      { id: 2, title: "Com permissão", end_date: "2026-09-21T12:00:00Z", viewer_permissions: { can_review: true, can_publish: 1 }, viewer_rating: 5 },
      { id: 3, title: "Memória privada", end_date: "2026-09-19T12:00:00Z", viewer_can_see: false, can_review: true },
    ], now);

    expect(memories).toHaveLength(2);
    expect(memories[0]).toMatchObject({ id: 2, can_review: true, can_publish: true, rating: 5 });
    expect(memories[1]).toMatchObject({ id: 1, can_review: false, can_publish: false });
    expect(memories[1].photos).toEqual([{ url: "/a.jpg" }, "/legacy.jpg"]);
    expect(memories[1].publications).toHaveLength(1);
  });

  test("memory rating uses only visible viewer-specific review evidence", () => {
    const now = new Date("2026-09-23T12:00:00Z").getTime();
    const memories = deriveMemoryTimeline([
      { id: 1, end_date: "2026-09-20T12:00:00Z", rating: 4.8 },
      { id: 2, end_date: "2026-09-21T12:00:00Z", viewer_review: { rating: 4 }, rating: 4.9 },
      { id: 3, end_date: "2026-09-22T12:00:00Z", my_review: { rating: 3 }, rating: 5 },
      { id: 4, end_date: "2026-09-22T13:00:00Z", viewer_review: { rating: 2, viewer_can_see: false } },
      { id: 5, end_date: "2026-09-22T14:00:00Z", my_review: { rating: 1, visible: "0" } },
    ], now);

    expect(memories.find((memory) => memory.id === 1)?.rating).toBeNull();
    expect(memories.find((memory) => memory.id === 2)?.rating).toBe(4);
    expect(memories.find((memory) => memory.id === 3)?.rating).toBe(3);
    expect(memories.find((memory) => memory.id === 4)?.rating).toBeNull();
    expect(memories.find((memory) => memory.id === 5)?.rating).toBeNull();
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
      { id: 8, name: "H", visits_count: 7, viewer_can_see: 0 },
      { id: 9, name: "I", visits_count: 6, visible: "0" },
    ]);

    expect(places).toHaveLength(2);
    expect(places[0]).toMatchObject({ id: 1, visits_count: 3, is_following: true, relative_badge: "Top 5%" });
    expect(places[1]).toMatchObject({ id: 3, visits_count: 1, is_following: true, relative_badge: null });
  });
});
