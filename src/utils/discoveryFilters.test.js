import { paramsFromSearch } from "./discoveryFilters";

describe("discovery filter deep links", () => {
  test("preserves universal-search and event discovery filters from the URL", () => {
    const params = new URLSearchParams({
      q: "rock",
      type: "event",
      city: "Goiânia",
      uf: "GO",
      category: "music",
      genre: "rock",
      format: "in_person",
      period: "next7",
      free: "1",
      available: "1",
      max_price: "80",
      radius_km: "25",
      sort: "soonest",
    });

    expect(paramsFromSearch(params)).toEqual({
      q: "rock",
      type: "event",
      city: "Goiânia",
      uf: "GO",
      category: "music",
      genre: "rock",
      format: "in_person",
      period: "next7",
      sort: "soonest",
      free: "1",
      available: "1",
      max_price: "80",
      radius_km: "25",
    });
  });

  test("does not emit empty optional filters", () => {
    const params = new URLSearchParams("city=&genre=&max_price=&period=today");
    expect(paramsFromSearch(params)).toEqual({ period: "today" });
  });
});
