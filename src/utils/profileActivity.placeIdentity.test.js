import { normalizeVisitedPlaces } from "./profileActivity";

describe("visited place identity integrity", () => {
  test("does not expose anonymous aggregate rows as places", () => {
    expect(normalizeVisitedPlaces([
      { visits_count: 9, visit_rank: 1, visit_rank_population: 200 },
    ])).toEqual([]);
  });

  test("keeps explicit generic place identities and verified visit evidence", () => {
    expect(normalizeVisitedPlaces([
      { slug: "casa-azul", name: "Casa Azul", checkins_count: 3, viewer_following: true },
    ])).toEqual([
      expect.objectContaining({
        slug: "casa-azul",
        visits_count: 3,
        is_following: true,
      }),
    ]);
  });
});
