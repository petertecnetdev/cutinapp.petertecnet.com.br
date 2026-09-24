import { deriveMemoryTimeline, normalizeVisitedPlaces } from "./profileActivity";

describe("profile activity serialized privacy flags", () => {
  test("serialized false visibility never exposes memory content", () => {
    const now = new Date("2026-09-23T12:00:00Z").getTime();
    const memories = deriveMemoryTimeline([
      { id: 1, end_date: "2026-09-20T12:00:00Z", viewer_can_see: "false" },
      { id: 2, end_date: "2026-09-21T12:00:00Z", visible: " FALSE " },
      {
        id: 3,
        end_date: "2026-09-22T12:00:00Z",
        photos: [{ url: "/private.jpg", viewer_can_see: "false" }],
        posts: [{ id: 30, visible: "false" }],
      },
    ], now);

    expect(memories).toHaveLength(1);
    expect(memories[0]).toMatchObject({ id: 3, photos: [], publications: [] });
  });

  test("serialized permission booleans remain explicit and scoped", () => {
    const now = new Date("2026-09-23T12:00:00Z").getTime();
    const [memory] = deriveMemoryTimeline([
      {
        id: 4,
        end_date: "2026-09-22T12:00:00Z",
        viewer_permissions: { can_review: "true", can_publish: " false " },
      },
    ], now);

    expect(memory).toMatchObject({ can_review: true, can_publish: false });
  });

  test("serialized false visibility excludes visited places", () => {
    const places = normalizeVisitedPlaces([
      { id: 1, name: "Private", visits_count: 8, viewer_can_see: "false" },
      { id: 2, name: "Hidden", visits_count: 5, visible: "FALSE" },
      { id: 3, name: "Visible", visits_count: 2, viewer_following: "true" },
    ]);

    expect(places).toHaveLength(1);
    expect(places[0]).toMatchObject({ id: 3, visits_count: 2, is_following: true });
  });

  test("boolean and object values never become visit or rating metrics", () => {
    const now = new Date("2026-09-23T12:00:00Z").getTime();
    const memories = deriveMemoryTimeline([
      { id: 10, end_date: "2026-09-22T12:00:00Z", viewer_rating: true },
      { id: 11, end_date: "2026-09-22T13:00:00Z", viewer_rating: { value: 5 } },
      { id: 12, end_date: "2026-09-22T14:00:00Z", viewer_rating: "4" },
    ], now);
    const places = normalizeVisitedPlaces([
      { id: 20, name: "Boolean visit", visits_count: true },
      { id: 21, name: "Object visit", visits_count: { value: 3 } },
      { id: 22, name: "Numeric string", visits_count: "2" },
    ]);

    expect(memories.find((memory) => memory.id === 10)?.rating).toBeNull();
    expect(memories.find((memory) => memory.id === 11)?.rating).toBeNull();
    expect(memories.find((memory) => memory.id === 12)?.rating).toBe(4);
    expect(places).toHaveLength(1);
    expect(places[0]).toMatchObject({ id: 22, visits_count: 2 });
  });
});
